import fs from 'node:fs';
import path from 'node:path';
import type { EventoAcesso } from './tipos';

/**
 * Armazenamento dos eventos de acesso.
 * - Cache quente em memória (o tempo ativo chega a cada ~20 s por visitante e atualiza o MESMO evento).
 * - Cópia local (acessos.json, últimos eventos) para sobreviver a reinício sem banco.
 * - Espelho no Supabase em lote, via função av3_acessos_upsert (o maior tempo vence).
 */

const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(process.cwd(), 'data', 'runtime');
const ARQUIVO = path.join(DATA_DIR, 'acessos.json');
const MAX_MEMORIA = 20000;
const MAX_ARQUIVO = 5000;
const FLUSH_MS = 4000;

const URL_BASE = () => (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
const CHAVE = () => process.env.SUPABASE_SERVICE_ROLE_KEY || '';
export const bancoAcessosAtivo = () => Boolean(URL_BASE() && CHAVE());

interface Estado {
  eventos: Map<string, EventoAcesso>;
  sujos: Set<string>;
  timer: NodeJS.Timeout | null;
  falhas: number;
  enviando: boolean;
  hidratado: boolean;
}

const g = globalThis as unknown as { __av3Acessos?: Estado };

function estado(): Estado {
  if (g.__av3Acessos) return g.__av3Acessos;
  const e: Estado = { eventos: new Map(), sujos: new Set(), timer: null, falhas: 0, enviando: false, hidratado: false };
  try {
    if (fs.existsSync(ARQUIVO)) {
      const lista = JSON.parse(fs.readFileSync(ARQUIVO, 'utf8')) as EventoAcesso[];
      for (const ev of lista) e.eventos.set(ev.id, ev);
    }
  } catch (err) {
    console.warn('[acessos] não foi possível ler a cópia local:', err instanceof Error ? err.message : err);
  }
  g.__av3Acessos = e;
  return e;
}

// ───────────────────────── Escrita ─────────────────────────

function agendar(): void {
  const e = estado();
  if (e.timer) return;
  const espera = e.falhas ? Math.min(60_000, FLUSH_MS * 2 ** e.falhas) : FLUSH_MS;
  e.timer = setTimeout(() => {
    e.timer = null;
    void descarregar();
  }, espera);
  e.timer.unref?.();
}

function gravarArquivo(): void {
  try {
    const todos = [...estado().eventos.values()];
    const recentes = todos.slice(-MAX_ARQUIVO);
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmp = `${ARQUIVO}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(recentes), 'utf8');
    fs.renameSync(tmp, ARQUIVO);
  } catch (err) {
    console.warn('[acessos] falha ao gravar a cópia local:', err instanceof Error ? err.message : err);
  }
}

async function descarregar(): Promise<void> {
  const e = estado();
  if (e.enviando) return;
  e.enviando = true;
  try {
    gravarArquivo();
    if (!bancoAcessosAtivo() || e.sujos.size === 0) return;

    const ids = [...e.sujos];
    e.sujos.clear();
    const linhas = ids.map((id) => e.eventos.get(id)).filter((x): x is EventoAcesso => Boolean(x));
    try {
      for (let i = 0; i < linhas.length; i += 200) {
        const r = await fetch(`${URL_BASE()}/rest/v1/rpc/av3_acessos_upsert`, {
          method: 'POST',
          headers: { apikey: CHAVE(), Authorization: `Bearer ${CHAVE()}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ linhas: linhas.slice(i, i + 200) }),
          signal: AbortSignal.timeout(20_000),
        });
        if (!r.ok) throw new Error(`HTTP ${r.status} ${(await r.text()).slice(0, 160)}`);
      }
      e.falhas = 0;
    } catch (err) {
      for (const id of ids) e.sujos.add(id); // volta para a fila e tenta de novo com backoff
      e.falhas += 1;
      console.error(`[acessos] falha ao gravar no banco (tentativa ${e.falhas}):`, err instanceof Error ? err.message : err);
    }
  } finally {
    e.enviando = false;
    if (e.sujos.size) agendar();
  }
}

