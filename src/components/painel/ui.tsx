'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export const STATUS_LABEL: Record<string, string> = {
  novo: 'Novo',
  em_atendimento: 'Em atendimento',
  qualificado: 'Qualificado',
  visita_agendada: 'Visita agendada',
  visitou: 'Visitou',
  comprou: 'Comprou',
  perdido: 'Perdido',
  optout: 'Não quer contato',
};

const STATUS_COR: Record<string, string> = {
  novo: 'bg-slate-100 text-slate-700',
  em_atendimento: 'bg-sky-100 text-sky-800',
  qualificado: 'bg-emerald-100 text-emerald-800',
  visita_agendada: 'bg-violet-100 text-violet-800',
  visitou: 'bg-indigo-100 text-indigo-800',
  comprou: 'bg-green-600 text-white',
  perdido: 'bg-rose-100 text-rose-800',
  optout: 'bg-zinc-200 text-zinc-700',
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold ${STATUS_COR[status] ?? 'bg-slate-100'}`}>
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

export function TempBadge({ t, score }: { t: string; score: number }) {
  const cor = t === 'quente' ? 'bg-orange-500 text-white' : t === 'morno' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600';
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold ${cor}`}>{t === 'quente' ? '🔥 ' : ''}{score}</span>;
}

export function Kpi({ label, valor, sub, destaque }: { label: string; valor: string | number; sub?: string; destaque?: boolean }) {
  return (
    <div className={`rounded-2xl border p-4 ${destaque ? 'border-orange-300 bg-orange-50' : 'border-slate-200 bg-white'}`}>
      <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{label}</div>
      <div className="mt-1 text-3xl font-extrabold tabular-nums text-slate-900">{valor}</div>
      {sub && <div className="mt-0.5 text-xs text-slate-500">{sub}</div>}
    </div>
  );
}

export function Card({ titulo, children, acao }: { titulo?: string; children: React.ReactNode; acao?: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
      {(titulo || acao) && (
        <header className="mb-3 flex items-center justify-between gap-2">
          {titulo && <h2 className="text-sm font-extrabold uppercase tracking-wide text-slate-700">{titulo}</h2>}
          {acao}
        </header>
      )}
      {children}
    </section>
  );
}

export const brl = (n: number | null | undefined) =>
  n === null || n === undefined ? '—' : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);

export function tempoRelativo(iso: string | null | undefined): string {
  if (!iso) return '';
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  if (s < 60) return 'agora';
  if (s < 3600) return `${Math.floor(s / 60)} min`;
  if (s < 86400) return `${Math.floor(s / 3600)} h`;
  return `${Math.floor(s / 86400)} d`;
}

export function hora(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
}

/** Polling com pausa quando a aba está oculta. */
export function usePolling<T>(url: string | null, intervaloMs: number) {
  const [data, setData] = useState<T | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const urlRef = useRef(url);
  urlRef.current = url;

  const buscar = useCallback(async () => {
    const u = urlRef.current;
    if (!u) return;
    try {
      const r = await fetch(u, { cache: 'no-store' });
      if (r.status === 401) {
        window.location.href = '/login';
        return;
      }
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setData((await r.json()) as T);
      setErro(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'erro');
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    setCarregando(true);
    void buscar();
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') void buscar();
    }, intervaloMs);
    return () => clearInterval(t);
  }, [url, intervaloMs, buscar]);

  return { data, erro, carregando, recarregar: buscar };
}

export async function api<T = unknown>(url: string, method: string, body?: unknown): Promise<{ ok: boolean; data: T }> {
  const r = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = (await r.json().catch(() => ({}))) as T;
  return { ok: r.ok, data };
}

export function Barras({ dados }: { dados: Array<{ dia: string; leads: number; qualificados: number }> }) {
  const max = Math.max(1, ...dados.map((d) => d.leads));
  return (
    <div className="flex h-36 items-end gap-1.5">
      {dados.map((d) => (
        <div key={d.dia} className="flex min-w-0 flex-1 flex-col items-center gap-1" title={`${d.dia}: ${d.leads} leads, ${d.qualificados} qualificados`}>
          <div className="relative flex w-full flex-1 items-end">
            <div className="w-full rounded-t bg-sky-200" style={{ height: `${(d.leads / max) * 100}%`, minHeight: d.leads ? 3 : 0 }} />
            <div className="absolute bottom-0 w-full rounded-t bg-emerald-500" style={{ height: `${(d.qualificados / max) * 100}%`, minHeight: d.qualificados ? 3 : 0 }} />
          </div>
          <span className="text-[9px] text-slate-500">{d.dia.slice(0, 5)}</span>
        </div>
      ))}
    </div>
  );
}
