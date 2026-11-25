import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  type Clique,
  type EsperaControle,
  type EsperaItem,
  type Evento,
  type Lead,
  type Mensagem,
  type Settings,
  SETTINGS_PADRAO,
  origemVazia,
  perfilVazio,
} from './types';
import {
  bancoConfigurado,
  carregarDoBanco,
  carregarEsperaDoBanco,
  carregarLojasDoBanco,
  espelharClique,
  espelharEspera,
  espelharEvento,
  espelharLead,
  espelharMensagem,
  espelharSettings,
  removerEsperaDoBanco,
  removerLeadDoBanco,
} from './remote';

/**
 * Store local em arquivos (JSON + JSONL), em memória + persistência.
 * Premissa: UMA instância do servidor (VPS/Docker com volume em DATA_DIR),
 * a mesma premissa do data/estoque.json já existente.
 */

const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(process.cwd(), 'data', 'runtime');

interface State {
  leads: Map<string, Lead>;
  porTelefone: Map<string, string>;
  mensagens: Map<string, Mensagem[]>;
  waIds: Set<string>;
  eventos: Evento[];
  cliques: Map<string, Clique>;
  settings: Settings;
  espera: Map<string, EsperaItem>;
  esperaControle: EsperaControle;
  timers: Record<string, NodeJS.Timeout | undefined>;
}

/**
 * Leads gravados antes do Agente Roteador recebiam loja logo no 1º contato.
 * Regra nova: loja só depois da triagem. Lead já qualificado/notificado é considerado roteado;
 * os demais voltam para a triagem e a loja vira apenas uma sugestão. Idempotente.
 */
export function normalizarLeadLegado(l: Lead): Lead {
  if (l.roteadoEm === undefined) {
    const jaPassou = Boolean(l.qualificadoEm || l.lojaNotificadaEm);
    if (l.lojaSlug && jaPassou) {
      l.roteadoEm = l.qualificadoEm ?? l.lojaNotificadaEm;
      l.roteamentoMotivo = l.roteamentoMotivo || 'legado';
    } else {
      l.roteadoEm = null;
      if (l.lojaSlug) {
        l.lojaSugerida = l.lojaSugerida ?? l.lojaSlug;
        l.lojaSlug = null;
      }
    }
  }
  l.lojaSugerida ??= null;
  l.roteamentoMotivo ??= '';
  l.esperaAviso ??= null;
  return l;
}

const g = globalThis as unknown as { __feiraoStore?: State };

function file(name: string): string {
  return path.join(DATA_DIR, name);
}

function readJson<T>(name: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(file(name), 'utf8')) as T;
  } catch {
    return fallback;
  }
}

function readJsonl<T>(name: string): T[] {
  try {
    return fs
      .readFileSync(file(name), 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l) as T);
  } catch {
    return [];
  }
}

function writeAtomic(name: string, data: unknown): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = file(`${name}.${process.pid}.tmp`);
  fs.writeFileSync(tmp, JSON.stringify(data), 'utf8');
  fs.renameSync(tmp, file(name));
}

function appendJsonl(name: string, row: unknown): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.appendFileSync(file(name), JSON.stringify(row) + '\n', 'utf8');
}

function state(): State {
  if (g.__feiraoStore) return g.__feiraoStore;

  const leads = new Map<string, Lead>();
  const porTelefone = new Map<string, string>();
  for (const l of readJson<Lead[]>('leads.json', [])) {
    normalizarLeadLegado(l);
    leads.set(l.id, l);
    porTelefone.set(l.telefone, l.id);
  }

  const mensagens = new Map<string, Mensagem[]>();
  const waIds = new Set<string>();
  for (const m of readJsonl<Mensagem>('mensagens.jsonl')) {
    const arr = mensagens.get(m.leadId) ?? [];
    arr.push(m);
    mensagens.set(m.leadId, arr);
    if (m.waId) waIds.add(m.waId);
  }

  const cliques = new Map<string, Clique>();
  for (const c of readJson<Clique[]>('cliques.json', [])) cliques.set(c.sid, c);

  g.__feiraoStore = {
    leads,
    porTelefone,
    mensagens,
    waIds,
    eventos: readJsonl<Evento>('eventos.jsonl'),
    cliques,
    settings: { ...SETTINGS_PADRAO, ...readJson<Partial<Settings>>('settings.json', {}) },
    espera: new Map(readJson<EsperaItem[]>('lista_espera.json', []).map((e) => [e.id, e])),
    esperaControle: readJson<EsperaControle>('espera_controle.json', { conhecidos: [], pendentes: [], ultimaVerificacao: null }),
    timers: {},
  };
  return g.__feiraoStore;
}

