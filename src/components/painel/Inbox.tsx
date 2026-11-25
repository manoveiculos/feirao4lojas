'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { api, brl, hora, StatusBadge, STATUS_LABEL, TempBadge, tempoRelativo, usePolling } from './ui';

interface ItemLista {
  id: string; nome: string; telefone: string; status: string; score: number; temperatura: string;
  lojaSlug: string | null; humano: boolean; naoLidas: number; qualificado: boolean; resumo: string;
  canal: string; campanha: string; criadoEm: string;
  ultimaMensagem: { autor: string; texto: string; ts: string } | null;
}
interface Lista { total: number; leads: ItemLista[] }

interface Perfil {
  veiculosInteresse: string[]; categoria: string | null; marca_modelo: string | null; orcamento: number | null;
  entrada: number | null; parcelaDesejada: number | null; formaPagamento: string | null; temTroca: boolean | null;
  trocaModelo: string | null; trocaAno: string | null; trocaKm: string | null; prazoCompra: string | null; cidade: string | null;
}
interface LeadDet {
  id: string; nome: string; telefone: string; status: string; score: number; temperatura: string; lojaSlug: string | null;
  humano: boolean; humanoMotivo: string; agenteAtivo: boolean; notas: string; resumo: string; perfil: Perfil;
  visita: { quando: string | null; confirmada: boolean }; origem: { canal: string; ref: string; utm_source: string; utm_campaign: string; ad_headline: string };
  qualificadoEm: string | null; followupsEnviados: number; criadoEm: string;
}
interface Msg { id: string; autor: 'lead' | 'agente' | 'humano' | 'sistema'; texto: string; midias: string[]; ts: string }

const LOJAS = [
  ['nenem-autos', 'Neném Autos'], ['rosa-automoveis', 'Rosa Automóveis'],
  ['v3-automoveis', 'V3 Automóveis'], ['manos-veiculos', 'Manos Veículos'],
] as const;

