import { randomUUID } from 'node:crypto';
import type { Clique, EsperaItem, Evento, Lead, Mensagem, Settings } from './types';
import type { LojaSlug } from '../types';
import { LOJAS } from '../config';

/**
 * Espelho em Postgres (Supabase / PostgREST) do store em memória.
 * - Ativado por SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (tabelas av3_*, ver supabase/schema.sql).
 * - Escritas em fila, em lote e na ordem (lead antes da mensagem), com retry: falha de rede não perde dado.
 * - Leads de teste (simulador) nunca vão para o banco.
 */

// SUPABASE_URL tem prioridade; o .env de produção só tinha NEXT_PUBLIC_SUPABASE_URL e o espelho ficava desligado.
// (Os testes zeram as duas para nunca gravar no banco real.)
const URL_BASE = (process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/$/, '');
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

export const bancoConfigurado = (): boolean => Boolean(URL_BASE && KEY);

/**
 * Identidade desta instância do servidor. Durante um deploy (ou com mais de um processo) duas
 * instâncias convivem; cada uma marca o que grava para a outra saber o que precisa puxar.
 */
const gi = globalThis as unknown as { __feiraoInstancia?: { id: string; iniciadaEm: string } };
export const INSTANCIA = (gi.__feiraoInstancia ??= { id: randomUUID().slice(0, 8), iniciadaEm: new Date().toISOString() });

interface Fila {
  leads: Map<string, Lead>;
  mensagens: Mensagem[];
  eventos: Evento[];
  cliques: Map<string, Clique>;
  settings: Settings | null;
  /** Tabelas novas (av3_lista_espera, av3_lojas): gravadas à parte para que uma falha nelas nunca trave leads/mensagens. */
  espera: Map<string, EsperaItem>;
  lojas: Settings['lojaTelefones'] | null;
  falhasExtras?: number;
  timer: NodeJS.Timeout | null;
  enviando: boolean;
  falhas: number;
}

const g = globalThis as unknown as { __feiraoFila?: Fila };
const fila = (): Fila =>
  (g.__feiraoFila ??= { leads: new Map(), mensagens: [], eventos: [], cliques: new Map(), settings: null, espera: new Map(), lojas: null, timer: null, enviando: false, falhas: 0 });

async function rest(
  path: string,
  init: { method?: string; body?: unknown; prefer?: string; headers?: Record<string, string>; timeoutMs?: number } = {}
): Promise<Response> {
  return fetch(`${URL_BASE}/rest/v1/${path}`, {
    method: init.method ?? 'GET',
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/json',
      ...(init.prefer ? { Prefer: init.prefer } : {}),
      ...init.headers,
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    signal: AbortSignal.timeout(init.timeoutMs ?? 20_000),
  });
}

async function exigirOk(r: Response, o: string): Promise<void> {
  if (!r.ok) throw new Error(`${o}: HTTP ${r.status} ${(await r.text()).slice(0, 200)}`);
}

const upsert = (tabela: string, linhas: unknown[], conflito: string) =>
  rest(`${tabela}?on_conflict=${conflito}`, { method: 'POST', body: linhas, prefer: 'resolution=merge-duplicates,return=minimal' });

const inserirIgnorando = (tabela: string, linhas: unknown[], conflito: string) =>
  rest(`${tabela}?on_conflict=${conflito}`, { method: 'POST', body: linhas, prefer: 'resolution=ignore-duplicates,return=minimal' });

// ───────────────────────── Fila de escrita ─────────────────────────

function agendar(): void {
  const f = fila();
  if (f.timer || !bancoConfigurado()) return;
  const espera = f.falhas ? Math.min(60_000, 2000 * 2 ** f.falhas) : 600;
  f.timer = setTimeout(() => {
    f.timer = null;
    void descarregar();
  }, espera);
}