function schedule(key: 'leads' | 'cliques' | 'espera'): void {
  const s = state();
  if (s.timers[key]) return;
  s.timers[key] = setTimeout(() => {
    s.timers[key] = undefined;
    try {
      if (key === 'leads') writeAtomic('leads.json', [...s.leads.values()]);
      else if (key === 'espera') {
        writeAtomic('lista_espera.json', [...s.espera.values()]);
        writeAtomic('espera_controle.json', s.esperaControle);
      } else writeAtomic('cliques.json', [...s.cliques.values()]);
    } catch (e) {
      console.error('[store] falha ao persistir', key, e);
    }
  }, 250);
}

const nowIso = () => new Date().toISOString();

// ───────────────────────── Leads ─────────────────────────

export function normalizarTelefone(raw: string): string {
  let d = (raw || '').replace(/\D/g, '').replace(/^0+/, '');
  // remove sufixo de JID, se vier
  if (d.length >= 10 && d.length <= 11) d = `55${d}`;
  return d;
}

/**
 * Variação do 9º dígito: WhatsApp às vezes entrega 55DD8XXXXXXX (sem o 9).
 * Gera as duas variantes para casar o mesmo contato.
 */
function variantesTelefone(tel: string): string[] {
  const out = [tel];
  if (tel.startsWith('55')) {
    const ddd = tel.slice(2, 4);
    const resto = tel.slice(4);
    if (resto.length === 9 && resto.startsWith('9')) out.push(`55${ddd}${resto.slice(1)}`);
    if (resto.length === 8) out.push(`55${ddd}9${resto}`);
  }
  return out;
}

export function listLeads(): Lead[] {
  return [...state().leads.values()];
}

export function getLead(id: string): Lead | undefined {
  return state().leads.get(id);
}

export function findLeadByTelefone(raw: string): Lead | undefined {
  const s = state();
  for (const v of variantesTelefone(normalizarTelefone(raw))) {
    const id = s.porTelefone.get(v);
    if (id) return s.leads.get(id);
  }
  return undefined;
}

export function createLead(input: Partial<Lead> & { telefone: string }): Lead {
  const { telefone: telBruto, ...resto } = input;
  const s = state();
  const ts = nowIso();
  const lead: Lead = {
    id: randomUUID(),
    telefone: normalizarTelefone(telBruto),
    nome: '',
    status: 'novo',
    score: 0,
    temperatura: 'frio',
    lojaSlug: null,
    origem: origemVazia(),
    perfil: perfilVazio(),
    visita: { quando: null, iso: null, confirmada: false, lojaSlug: null },
    resumo: '',
    notas: '',
    humano: false,
    humanoMotivo: '',
    agenteAtivo: true,
    followupsEnviados: 0,
    proximoFollowupEm: null,
    optoutEm: null,
    qualificadoEm: null,
    lojaNotificadaEm: null,
    conviteEnviadoEm: null,
    criadoEm: ts,
    atualizadoEm: ts,
    ultimaMensagemEm: null,
    ultimaMensagemLeadEm: null,
    naoLidas: 0,
    totalMensagensLead: 0,
    lojaSugerida: null,
    roteadoEm: null,
    roteamentoMotivo: '',
    esperaAviso: null,
    ...resto,
  };
  s.leads.set(lead.id, lead);
  s.porTelefone.set(lead.telefone, lead.id);
  schedule('leads');
  espelharLead(lead);
  return lead;
}

