'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { api, brl, hora, STATUS_LABEL, TempBadge, usePolling } from './ui';

interface Linha {
  id: string; nome: string; telefone: string; lojaSlug: string | null; lojaNome: string; status: string;
  temperatura: string; score: number; qualificado: boolean; humano: boolean; naoLidas: number; interesse: string;
  orcamento: number | null; entrada: number | null; troca: string; prazo: string; visita: string; canal: string;
  campanha: string; resumo: string; mensagens: number; criadoEm: string; ultimaMensagemEm: string | null;
}
interface Resp {
  total: number; pagina: number; paginas: number; tamanho: number;
  resumo: { qualificados: number; quentes: number; comVisita: number };
  opcoes: { canais: string[]; campanhas: string[] };
  leads: Linha[];
}

const LOJAS: Array<[string, string]> = [
  ['nenem-autos', 'Neném Autos'], ['rosa-automoveis', 'Rosa Automóveis'], ['v3-automoveis', 'V3 Automóveis'], ['manos-veiculos', 'Manos Veículos'],
];
const CANAL: Record<string, string> = {
  site: 'Site (WhatsApp)', whatsapp_direto: 'WhatsApp direto', anuncio_ctwa: 'Anúncio click-to-WhatsApp',
  lista_vip: 'Lista VIP', saida_site: 'Captura de saída', outro: 'Outro',
};
const PRAZO: Record<string, string> = { imediato: 'Imediato', ate_7_dias: 'Até 7 dias', ate_30_dias: 'Até 30 dias', mais_30_dias: '+30 dias' };

const FILTROS = ['q', 'status', 'temp', 'canal', 'campanha', 'loja', 'de', 'ate', 'scoreMin', 'qualificado', 'humano', 'troca', 'visita', 'semResposta'] as const;