/** Insere ou ATUALIZA por id: o tempo ativo reaproveita o mesmo evento a cada ping (o maior valor vence). */
export function registrarEvento(novo: EventoAcesso): void {
  const e = estado();
  const atual = e.eventos.get(novo.id);
  if (atual) {
    atual.atualizado_em = novo.atualizado_em;
    atual.tempo_segundos = Math.max(atual.tempo_segundos, novo.tempo_segundos);
    atual.fotos_vistas = Math.max(atual.fotos_vistas, novo.fotos_vistas);
    atual.scroll_max = Math.max(atual.scroll_max, novo.scroll_max);
    atual.abriu_galeria = atual.abriu_galeria || novo.abriu_galeria;
    for (const [k, v] of Object.entries(novo.interacoes)) atual.interacoes[k] = Math.max(atual.interacoes[k] || 0, v);
    if (!atual.veiculo_nome && novo.veiculo_nome) atual.veiculo_nome = novo.veiculo_nome;
    if (!atual.cidade && novo.cidade) {
      atual.cidade = novo.cidade;
      atual.uf = novo.uf;
    }
  } else {
    e.eventos.set(novo.id, novo);
    if (e.eventos.size > MAX_MEMORIA) {
      const sobra = e.eventos.size - MAX_MEMORIA;
      let i = 0;
      for (const k of e.eventos.keys()) {
        if (i++ >= sobra) break;
        e.eventos.delete(k);
        e.sujos.delete(k);
      }
    }
  }
  e.sujos.add(novo.id);
  agendar();
}

// ───────────────────────── Leitura ─────────────────────────

export function eventosDesde(desdeMs: number): EventoAcesso[] {
  const out: EventoAcesso[] = [];
  for (const ev of estado().eventos.values()) if (Date.parse(ev.criado_em) >= desdeMs || Date.parse(ev.atualizado_em) >= desdeMs) out.push(ev);
  return out;
}

/** No boot: com banco ativo, carrega os últimos 14 dias; sem banco, usa a cópia local. */
export async function hidratarAcessos(): Promise<{ origem: 'banco' | 'arquivo'; eventos: number }> {
  const e = estado();
  if (e.hidratado) return { origem: bancoAcessosAtivo() ? 'banco' : 'arquivo', eventos: e.eventos.size };
  e.hidratado = true;
  if (!bancoAcessosAtivo()) return { origem: 'arquivo', eventos: e.eventos.size };
  try {
    const desde = new Date(Date.now() - 14 * 86400_000).toISOString();
    const lidos: EventoAcesso[] = [];
    for (let de = 0; de < MAX_MEMORIA; de += 1000) {
      const r = await fetch(`${URL_BASE()}/rest/v1/av3_acessos?select=*&criado_em=gte.${encodeURIComponent(desde)}&order=criado_em.desc`, {
        headers: { apikey: CHAVE(), Authorization: `Bearer ${CHAVE()}`, Range: `${de}-${de + 999}`, 'Range-Unit': 'items' },
        signal: AbortSignal.timeout(20_000),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status} ${(await r.text()).slice(0, 160)}`);
      const lote = (await r.json()) as EventoAcesso[];
      lidos.push(...lote);
      if (lote.length < 1000) break;
    }
    lidos.reverse(); // do mais antigo ao mais novo, para a poda por antiguidade funcionar
    for (const ev of lidos) {
      if (!e.eventos.has(ev.id)) e.eventos.set(ev.id, { ...ev, interacoes: ev.interacoes || {} });
    }
    return { origem: 'banco', eventos: e.eventos.size };
  } catch (err) {
    console.error('[acessos] não foi possível carregar do banco; seguindo com a cópia local:', err instanceof Error ? err.message : err);
    return { origem: 'arquivo', eventos: e.eventos.size };
  }
}