export function updateLead(id: string, patch: Partial<Lead>): Lead | undefined {
  const lead = state().leads.get(id);
  if (!lead) return undefined;
  Object.assign(lead, patch, { atualizadoEm: nowIso() });
  schedule('leads');
  espelharLead(lead);
  return lead;
}

/** Remove um lead (apenas leads de teste) e sua conversa em memória. */
export function deleteLeadTeste(id: string): void {
  const s = state();
  const l = s.leads.get(id);
  if (!l || !l.teste) return;
  s.leads.delete(id);
  s.porTelefone.delete(l.telefone);
  s.mensagens.delete(id);
  for (const e of [...s.espera.values()]) if (e.leadId === id) s.espera.delete(e.id);
  schedule('leads');
  schedule('espera');
}

/**
 * Exclusão definitiva (pedido do titular — LGPD art. 18): remove o lead, a conversa
 * e os eventos da memória, dos arquivos locais e do banco.
 */
export async function excluirLeadDefinitivo(id: string): Promise<boolean> {
  const s = state();
  const l = s.leads.get(id);
  if (!l) return false;
  for (const m of s.mensagens.get(id) ?? []) if (m.waId) s.waIds.delete(m.waId);
  s.leads.delete(id);
  s.porTelefone.delete(l.telefone);
  s.mensagens.delete(id);
  s.eventos = s.eventos.filter((e) => e.leadId !== id);
  const esperaDoLead = [...s.espera.values()].filter((e) => e.leadId === id);
  for (const e of esperaDoLead) s.espera.delete(e.id);

  // reescreve os arquivos sem os dados do lead
  writeAtomic('leads.json', [...s.leads.values()]);
  writeAtomic('lista_espera.json', [...s.espera.values()]);
  // fotos e áudios do cliente
  fs.rmSync(path.join(DATA_DIR, 'midia', id.replace(/[^a-zA-Z0-9-]/g, '')), { recursive: true, force: true });
  const todasMsgs = [...s.mensagens.values()].flat().sort((a, b) => a.ts.localeCompare(b.ts));
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const jsonl = (rows: unknown[]) => rows.map((r) => JSON.stringify(r) + '\n').join('');
  const tmpM = file(`mensagens.jsonl.${process.pid}.tmp`);
  fs.writeFileSync(tmpM, jsonl(todasMsgs), 'utf8');
  fs.renameSync(tmpM, file('mensagens.jsonl'));
  const tmpE = file(`eventos.jsonl.${process.pid}.tmp`);
  fs.writeFileSync(tmpE, jsonl(s.eventos), 'utf8');
  fs.renameSync(tmpE, file('eventos.jsonl'));

  await removerLeadDoBanco(id);
  if (esperaDoLead.length) await removerEsperaDoBanco(esperaDoLead.map((e) => e.id));
  return true;
}

// ───────────────────────── Lista de espera ─────────────────────────

export function listEspera(): EsperaItem[] {
  return [...state().espera.values()];
}

export function getEspera(id: string): EsperaItem | undefined {
  return state().espera.get(id);
}

export function addEspera(
  input: Omit<EsperaItem, 'id' | 'createdAt' | 'atualizadoEm' | 'status' | 'matchedVehicleId' | 'matchedCodigo' | 'veiculosAvisados' | 'notifiedAt'>
): EsperaItem {
  const s = state();
  const ts = nowIso();
  const item: EsperaItem = {
    id: randomUUID(),
    status: 'aguardando',
    matchedVehicleId: null,
    matchedCodigo: null,
    veiculosAvisados: [],
    notifiedAt: null,
    createdAt: ts,
    atualizadoEm: ts,
    ...input,
  };
  s.espera.set(item.id, item);
  schedule('espera');
  if (!item.teste) espelharEspera(item);
  return item;
}