async function descarregar(): Promise<void> {
  const f = fila();
  if (f.enviando) return;
  f.enviando = true;
  try {
    // snapshot: o que chegar durante o envio vai no próximo ciclo
    const leads = [...f.leads.values()];
    const mensagens = f.mensagens.splice(0);
    const eventos = f.eventos.splice(0);
    const cliques = [...f.cliques.values()];
    const settings = f.settings;
    f.leads.clear();
    f.cliques.clear();
    f.settings = null;

    try {
      if (leads.length) {
        await exigirOk(
          await upsert(
            'av3_leads',
            leads.map((l) => ({
              id: l.id,
              telefone: l.telefone,
              nome: l.nome,
              status: l.status,
              score: l.score,
              temperatura: l.temperatura,
              loja_slug: l.lojaSlug,
              qualificado_em: l.qualificadoEm,
              criado_em: l.criadoEm,
              atualizado_em: l.atualizadoEm,
              dados: { ...l, instancia: INSTANCIA.id },
            })),
            'id'
          ),
          'leads'
        );
      }
      if (cliques.length) {
        await exigirOk(
          await upsert('av3_cliques', cliques.map((c) => ({ sid: c.sid, dados: c, usado: c.usado, ts: c.ts })), 'sid'),
          'cliques'
        );
      }
      if (mensagens.length) {
        await exigirOk(
          await inserirIgnorando(
            'av3_mensagens',
            mensagens.map((m) => ({ id: m.id, lead_id: m.leadId, autor: m.autor, texto: m.texto, midias: m.midias, wa_id: m.waId || null, ts: m.ts })),
            'id'
          ),
          'mensagens'
        );
      }
      if (eventos.length) {
        await exigirOk(
          await inserirIgnorando(
            'av3_eventos',
            eventos.map((e) => ({ id: e.id, tipo: e.tipo, lead_id: e.leadId, loja_slug: e.lojaSlug, meta: e.meta, ts: e.ts })),
            'id'
          ),
          'eventos'
        );
      }
      if (settings) {
        await exigirOk(await upsert('av3_settings', [{ id: 1, dados: settings, atualizado_em: settings.atualizadoEm }], 'id'), 'settings');
      }
      f.falhas = 0;
    } catch (e) {
      // devolve tudo à fila (sem sobrescrever versões mais novas) e tenta de novo com backoff
      for (const l of leads) if (!f.leads.has(l.id)) f.leads.set(l.id, l);
      for (const c of cliques) if (!f.cliques.has(c.sid)) f.cliques.set(c.sid, c);
      f.mensagens.unshift(...mensagens);
      f.eventos.unshift(...eventos);
      if (settings && !f.settings) f.settings = settings;
      f.falhas += 1;
      console.error(`[supabase] falha ao gravar (tentativa ${f.falhas}); mantido na fila:`, e instanceof Error ? e.message : e);
    }

    // Tabelas novas: falha aqui (ex.: migração ainda não aplicada) não afeta o bloco acima.
    const espera = [...f.espera.values()];
    const lojas = f.lojas;
    f.espera.clear();
    f.lojas = null;
    try {
      if (espera.length) {
        await exigirOk(await upsert('av3_lista_espera', espera.map(linhaEspera), 'id'), 'lista_espera');
      }
      if (lojas) {
        // nome e sigla são NOT NULL: o INSERT … ON CONFLICT valida a linha inteira antes de virar UPDATE
        const linhas = LOJAS.map((l) => ({
          slug: l.slug,
          nome: l.nome,
          sigla: l.sigla,
          whatsapp_notificacao: lojas[l.slug] || null,
          atualizado_em: new Date().toISOString(),
        }));
        await exigirOk(await upsert('av3_lojas', linhas, 'slug'), 'lojas');
      }
      if (espera.length || lojas) f.falhasExtras = 0;
    } catch (e) {
      for (const x of espera) if (!f.espera.has(x.id)) f.espera.set(x.id, x);
      if (lojas && !f.lojas) f.lojas = lojas;
      f.falhasExtras = (f.falhasExtras ?? 0) + 1;
      // sem backoff infinito barulhento: loga e tenta de novo junto com a próxima escrita
      if (f.falhasExtras <= 3 || f.falhasExtras % 50 === 0) {
        console.error(`[supabase] falha ao gravar lista de espera/lojas (${f.falhasExtras}x):`, e instanceof Error ? e.message : e);
      }
    }
  } finally {
    f.enviando = false;
    const f2 = fila();
    if (f2.leads.size || f2.mensagens.length || f2.eventos.length || f2.cliques.size || f2.settings) agendar();
    else if ((f2.espera.size || f2.lojas) && (f2.falhasExtras ?? 0) < 5) agendar();
  }
}

function linhaEspera(e: EsperaItem) {
  return {
    id: e.id,
    lead_id: e.leadId,
    telefone: e.telefone,
    nome: e.nome,
    marca: e.marca,
    modelo: e.modelo,
    categoria: e.categoria,
    ano_minimo: e.anoMinimo,
    preco_maximo: e.precoMaximo,
    cambio: e.cambio,
    tem_troca: e.temTroca,
    observacoes: e.observacoes,
    status: e.status,
    matched_vehicle_id: e.matchedVehicleId,
    matched_codigo: e.matchedCodigo,
    veiculos_avisados: e.veiculosAvisados,
    created_at: e.createdAt,
    notified_at: e.notifiedAt,
    atualizado_em: e.atualizadoEm,
  };
}

