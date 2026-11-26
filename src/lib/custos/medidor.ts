import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { getSettings } from '../db/store';
import type { ConfigCustos, PrecoModelo } from '../db/types';
import { bancoConfigurado, inserirCustos, lerCustosDesde } from '../db/remote';

/**
 * Medidor de custo das APIs pagas por uso (Claude e OpenAI).
 * Guarda os TOKENS exatos que cada API devolve em "usage" (nunca estimativa) e calcula o valor
 * em dólar/real na hora de mostrar, com a tabela de preços da aba Custos: corrigir um preço
 * recalcula todo o histórico. Persistência: arquivo em DATA_DIR + tabela av3_custos_api (Supabase).
 */

export type ServicoApi = 'anthropic' | 'openai';

export interface UsoApi {
  id: string;
  ts: string;
  servico: ServicoApi;
  modelo: string;
  /** tokens de entrada (sem cache) */
  entrada: number;
  saida: number;
  cacheEscrita: number;
  cacheLeitura: number;
  leadId: string | null;
}

/**
 * Preços iniciais por 1M de tokens (USD). São PONTO DE PARTIDA: confirme no console da Anthropic
 * e da OpenAI e corrija na aba Custos (o histórico é recalculado).
 */
export const CONFIG_CUSTOS_PADRAO: ConfigCustos = {
  cotacaoUsdBrl: 5.5,
  precos: {
    'claude-sonnet-5-5': { entrada: 3, saida: 15, cacheEscrita: 3.75, cacheLeitura: 0.3 },
    'gpt-4o-mini-transcribe': { entrada: 3, saida: 5, cacheEscrita: 0, cacheLeitura: 0 },
  },
  fixos: [],
};

export function configCustos(): ConfigCustos {
  const c = getSettings().custos;
  return {
    cotacaoUsdBrl: c?.cotacaoUsdBrl && c.cotacaoUsdBrl > 0 ? c.cotacaoUsdBrl : CONFIG_CUSTOS_PADRAO.cotacaoUsdBrl,
    precos: { ...CONFIG_CUSTOS_PADRAO.precos, ...(c?.precos ?? {}) },
    fixos: c?.fixos ?? [],
  };
}

/** Preço do modelo; modelo sem preço cadastrado usa o da mesma família/serviço e é marcado como "sem preço". */
export function precoDoModelo(cfg: ConfigCustos, uso: Pick<UsoApi, 'servico' | 'modelo'>): { preco: PrecoModelo; cadastrado: boolean } {
  const exato = cfg.precos[uso.modelo];
  if (exato) return { preco: exato, cadastrado: true };
  const padrao = uso.servico === 'anthropic' ? CONFIG_CUSTOS_PADRAO.precos['claude-sonnet-5-5'] : CONFIG_CUSTOS_PADRAO.precos['gpt-4o-mini-transcribe'];
  return { preco: padrao, cadastrado: false };
}

export function custoUsd(uso: UsoApi, cfg: ConfigCustos): number {
  const { preco } = precoDoModelo(cfg, uso);
  return (
    (uso.entrada * preco.entrada + uso.saida * preco.saida + uso.cacheEscrita * preco.cacheEscrita + uso.cacheLeitura * preco.cacheLeitura) / 1_000_000
  );
}

// ───────────────────────── Registro ─────────────────────────

const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(process.cwd(), 'data', 'runtime');
const ARQUIVO = path.join(DATA_DIR, 'custos_api.jsonl');

interface Estado {
  fila: UsoApi[];
  timer: NodeJS.Timeout | null;
  recentes: UsoApi[];
}
const g = globalThis as unknown as { __feiraoCustos?: Estado };
const est = (): Estado => (g.__feiraoCustos ??= { fila: [], timer: null, recentes: [] });

const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.round(v) : 0);

function agendarEnvio() {
  const s = est();
  if (s.timer || !bancoConfigurado()) return;
  s.timer = setTimeout(async () => {
    s.timer = null;
    const lote = s.fila.splice(0, 200);
    if (!lote.length) return;
    try {
      await inserirCustos(lote);
    } catch (e) {
      s.fila.unshift(...lote);
      if (s.fila.length > 2000) s.fila.splice(0, s.fila.length - 2000);
      console.warn('[custos] não gravei no banco (tabela av3_custos_api existe?):', e instanceof Error ? e.message : e);
    }
    if (s.fila.length) agendarEnvio();
  }, 3000);
  s.timer.unref?.();
}

/** Registra o consumo de UMA chamada. Nunca lança (medir não pode derrubar o atendimento). */
export function registrarUso(u: Omit<UsoApi, 'id' | 'ts'> & { ts?: string }): void {
  try {
    if (!u.entrada && !u.saida && !u.cacheEscrita && !u.cacheLeitura) return;
    const uso: UsoApi = { id: randomUUID(), ts: u.ts ?? new Date().toISOString(), ...u };
    const s = est();
    s.recentes.push(uso);
    if (s.recentes.length > 5000) s.recentes.splice(0, s.recentes.length - 5000);
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.appendFileSync(ARQUIVO, JSON.stringify(uso) + '\n', 'utf8');
    s.fila.push(uso);
    agendarEnvio();
  } catch (e) {
    console.warn('[custos] falha ao registrar uso:', e instanceof Error ? e.message : e);
  }
}

/** Interpreta o campo "usage" da resposta da Anthropic. */
export function usoDaAnthropic(modelo: string, usage: unknown, leadId: string | null): void {
  const u = (usage ?? {}) as Record<string, unknown>;
  registrarUso({
    servico: 'anthropic',
    modelo,
    entrada: n(u.input_tokens),
    saida: n(u.output_tokens),
    cacheEscrita: n(u.cache_creation_input_tokens),
    cacheLeitura: n(u.cache_read_input_tokens),
    leadId,
  });
}

/** Lê o consumo (do banco quando ativo; senão do arquivo local) a partir de uma data. */
export async function lerUsos(desdeIso: string): Promise<UsoApi[]> {
  const porId = new Map<string, UsoApi>();
  if (bancoConfigurado()) {
    try {
      for (const u of await lerCustosDesde(desdeIso)) porId.set(u.id, u);
    } catch (e) {
      console.warn('[custos] leitura no banco falhou; usando o arquivo local:', e instanceof Error ? e.message : e);
    }
  }
  // locais: complementam o que ainda não chegou ao banco (ou tudo, sem banco)
  const locais: UsoApi[] = [];
  try {
    for (const l of fs.readFileSync(ARQUIVO, 'utf8').split('\n')) if (l) locais.push(JSON.parse(l) as UsoApi);
  } catch {
    /* sem arquivo ainda */
  }
  for (const u of locais) if (u.ts >= desdeIso && !porId.has(u.id)) porId.set(u.id, u);
  return [...porId.values()].sort((a, b) => a.ts.localeCompare(b.ts));
}