export function updateEspera(id: string, patch: Partial<EsperaItem>): EsperaItem | undefined {
  const item = state().espera.get(id);
  if (!item) return undefined;
  Object.assign(item, patch, { atualizadoEm: nowIso() });
  schedule('espera');
  if (!item.teste) espelharEspera(item);
  return item;
}

export function getEsperaControle(): EsperaControle {
  return state().esperaControle;
}

export function saveEsperaControle(patch: Partial<EsperaControle>): EsperaControle {
  const s = state();
  s.esperaControle = { ...s.esperaControle, ...patch };
  schedule('espera');
  return s.esperaControle;
}

// ───────────────────────── Mensagens ─────────────────────────

export function getMensagens(leadId: string): Mensagem[] {
  return state().mensagens.get(leadId) ?? [];
}

export function jaProcessouWaId(waId: string): boolean {
  return Boolean(waId) && state().waIds.has(waId);
}

export function addMensagem(
  input: Omit<Mensagem, 'id' | 'ts'> & { ts?: string }
): Mensagem {
  const s = state();
  const msg: Mensagem = { id: randomUUID(), ts: input.ts ?? nowIso(), ...input };
  // lead excluído (ex.: pedido LGPD) enquanto um envio estava em andamento: não grava nada
  if (!s.leads.has(msg.leadId)) return msg;
  const arr = s.mensagens.get(msg.leadId) ?? [];
  arr.push(msg);
  s.mensagens.set(msg.leadId, arr);
  if (msg.waId) s.waIds.add(msg.waId);
  appendJsonl('mensagens.jsonl', msg);

  const lead = s.leads.get(msg.leadId);
  if (lead) {
    lead.ultimaMensagemEm = msg.ts;
    lead.atualizadoEm = msg.ts;
    if (msg.autor === 'lead') {
      lead.ultimaMensagemLeadEm = msg.ts;
      lead.naoLidas += 1;
      lead.totalMensagensLead += 1;
    }
    schedule('leads');
    espelharLead(lead);
  }
  espelharMensagem(msg, lead);
  return msg;
}

// ───────────────────────── Eventos ─────────────────────────

export function addEvento(input: Omit<Evento, 'id' | 'ts'>): Evento {
  const ev: Evento = { id: randomUUID(), ts: nowIso(), ...input };
  state().eventos.push(ev);
  appendJsonl('eventos.jsonl', ev);
  if (!(ev.leadId && state().leads.get(ev.leadId)?.teste)) espelharEvento(ev);
  return ev;
}

export function listEventos(): Evento[] {
  return state().eventos;
}

// ───────────────────────── Cliques (atribuição) ─────────────────────────

export function saveClique(c: Clique): void {
  const s = state();
  s.cliques.set(c.sid, c);
  espelharClique(c);
  // limpeza: mantém apenas 14 dias
  if (s.cliques.size > 5000) {
    const corte = Date.now() - 14 * 86400_000;
    for (const [k, v] of s.cliques) if (Date.parse(v.ts) < corte) s.cliques.delete(k);
  }
  schedule('cliques');
}

const normTexto = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/**
 * Casa a 1ª mensagem do cliente com o clique do site que abriu aquele texto no WhatsApp
 * (as mensagens não levam mais código visível). Pega o clique não usado mais recente com o
 * mesmo texto nas últimas 3 horas e o marca como usado.
 */
export function takeCliquePorMensagem(texto: string, janelaMs = 3 * 3600_000): Clique | undefined {
  const alvo = normTexto(texto);
  if (alvo.length < 12) return undefined;
  const corte = Date.now() - janelaMs;
  const c = [...state().cliques.values()]
    .filter((x) => !x.usado && x.mensagem && Date.parse(x.ts) >= corte && normTexto(x.mensagem) === alvo)
    .sort((a, b) => b.ts.localeCompare(a.ts))[0];
  return c ? takeClique(c.sid) : undefined;
}

export function takeClique(sid: string): Clique | undefined {
  const c = state().cliques.get(sid);
  if (c) {
    c.usado = true;
    schedule('cliques');
    espelharClique(c);
  }
  return c;
}