export function espelharLead(l: Lead): void {
  if (!bancoConfigurado() || l.teste) return;
  fila().leads.set(l.id, { ...l });
  agendar();
}
export function espelharMensagem(m: Mensagem, lead: Lead | undefined): void {
  if (!bancoConfigurado() || lead?.teste) return;
  fila().mensagens.push(m);
  agendar();
}
export function espelharEvento(e: Evento): void {
  if (!bancoConfigurado()) return;
  fila().eventos.push(e);
  agendar();
}
export function espelharClique(c: Clique): void {
  if (!bancoConfigurado()) return;
  fila().cliques.set(c.sid, { ...c });
  agendar();
}
export function espelharSettings(s: Settings): void {
  if (!bancoConfigurado()) return;
  fila().settings = s;
  fila().lojas = { ...s.lojaTelefones };
  agendar();
}
export function espelharEspera(e: EsperaItem): void {
  if (!bancoConfigurado() || e.teste) return;
  const f = fila();
  f.espera.set(e.id, { ...e });
  f.falhasExtras = Math.min(f.falhasExtras ?? 0, 4); // uma escrita nova sempre ganha nova tentativa
  agendar();
}

export async function removerEsperaDoBanco(ids: string[]): Promise<void> {
  if (!bancoConfigurado() || !ids.length) return;
  for (const id of ids) fila().espera.delete(id);
  const r = await rest(`av3_lista_espera?id=in.(${ids.map(encodeURIComponent).join(',')})`, { method: 'DELETE', prefer: 'return=minimal' });
  if (!r.ok && r.status !== 404) await exigirOk(r, 'excluir lista de espera');
}

export async function carregarEsperaDoBanco(): Promise<EsperaItem[]> {
  if (!bancoConfigurado()) return [];
  type Linha = ReturnType<typeof linhaEspera>;
  const linhas = await lerTudo<Linha>('av3_lista_espera?select=*&order=created_at.asc');
  return linhas.map((r) => ({
    id: r.id,
    leadId: r.lead_id,
    telefone: r.telefone,
    nome: r.nome ?? '',
    marca: r.marca,
    modelo: r.modelo,
    categoria: r.categoria,
    anoMinimo: r.ano_minimo,
    precoMaximo: r.preco_maximo === null ? null : Number(r.preco_maximo),
    cambio: r.cambio,
    temTroca: r.tem_troca,
    observacoes: r.observacoes ?? '',
    status: r.status,
    matchedVehicleId: r.matched_vehicle_id,
    matchedCodigo: r.matched_codigo,
    veiculosAvisados: r.veiculos_avisados ?? [],
    createdAt: r.created_at,
    notifiedAt: r.notified_at,
    atualizadoEm: r.atualizado_em,
  }));
}

export async function carregarLojasDoBanco(): Promise<Array<{ slug: LojaSlug; whatsapp_notificacao: string | null }>> {
  if (!bancoConfigurado()) return [];
  return lerTudo<{ slug: LojaSlug; whatsapp_notificacao: string | null }>('av3_lojas?select=slug,whatsapp_notificacao');
}