export function Inbox({ admin, lojaFixa }: { admin: boolean; lojaFixa?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const leadSel = sp.get('lead');
  const filtro = sp.get('filtro') || '';
  const loja = lojaFixa ?? (sp.get('loja') || '');
  const [q, setQ] = useState('');

  const qs = new URLSearchParams();
  if (filtro) qs.set('filtro', filtro);
  if (loja && admin) qs.set('loja', loja);
  if (q) qs.set('q', q);
  const { data: lista, recarregar } = usePolling<Lista>(`/api/painel/leads?${qs}`, 4000);

  function nav(params: Record<string, string>) {
    const n = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(params)) (v ? n.set(k, v) : n.delete(k));
    router.replace(`${pathname}?${n}`);
  }

  const FILTROS: Array<[string, string]> = [
    ['', 'Todos'], ['qualificados', 'Qualificados'], ['quentes', '🔥 Quentes'], ['humano', 'Atendimento humano'], ['naolidas', 'Não lidas'],
  ];

  return (
    <div className="grid min-h-[70dvh] gap-3 lg:grid-cols-[22rem_1fr]">
      <aside className={`${leadSel ? 'hidden lg:block' : ''} rounded-2xl border border-slate-200 bg-white`}>
        <div className="space-y-2 border-b border-slate-100 p-3">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar nome ou telefone"
            className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm focus:border-orange-500 focus:outline-none" />
          <div className="flex flex-wrap gap-1.5">
            {FILTROS.map(([v, l]) => (
              <button key={v} onClick={() => nav({ filtro: v })}
                className={`rounded-full px-2.5 py-1 text-xs font-bold cursor-pointer ${filtro === v ? 'bg-orange-500 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>{l}</button>
            ))}
          </div>
          {admin && !lojaFixa && (
            <select value={loja} onChange={(e) => nav({ loja: e.target.value })} className="h-9 w-full rounded-lg border border-slate-300 px-2 text-sm">
              <option value="">Todas as lojas</option>
              {LOJAS.map(([s, n]) => <option key={s} value={s}>{n}</option>)}
              <option value="sem-loja">Sem loja definida</option>
            </select>
          )}
        </div>
        <ul className="max-h-[68dvh] divide-y divide-slate-100 overflow-y-auto">
          {lista?.leads.length === 0 && <li className="p-6 text-center text-sm text-slate-400">Nenhum lead neste filtro.</li>}
          {lista?.leads.map((l) => (
            <li key={l.id}>
              <button onClick={() => nav({ lead: l.id })}
                className={`block w-full px-3 py-2.5 text-left cursor-pointer hover:bg-slate-50 ${leadSel === l.id ? 'bg-orange-50' : ''}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-bold text-slate-900">
                    {l.naoLidas > 0 && <i className="mr-1.5 inline-block h-2 w-2 rounded-full bg-orange-500" />}
                    {l.nome || `+${l.telefone}`}
                  </span>
                  <span className="shrink-0 text-[11px] text-slate-400">{tempoRelativo(l.ultimaMensagem?.ts ?? l.criadoEm)}</span>
                </div>
                <p className="mt-0.5 truncate text-xs text-slate-500">
                  {l.ultimaMensagem ? `${l.ultimaMensagem.autor === 'lead' ? '' : '↩ '}${l.ultimaMensagem.texto}` : 'Sem mensagens ainda'}
                </p>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <TempBadge t={l.temperatura} score={l.score} />
                  <StatusBadge status={l.status} />
                  {l.humano && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800">humano</span>}
                </div>
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <section className={`${leadSel ? '' : 'hidden lg:flex'} min-h-[60dvh] rounded-2xl border border-slate-200 bg-white lg:flex-col`}>
        {leadSel ? (
          <Conversa key={leadSel} id={leadSel} admin={admin} onVoltar={() => nav({ lead: '' })} onMudou={() => void recarregar()} />
        ) : (
          <div className="m-auto p-6 text-sm text-slate-400">Selecione uma conversa</div>
        )}
      </section>
    </div>
  );
}

function Conversa({ id, admin, onVoltar, onMudou }: { id: string; admin: boolean; onVoltar: () => void; onMudou: () => void }) {
  const { data, recarregar } = usePolling<{ lead: LeadDet; mensagens: Msg[] }>(`/api/painel/leads/${id}?ler=1`, 3000);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState('');
  const fim = useRef<HTMLDivElement>(null);
  const total = data?.mensagens.length ?? 0;

  useEffect(() => { fim.current?.scrollIntoView({ block: 'end' }); }, [total]);

  if (!data) return <p className="m-auto p-6 text-sm text-slate-400">Carregando…</p>;
  const { lead, mensagens } = data;
  const p = lead.perfil;

  async function patch(body: Record<string, unknown>) {
    await api(`/api/painel/leads/${id}`, 'PATCH', body);
    await recarregar();
    onMudou();
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!texto.trim()) return;
    setEnviando(true);
    setAviso('');
    const r = await api<{ erro?: string }>(`/api/painel/leads/${id}/mensagem`, 'POST', { texto });
    setEnviando(false);
    if (r.ok) { setTexto(''); await recarregar(); onMudou(); }
    else setAviso(r.data.erro || 'Falha ao enviar.');
  }

  return (
    <div className="grid min-h-0 flex-1 xl:grid-cols-[1fr_17rem]">
      <div className="flex min-h-0 flex-col">
        <header className="flex items-center gap-2 border-b border-slate-100 p-3">
          <button onClick={onVoltar} className="rounded-lg px-2 py-1 text-sm font-bold text-sky-700 lg:hidden cursor-pointer">←</button>
          <div className="min-w-0 flex-1">
            <div className="truncate font-extrabold text-slate-900">{lead.nome || `+${lead.telefone}`}</div>
            <div className="text-xs text-slate-500">+{lead.telefone}</div>
          </div>
          <a href={`https://wa.me/${lead.telefone}`} target="_blank" rel="noopener noreferrer"
            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700">Abrir no WhatsApp</a>
        </header>

        <div className="max-h-[52dvh] min-h-[30dvh] flex-1 space-y-2 overflow-y-auto bg-slate-50 p-3">
          {mensagens.map((m) => (
            <div key={m.id} className={`flex ${m.autor === 'lead' ? 'justify-start' : m.autor === 'sistema' ? 'justify-center' : 'justify-end'}`}>
              <div className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm ${
                m.autor === 'lead' ? 'bg-white text-slate-900 shadow-sm'
                : m.autor === 'agente' ? 'bg-sky-600 text-white'
                : m.autor === 'humano' ? 'bg-emerald-600 text-white'
                : 'bg-amber-100 text-amber-900 text-xs'}`}>
                {m.midias.map((u) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={u} src={`/api/media/foto?u=${encodeURIComponent(u)}`} alt="" className="mb-1 max-h-48 rounded-lg" loading="lazy" />
                ))}
                {m.texto}
                <div className={`mt-1 text-[10px] ${m.autor === 'lead' ? 'text-slate-400' : 'text-white/70'}`}>
                  {m.autor === 'agente' ? '🤖 agente · ' : m.autor === 'humano' ? '👤 loja · ' : ''}{hora(m.ts)}
                </div>
              </div>
            </div>
          ))}
          <div ref={fim} />
        </div>

        <form onSubmit={enviar} className="border-t border-slate-100 p-3">
          {lead.humano ? (
            <p className="mb-2 text-xs font-semibold text-amber-700">
              ⏸ Agente pausado{lead.humanoMotivo ? ` — ${lead.humanoMotivo}` : ''}.{' '}
              <button type="button" onClick={() => patch({ humano: false })} className="underline cursor-pointer">Devolver ao agente</button>
            </p>
          ) : (
            <p className="mb-2 text-xs text-slate-500">🤖 O agente está atendendo. Ao enviar uma mensagem, você assume a conversa.</p>
          )}
          <div className="flex gap-2">
            <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={2} placeholder="Escreva uma mensagem…"
              className="min-h-11 flex-1 resize-none rounded-xl border border-slate-300 px-3 py-2 text-base focus:border-orange-500 focus:outline-none sm:text-sm"
              onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void enviar(e); }} />
            <button disabled={enviando || !texto.trim()} className="rounded-xl bg-orange-500 px-4 font-extrabold text-white disabled:opacity-50 cursor-pointer">
              {enviando ? '…' : 'Enviar'}
            </button>
          </div>
          {aviso && <p className="mt-1 text-xs font-semibold text-rose-600" role="alert">{aviso}</p>}
        </form>
      </div>

      <aside className="space-y-3 border-t border-slate-100 p-3 text-sm xl:border-l xl:border-t-0">
        <div className="flex flex-wrap items-center gap-1.5">
          <TempBadge t={lead.temperatura} score={lead.score} />
          <StatusBadge status={lead.status} />
        </div>
        {lead.resumo && <p className="rounded-lg bg-slate-50 p-2 text-xs text-slate-700">📝 {lead.resumo}</p>}

        <label className="block text-[11px] font-bold uppercase text-slate-500">Status
          <select value={lead.status} onChange={(e) => patch({ status: e.target.value })} className="mt-1 h-9 w-full rounded-lg border border-slate-300 px-2 text-sm normal-case">
            {Object.entries(STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        {admin && (
          <label className="block text-[11px] font-bold uppercase text-slate-500">Loja responsável
            <select value={lead.lojaSlug ?? ''} onChange={(e) => patch({ lojaSlug: e.target.value || null })} className="mt-1 h-9 w-full rounded-lg border border-slate-300 px-2 text-sm normal-case">
              <option value="">— sem loja —</option>
              {LOJAS.map(([s, n]) => <option key={s} value={s}>{n}</option>)}
            </select>
          </label>
        )}

        <dl className="space-y-1 text-xs">
          <Linha k="Interesse" v={p.veiculosInteresse.join(', ') || p.marca_modelo || p.categoria} />
          <Linha k="Orçamento" v={p.orcamento ? brl(p.orcamento) : null} />
          <Linha k="Entrada" v={p.entrada !== null ? brl(p.entrada) : null} />
          <Linha k="Parcela" v={p.parcelaDesejada ? brl(p.parcelaDesejada) : null} />
          <Linha k="Pagamento" v={p.formaPagamento} />
          <Linha k="Troca" v={p.temTroca === null ? null : p.temTroca ? [p.trocaModelo, p.trocaAno, p.trocaKm].filter(Boolean).join(' ') || 'Sim' : 'Não'} />
          <Linha k="Prazo" v={p.prazoCompra?.replace(/_/g, ' ')} />
          <Linha k="Visita" v={lead.visita.quando} />
          <Linha k="Origem" v={[lead.origem.canal, lead.origem.utm_campaign, lead.origem.ad_headline].filter(Boolean).join(' · ')} />
        </dl>

        {admin && (
          <button
            type="button"
            onClick={async () => {
              if (!window.confirm(`Excluir DEFINITIVAMENTE ${lead.nome || lead.telefone}, a conversa e o histórico? Use só a pedido do cliente (LGPD). Não pode ser desfeito.`)) return;
              const r = await api<{ erro?: string }>(`/api/painel/leads/${id}`, 'DELETE');
              if (r.ok) { onMudou(); onVoltar(); } else window.alert(r.data.erro || 'Falha ao excluir.');
            }}
            className="w-full rounded-lg border border-rose-200 px-2 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-50 cursor-pointer"
          >
            Excluir dados do cliente (LGPD)
          </button>
        )}

        <label className="block text-[11px] font-bold uppercase text-slate-500">Anotações da loja
          <textarea defaultValue={lead.notas} rows={3} onBlur={(e) => { if (e.target.value !== lead.notas) void patch({ notas: e.target.value }); }}
            className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm normal-case focus:border-orange-500 focus:outline-none" />
        </label>
      </aside>
    </div>
  );
}

function Linha({ k, v }: { k: string; v: string | null | undefined }) {
  return (
    <div className="flex justify-between gap-2 border-b border-slate-100 pb-1">
      <dt className="text-slate-500">{k}</dt>
      <dd className="text-right font-semibold text-slate-800">{v || '—'}</dd>
    </div>
  );
}