// ───────────────────────── Settings ─────────────────────────

export function getSettings(): Settings {
  return state().settings;
}

export function saveSettings(patch: Partial<Settings>): Settings {
  const s = state();
  s.settings = { ...s.settings, ...patch, atualizadoEm: nowIso() };
  writeAtomic('settings.json', s.settings);
  espelharSettings(s.settings);
  return s.settings;
}

// ───────────────────────── Sincronização entre instâncias ─────────────────────────
// Recebe o que OUTRA instância gravou no banco. Nada aqui volta para a fila de escrita
// (não espelha), senão as instâncias ficariam regravando uma a outra.

const ts = (iso: string | null | undefined) => (iso ? Date.parse(iso) || 0 : 0);

/** Troca o lead local pela versão do banco quando ela é mais nova. Devolve true se mudou algo. */
export function incorporarLead(remoto: Lead): boolean {
  if (!remoto?.id || remoto.teste) return false;
  const s = state();
  const local = s.leads.get(remoto.id);
  if (local && ts(remoto.atualizadoEm) <= ts(local.atualizadoEm)) return false;
  normalizarLeadLegado(remoto);
  if (local) {
    for (const k of Object.keys(local) as Array<keyof Lead>) if (!(k in remoto)) delete local[k];
    Object.assign(local, remoto); // mantém a mesma referência para quem já segura o objeto
  } else {
    // mesmo telefone com outro id (as duas instâncias criaram o lead): fica o do banco
    const outroId = s.porTelefone.get(remoto.telefone);
    if (outroId && outroId !== remoto.id) s.leads.delete(outroId);
    s.leads.set(remoto.id, remoto);
  }
  s.porTelefone.set(remoto.telefone, remoto.id);
  schedule('leads');
  return true;
}

/** Junta mensagens gravadas por outra instância (sem duplicar e na ordem). */
export function incorporarMensagens(msgs: Mensagem[]): number {
  const s = state();
  let n = 0;
  const tocados = new Set<string>();
  for (const m of msgs) {
    if (!s.leads.has(m.leadId)) continue;
    const arr = s.mensagens.get(m.leadId) ?? [];
    if (arr.some((x) => x.id === m.id || (m.waId && x.waId === m.waId))) continue;
    arr.push(m);
    s.mensagens.set(m.leadId, arr);
    if (m.waId) s.waIds.add(m.waId);
    appendJsonl('mensagens.jsonl', m);
    tocados.add(m.leadId);
    n++;
  }
  for (const id of tocados) s.mensagens.get(id)!.sort((a, b) => a.ts.localeCompare(b.ts));
  return n;
}

export function incorporarEventos(evs: Evento[]): number {
  const s = state();
  const ids = new Set(s.eventos.slice(-5000).map((e) => e.id));
  let n = 0;
  for (const e of evs) {
    if (ids.has(e.id)) continue;
    s.eventos.push(e);
    appendJsonl('eventos.jsonl', e);
    n++;
  }
  if (n) s.eventos.sort((a, b) => a.ts.localeCompare(b.ts));
  return n;
}

export function incorporarEspera(itens: EsperaItem[]): number {
  const s = state();
  let n = 0;
  for (const e of itens) {
    const local = s.espera.get(e.id);
    if (local && ts(e.atualizadoEm) <= ts(local.atualizadoEm)) continue;
    s.espera.set(e.id, e);
    n++;
  }
  if (n) schedule('espera');
  return n;
}

/** Configurações salvas por outra instância (ex.: agente ligado/desligado no topo do admin). */
export function incorporarSettings(remoto: Settings | null): boolean {
  if (!remoto) return false;
  const s = state();
  if (ts(remoto.atualizadoEm) <= ts(s.settings.atualizadoEm)) return false;
  s.settings = { ...SETTINGS_PADRAO, ...remoto };
  writeAtomic('settings.json', s.settings);
  return true;
}