/** Exclusão definitiva no banco (mensagens e eventos saem por cascata). */
export async function removerLeadDoBanco(id: string): Promise<void> {
  if (!bancoConfigurado()) return;
  const f = fila();
  f.leads.delete(id);
  f.mensagens = f.mensagens.filter((m) => m.leadId !== id);
  f.eventos = f.eventos.filter((e) => e.leadId !== id);
  const r = await rest(`av3_leads?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE', prefer: 'return=minimal' });
  await exigirOk(r, 'excluir lead');
}

/** Envia o que estiver pendente (usado no desligamento e em testes). */
export async function esvaziarFila(): Promise<void> {
  const f = fila();
  if (f.timer) clearTimeout(f.timer), (f.timer = null);
  await descarregar();
}

// ───────────────────────── Leitura (hidratação no boot) ─────────────────────────

async function lerTudo<T>(path: string): Promise<T[]> {
  const out: T[] = [];
  for (let de = 0; ; de += 1000) {
    const r = await rest(path, { headers: { Range: `${de}-${de + 999}`, 'Range-Unit': 'items' } });
    await exigirOk(r, path);
    const lote = (await r.json()) as T[];
    out.push(...lote);
    if (lote.length < 1000) return out;
  }
}

export interface DadosDoBanco {
  leads: Lead[];
  mensagens: Mensagem[];
  eventos: Evento[];
  cliques: Clique[];
  settings: Settings | null;
}

export async function carregarDoBanco(): Promise<DadosDoBanco> {
  const corte = new Date(Date.now() - 180 * 86400_000).toISOString();
  const [leads, msgs, evs, cliques, settings] = await Promise.all([
    lerTudo<{ dados: Lead }>('av3_leads?select=dados&order=criado_em.asc'),
    lerTudo<{ id: string; lead_id: string; autor: Mensagem['autor']; texto: string; midias: string[]; wa_id: string | null; ts: string }>(
      `av3_mensagens?select=id,lead_id,autor,texto,midias,wa_id,ts&ts=gte.${corte}&order=ts.asc`
    ),
    lerTudo<{ id: string; tipo: Evento['tipo']; lead_id: string | null; loja_slug: Evento['lojaSlug']; meta: Evento['meta']; ts: string }>(
      `av3_eventos?select=id,tipo,lead_id,loja_slug,meta,ts&ts=gte.${corte}&order=ts.asc`
    ),
    lerTudo<{ dados: Clique }>(`av3_cliques?select=dados&ts=gte.${corte}`),
    lerTudo<{ dados: Settings }>('av3_settings?select=dados&id=eq.1'),
  ]);
  return {
    leads: leads.map((r) => r.dados),
    mensagens: msgs.map((m) => ({ id: m.id, leadId: m.lead_id, autor: m.autor, texto: m.texto, midias: m.midias ?? [], waId: m.wa_id ?? '', ts: m.ts })),
    eventos: evs.map((e) => ({ id: e.id, tipo: e.tipo, leadId: e.lead_id, lojaSlug: e.loja_slug, meta: e.meta ?? {}, ts: e.ts })),
    cliques: cliques.map((c) => c.dados),
    settings: settings[0]?.dados ?? null,
  };
}

// ───────────────────────── Leitura incremental (sincronização entre instâncias) ─────────────────────────

type LinhaMensagem = { id: string; lead_id: string; autor: Mensagem['autor']; texto: string; midias: string[]; wa_id: string | null; ts: string };
type LinhaEvento = { id: string; tipo: Evento['tipo']; lead_id: string | null; loja_slug: Evento['lojaSlug']; meta: Evento['meta']; ts: string };

const paraMensagem = (m: LinhaMensagem): Mensagem => ({ id: m.id, leadId: m.lead_id, autor: m.autor, texto: m.texto, midias: m.midias ?? [], waId: m.wa_id ?? '', ts: m.ts });
const paraEvento = (e: LinhaEvento): Evento => ({ id: e.id, tipo: e.tipo, leadId: e.lead_id, lojaSlug: e.loja_slug, meta: e.meta ?? {}, ts: e.ts });

async function lerJson<T>(path: string, timeoutMs: number): Promise<T[]> {
  const r = await rest(path, { timeoutMs });
  await exigirOk(r, path.split('?')[0]);
  return (await r.json()) as T[];
}

const enc = encodeURIComponent;

/** Leads gravados no banco a partir de `desde` (ISO). */
export async function lerLeadsAlterados(desde: string, timeoutMs = 10_000): Promise<Lead[]> {
  const linhas = await lerJson<{ dados: Lead }>(`av3_leads?select=dados&atualizado_em=gte.${enc(desde)}&order=atualizado_em.asc&limit=1000`, timeoutMs);
  return linhas.map((l) => l.dados);
}

export async function lerLeadPorId(id: string, timeoutMs = 4000): Promise<Lead | null> {
  const linhas = await lerJson<{ dados: Lead }>(`av3_leads?select=dados&id=eq.${enc(id)}`, timeoutMs);
  return linhas[0]?.dados ?? null;
}

export async function lerLeadsPorTelefone(telefones: string[], timeoutMs = 4000): Promise<Lead[]> {
  if (!telefones.length) return [];
  const linhas = await lerJson<{ dados: Lead }>(`av3_leads?select=dados&telefone=in.(${telefones.map(enc).join(',')})`, timeoutMs);
  return linhas.map((l) => l.dados);
}

/** Mensagens a partir de `desde` (de um lead ou de todos). */
export async function lerMensagensDesde(desde: string, leadId?: string, timeoutMs = 10_000): Promise<Mensagem[]> {
  const filtroLead = leadId ? `&lead_id=eq.${enc(leadId)}` : '';
  const linhas = await lerJson<LinhaMensagem>(
    `av3_mensagens?select=id,lead_id,autor,texto,midias,wa_id,ts&ts=gte.${enc(desde)}${filtroLead}&order=ts.asc&limit=2000`,
    timeoutMs
  );
  return linhas.map(paraMensagem);
}

export async function lerEventosDesde(desde: string, timeoutMs = 10_000): Promise<Evento[]> {
  const linhas = await lerJson<LinhaEvento>(`av3_eventos?select=id,tipo,lead_id,loja_slug,meta,ts&ts=gte.${enc(desde)}&order=ts.asc&limit=2000`, timeoutMs);
  return linhas.map(paraEvento);
}

export async function lerSettingsDoBanco(timeoutMs = 10_000): Promise<Settings | null> {
  const linhas = await lerJson<{ dados: Settings }>('av3_settings?select=dados&id=eq.1', timeoutMs);
  return linhas[0]?.dados ?? null;
}

export async function lerEsperaAlterada(desde: string, timeoutMs = 10_000): Promise<EsperaItem[]> {
  const todos = await carregarEsperaDoBanco();
  void timeoutMs;
  return todos.filter((e) => e.atualizadoEm >= desde);
}

/**
 * Batimento desta instância (tabela av3_instancias) e quem é a líder: a instância MAIS NOVA vista
 * nos últimos 45 s. Só a líder roda as tarefas automáticas (follow-up, lista de espera, sync do estoque),
 * para nada sair em dobro quando duas instâncias convivem. Sem a tabela, cada instância se considera líder.
 */
export async function batimentoELider(): Promise<boolean> {
  const agora = new Date().toISOString();
  const r = await rest('av3_instancias?on_conflict=id', {
    method: 'POST',
    body: [{ id: INSTANCIA.id, iniciada_em: INSTANCIA.iniciadaEm, visto_em: agora }],
    prefer: 'resolution=merge-duplicates,return=minimal',
    timeoutMs: 8000,
  });
  if (!r.ok) throw new Error(`av3_instancias: HTTP ${r.status}`);
  const corte = new Date(Date.now() - 45_000).toISOString();
  const vivas = await lerJson<{ id: string }>(`av3_instancias?select=id&visto_em=gte.${enc(corte)}&order=iniciada_em.desc,id.desc&limit=1`, 8000);
  return !vivas[0] || vivas[0].id === INSTANCIA.id;
}

// ───────────────────────── Custos das APIs (av3_custos_api) ─────────────────────────

interface LinhaCusto { id: string; ts: string; servico: 'anthropic' | 'openai'; modelo: string; entrada: number; saida: number; cache_escrita: number; cache_leitura: number; lead_id: string | null }

export async function inserirCustos(usos: Array<{ id: string; ts: string; servico: 'anthropic' | 'openai'; modelo: string; entrada: number; saida: number; cacheEscrita: number; cacheLeitura: number; leadId: string | null }>): Promise<void> {
  const linhas: LinhaCusto[] = usos.map((u) => ({ id: u.id, ts: u.ts, servico: u.servico, modelo: u.modelo, entrada: u.entrada, saida: u.saida, cache_escrita: u.cacheEscrita, cache_leitura: u.cacheLeitura, lead_id: u.leadId }));
  await exigirOk(await inserirIgnorando('av3_custos_api', linhas, 'id'), 'custos');
}

export async function lerCustosDesde(desde: string) {
  const out: Array<{ id: string; ts: string; servico: 'anthropic' | 'openai'; modelo: string; entrada: number; saida: number; cacheEscrita: number; cacheLeitura: number; leadId: string | null }> = [];
  for (let de = 0; de < 100_000; de += 1000) {
    const r = await rest(`av3_custos_api?select=*&ts=gte.${encodeURIComponent(desde)}&order=ts.asc`, { headers: { Range: `${de}-${de + 999}`, 'Range-Unit': 'items' } });
    await exigirOk(r, 'custos');
    const lote = (await r.json()) as LinhaCusto[];
    for (const l of lote) out.push({ id: l.id, ts: l.ts, servico: l.servico, modelo: l.modelo, entrada: l.entrada, saida: l.saida, cacheEscrita: l.cache_escrita, cacheLeitura: l.cache_leitura, leadId: l.lead_id });
    if (lote.length < 1000) break;
  }
  return out;
}