export function LeadsTable({ admin, baseConversas }: { admin: boolean; baseConversas: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  const [busca, setBusca] = useState(sp.get('q') ?? '');
  useEffect(() => {
    const t = setTimeout(() => {
      if ((sp.get('q') ?? '') !== busca) mudar({ q: busca, pagina: '' });
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busca]);

  function mudar(params: Record<string, string>) {
    const n = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(params)) (v ? n.set(k, v) : n.delete(k));
    router.replace(`${pathname}?${n}`, { scroll: false });
  }

  const qs = sp.toString();
  const { data, recarregar, carregando } = usePolling<Resp>(`/api/painel/leads/tabela?${qs}`, 8000);
  const ordenar = sp.get('ordenar') || 'criado';
  const dir = sp.get('dir') === 'asc' ? 'asc' : 'desc';
  const ativos = FILTROS.filter((f) => sp.get(f)).length;

  function ordenarPor(col: string) {
    mudar({ ordenar: col, dir: ordenar === col && dir === 'desc' ? 'asc' : 'desc', pagina: '' });
  }
  const seta = (col: string) => (ordenar === col ? (dir === 'asc' ? ' ▲' : ' ▼') : '');

  async function trocarStatus(id: string, status: string) {
    await api(`/api/painel/leads/${id}`, 'PATCH', { status });
    void recarregar();
  }

  const limpar = () => {
    const n = new URLSearchParams();
    for (const k of ['ordenar', 'dir', 'tamanho']) if (sp.get(k)) n.set(k, sp.get(k)!);
    setBusca('');
    router.replace(`${pathname}?${n}`, { scroll: false });
  };

  const Chip = ({ k, v, l }: { k: string; v: string; l: string }) => (
    <button
      onClick={() => mudar({ [k]: sp.get(k) === v ? '' : v, pagina: '' })}
      aria-pressed={sp.get(k) === v}
      className={`rounded-full px-3 py-1.5 text-xs font-bold cursor-pointer ${sp.get(k) === v ? 'bg-orange-500 text-white' : 'bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100'}`}
    >
      {l}
    </button>
  );

  const th = 'whitespace-nowrap px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500';
  const sel = 'h-9 rounded-lg border border-slate-300 bg-white px-2 text-sm';

  return (
    <div className="space-y-3">
      {/* Filtros rápidos */}
      <div className="flex flex-wrap items-center gap-2">
        <Chip k="qualificado" v="1" l="✅ Qualificados" />
        <Chip k="temp" v="quente" l="🔥 Quentes" />
        <Chip k="visita" v="1" l="📅 Com visita" />
        <Chip k="troca" v="1" l="🔁 Com troca" />
        <Chip k="humano" v="1" l="🙋 Atendimento humano" />
        <Chip k="semResposta" v="1" l="💤 Nunca responderam" />
      </div>

      {/* Filtros detalhados */}
      <div className="grid gap-2 rounded-2xl border border-slate-200 bg-white p-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
        <label className="text-[11px] font-bold uppercase text-slate-500 sm:col-span-2">Buscar
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Nome, telefone ou carro de interesse"
            className="mt-1 h-9 w-full rounded-lg border border-slate-300 px-3 text-sm normal-case focus:border-orange-500 focus:outline-none" />
        </label>
        <label className="text-[11px] font-bold uppercase text-slate-500">Status
          <select value={sp.get('status') ?? ''} onChange={(e) => mudar({ status: e.target.value, pagina: '' })} className={`${sel} mt-1 w-full normal-case`}>
            <option value="">Todos</option>
            {Object.entries(STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        <label className="text-[11px] font-bold uppercase text-slate-500">Temperatura
          <select value={sp.get('temp') ?? ''} onChange={(e) => mudar({ temp: e.target.value, pagina: '' })} className={`${sel} mt-1 w-full normal-case`}>
            <option value="">Todas</option><option value="quente">Quente</option><option value="morno">Morno</option><option value="frio">Frio</option>
          </select>
        </label>
        {admin && (
          <label className="text-[11px] font-bold uppercase text-slate-500">Loja
            <select value={sp.get('loja') ?? ''} onChange={(e) => mudar({ loja: e.target.value, pagina: '' })} className={`${sel} mt-1 w-full normal-case`}>
              <option value="">Todas</option>
              {LOJAS.map(([s, n]) => <option key={s} value={s}>{n}</option>)}
              <option value="sem-loja">Sem loja</option>
            </select>
          </label>
        )}
        <label className="text-[11px] font-bold uppercase text-slate-500">Origem
          <select value={sp.get('canal') ?? ''} onChange={(e) => mudar({ canal: e.target.value, pagina: '' })} className={`${sel} mt-1 w-full normal-case`}>
            <option value="">Todas</option>
            {(data?.opcoes.canais ?? []).map((c) => <option key={c} value={c}>{CANAL[c] ?? c}</option>)}
          </select>
        </label>
        <label className="text-[11px] font-bold uppercase text-slate-500">Campanha
          <select value={sp.get('campanha') ?? ''} onChange={(e) => mudar({ campanha: e.target.value, pagina: '' })} className={`${sel} mt-1 w-full normal-case`}>
            <option value="">Todas</option>
            {(data?.opcoes.campanhas ?? []).map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label className="text-[11px] font-bold uppercase text-slate-500">De
          <input type="date" value={sp.get('de') ?? ''} onChange={(e) => mudar({ de: e.target.value, pagina: '' })} className={`${sel} mt-1 w-full`} />
        </label>
        <label className="text-[11px] font-bold uppercase text-slate-500">Até
          <input type="date" value={sp.get('ate') ?? ''} onChange={(e) => mudar({ ate: e.target.value, pagina: '' })} className={`${sel} mt-1 w-full`} />
        </label>
        <label className="text-[11px] font-bold uppercase text-slate-500">Score mínimo
          <select value={sp.get('scoreMin') ?? ''} onChange={(e) => mudar({ scoreMin: e.target.value, pagina: '' })} className={`${sel} mt-1 w-full normal-case`}>
            <option value="">Qualquer</option><option value="40">40+</option><option value="60">60+</option><option value="70">70+ (quentes)</option><option value="85">85+</option>
          </select>
        </label>
        <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-1">
          {ativos > 0 && <button onClick={limpar} className="h-9 rounded-lg px-3 text-sm font-bold text-sky-700 hover:underline cursor-pointer">Limpar ({ativos})</button>}
        </div>
      </div>

      {/* Resumo + exportar */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600">
        <p aria-live="polite">
          <b className="text-slate-900">{data?.total ?? '—'}</b> leads
          {data && <> · <b className="text-emerald-700">{data.resumo.qualificados}</b> qualificados · <b className="text-orange-600">{data.resumo.quentes}</b> quentes · <b>{data.resumo.comVisita}</b> com visita</>}
        </p>
        <a href={`/api/painel/leads/tabela?${qs}${qs ? '&' : ''}formato=csv`} className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-700">
          ⬇ Exportar CSV
        </a>
      </div>

      {/* Tabela */}
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full min-w-[1100px] text-sm">
          <thead className="border-b border-slate-200 bg-slate-50">
            <tr>
              <th className={th}><button onClick={() => ordenarPor('nome')} className="cursor-pointer font-bold uppercase">Lead{seta('nome')}</button></th>
              {admin && <th className={th}>Loja</th>}
              <th className={th}>Status</th>
              <th className={th}><button onClick={() => ordenarPor('score')} className="cursor-pointer font-bold uppercase">Score{seta('score')}</button></th>
              <th className={th}>Interesse</th>
              <th className={th}><button onClick={() => ordenarPor('orcamento')} className="cursor-pointer font-bold uppercase">Orçamento{seta('orcamento')}</button></th>
              <th className={th}>Troca</th>
              <th className={th}>Prazo</th>
              <th className={th}>Visita</th>
              <th className={th}>Origem</th>
              <th className={th}><button onClick={() => ordenarPor('criado')} className="cursor-pointer font-bold uppercase">Entrou{seta('criado')}</button></th>
              <th className={th}><button onClick={() => ordenarPor('ultima')} className="cursor-pointer font-bold uppercase">Últ. msg{seta('ultima')}</button></th>
              <th className={th} />
            </tr>
          </thead>
          <tbody>
            {carregando && !data && <tr><td colSpan={13} className="p-6 text-center text-slate-400">Carregando…</td></tr>}
            {data?.leads.length === 0 && <tr><td colSpan={13} className="p-8 text-center text-slate-400">Nenhum lead com esses filtros.</td></tr>}
            {data?.leads.map((l) => (
              <tr key={l.id} className="border-t border-slate-100 align-top hover:bg-slate-50">
                <td className="px-3 py-2">
                  <Link href={`${baseConversas}?lead=${l.id}`} className="font-bold text-slate-900 hover:text-orange-600">
                    {l.naoLidas > 0 && <i className="mr-1.5 inline-block h-2 w-2 rounded-full bg-orange-500" aria-label="mensagem nova" />}
                    {l.nome || 'Sem nome'}
                  </Link>
                  <div className="text-xs text-slate-500">+{l.telefone}</div>
                  {l.humano && <span className="mt-0.5 inline-block rounded-full bg-amber-100 px-2 text-[10px] font-bold text-amber-800">humano</span>}
                </td>
                {admin && <td className="px-3 py-2 text-xs">{l.lojaNome || <span className="text-slate-400">—</span>}</td>}
                <td className="px-3 py-2">
                  <select value={l.status} onChange={(e) => trocarStatus(l.id, e.target.value)} aria-label={`Status de ${l.nome || l.telefone}`}
                    className="h-8 rounded-lg border border-slate-200 bg-white px-1.5 text-xs font-semibold">
                    {Object.entries(STATUS_LABEL).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
                  </select>
                </td>
                <td className="px-3 py-2"><TempBadge t={l.temperatura} score={l.score} />{l.qualificado && <span className="ml-1 text-emerald-600" title="Qualificado">✓</span>}</td>
                <td className="max-w-[14rem] px-3 py-2 text-xs text-slate-700" title={l.resumo || l.interesse}>{l.interesse || '—'}</td>
                <td className="whitespace-nowrap px-3 py-2 text-xs">{l.orcamento ? brl(l.orcamento) : '—'}{l.entrada ? <div className="text-slate-500">entrada {brl(l.entrada)}</div> : null}</td>
                <td className="px-3 py-2 text-xs">{l.troca || '—'}</td>
                <td className="whitespace-nowrap px-3 py-2 text-xs">{PRAZO[l.prazo] ?? '—'}</td>
                <td className="px-3 py-2 text-xs">{l.visita || '—'}</td>
                <td className="max-w-[11rem] px-3 py-2 text-xs"><div>{CANAL[l.canal] ?? l.canal}</div>{l.campanha && <div className="truncate text-slate-500" title={l.campanha}>{l.campanha}</div>}</td>
                <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-600">{hora(l.criadoEm)}</td>
                <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-600">{l.ultimaMensagemEm ? hora(l.ultimaMensagemEm) : '—'}</td>
                <td className="px-3 py-2"><Link href={`${baseConversas}?lead=${l.id}`} className="rounded-lg bg-orange-500 px-2.5 py-1 text-xs font-bold text-white hover:bg-orange-600">Conversa</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Paginação */}
      {data && data.paginas > 1 && (
        <div className="flex items-center justify-between text-sm">
          <button disabled={data.pagina <= 1} onClick={() => mudar({ pagina: String(data.pagina - 1) })} className="rounded-lg bg-white px-3 py-1.5 font-bold ring-1 ring-slate-200 disabled:opacity-40 cursor-pointer">← Anterior</button>
          <span className="text-slate-600">Página {data.pagina} de {data.paginas}</span>
          <button disabled={data.pagina >= data.paginas} onClick={() => mudar({ pagina: String(data.pagina + 1) })} className="rounded-lg bg-white px-3 py-1.5 font-bold ring-1 ring-slate-200 disabled:opacity-40 cursor-pointer">Próxima →</button>
        </div>
      )}
    </div>
  );
}