// ───────────────────────── Banco (Supabase) ─────────────────────────

/**
 * Chamado na subida do servidor. Com o banco configurado, ele é a fonte da verdade:
 * carrega leads/conversas para a memória. Se o banco estiver vazio e houver dados
 * locais (arquivos), eles são enviados ao banco (migração única).
 */
export async function hidratarDoBanco(): Promise<{ origem: 'banco' | 'arquivos' | 'desligado'; leads: number }> {
  if (!bancoConfigurado()) return { origem: 'desligado', leads: state().leads.size };
  const s = state();
  try {
    const d = await carregarDoBanco();
    if (d.leads.length === 0 && s.leads.size > 0) {
      for (const l of s.leads.values()) espelharLead(l);
      for (const arr of s.mensagens.values()) for (const m of arr) espelharMensagem(m, s.leads.get(m.leadId));
      for (const e of s.eventos) espelharEvento(e);
      for (const c of s.cliques.values()) espelharClique(c);
      espelharSettings(s.settings);
      return { origem: 'arquivos', leads: s.leads.size };
    }

    const testes = [...s.leads.values()].filter((l) => l.teste);
    s.leads.clear();
    s.porTelefone.clear();
    s.mensagens.clear();
    s.waIds.clear();
    s.cliques.clear();
    for (const l of [...d.leads, ...testes]) {
      normalizarLeadLegado(l);
      s.leads.set(l.id, l);
      s.porTelefone.set(l.telefone, l.id);
    }
    for (const m of d.mensagens) {
      const arr = s.mensagens.get(m.leadId) ?? [];
      arr.push(m);
      s.mensagens.set(m.leadId, arr);
      if (m.waId) s.waIds.add(m.waId);
    }
    s.eventos = d.eventos;
    for (const c of d.cliques) s.cliques.set(c.sid, c);
    if (d.settings) s.settings = { ...SETTINGS_PADRAO, ...d.settings };
    await hidratarExtrasDoBanco();
    return { origem: 'banco', leads: s.leads.size };
  } catch (e) {
    console.error('[supabase] não foi possível carregar do banco; seguindo com os arquivos locais:', e instanceof Error ? e.message : e);
    return { origem: 'arquivos', leads: s.leads.size };
  }
}

/**
 * Lista de espera e WhatsApp de notificação das lojas (av3_lista_espera / av3_lojas).
 * Separado da carga principal: se a migração ainda não foi aplicada, nada do resto quebra.
 */
async function hidratarExtrasDoBanco(): Promise<void> {
  const s = state();
  try {
    const itens = await carregarEsperaDoBanco();
    if (itens.length) {
      const testes = [...s.espera.values()].filter((e) => e.teste);
      s.espera.clear();
      for (const e of [...itens, ...testes]) s.espera.set(e.id, e);
      schedule('espera');
    } else {
      for (const e of s.espera.values()) if (!e.teste) espelharEspera(e);
    }
  } catch (e) {
    console.warn('[supabase] lista de espera não carregada do banco (migração aplicada?):', e instanceof Error ? e.message : e);
  }
  try {
    const lojas = await carregarLojasDoBanco();
    const tel = { ...s.settings.lojaTelefones };
    let mudou = false;
    for (const l of lojas) {
      if (l.whatsapp_notificacao && tel[l.slug] !== l.whatsapp_notificacao) {
        tel[l.slug] = l.whatsapp_notificacao;
        mudou = true;
      }
    }
    if (mudou) s.settings = { ...s.settings, lojaTelefones: tel };
    // banco ainda sem números (migração recém-aplicada): publica os que já estão configurados no painel
    const bancoVazio = !lojas.some((l) => l.whatsapp_notificacao);
    if (bancoVazio && Object.values(s.settings.lojaTelefones).some(Boolean)) espelharSettings(s.settings);
  } catch (e) {
    console.warn('[supabase] av3_lojas não carregada (migração aplicada?):', e instanceof Error ? e.message : e);
  }
}
