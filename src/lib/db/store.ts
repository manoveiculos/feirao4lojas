import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  type Clique,
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
  espelharClique,
  espelharEvento,
  espelharLead,
  espelharMensagem,
  espelharSettings,
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
  timers: Record<string, NodeJS.Timeout | undefined>;
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
    timers: {},
  };
  return g.__feiraoStore;
}

function schedule(key: 'leads' | 'cliques'): void {
  const s = state();
  if (s.timers[key]) return;
  s.timers[key] = setTimeout(() => {
    s.timers[key] = undefined;
    try {
      if (key === 'leads') writeAtomic('leads.json', [...s.leads.values()]);
      else writeAtomic('cliques.json', [...s.cliques.values()]);
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
  schedule('leads');
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
    return { origem: 'banco', leads: s.leads.size };
  } catch (e) {
    console.error('[supabase] não foi possível carregar do banco; seguindo com os arquivos locais:', e instanceof Error ? e.message : e);
    return { origem: 'arquivos', leads: s.leads.size };
  }
}
