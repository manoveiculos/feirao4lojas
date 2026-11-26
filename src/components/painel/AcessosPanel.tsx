'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import type { Jornada, montarResumo } from '@/lib/acessos/agregar';
import {
  ACAO_LABEL,
  CANAIS,
  CANAL_LABEL,
  PERIODOS,
  TEMPERATURA_LABEL,
  formatarDuracao,
  type Canal,
  type NivelTemperatura,
  type Periodo,
} from '@/lib/acessos/tipos';
import { brl, Card, hora, Kpi, tempoRelativo, usePolling } from './ui';

type Resumo = ReturnType<typeof montarResumo> & { banco: boolean };

const COR_CANAL: Record<Canal, string> = {
  meta_ads: 'bg-blue-100 text-blue-800',
  google_ads: 'bg-amber-100 text-amber-900',
  tiktok_ads: 'bg-fuchsia-100 text-fuchsia-800',
  organico: 'bg-emerald-100 text-emerald-800',
  direto: 'bg-slate-100 text-slate-700',
};

const COR_TEMP: Record<NivelTemperatura, string> = {
  muito_quente: 'bg-rose-600 text-white',
  quente: 'bg-orange-500 text-white',
  morno: 'bg-amber-100 text-amber-800',
  frio: 'bg-slate-100 text-slate-600',
};

const ICONE_ACAO: Record<string, string> = {
  page_view: '👁️',
  view_vehicle: '🚗',
  filter_stock: '🔎',
  simulacao: '💰',
  troca: '🔁',
  whatsapp_click: '💬',
  popup_saida: '🚪',
  lead_formulario: '📝',
};

const pct = (n: number) => `${(n * 100).toFixed(n >= 0.1 ? 0 : 1)}%`;

function Barra({ valor, max, cor = 'bg-orange-500' }: { valor: number; max: number; cor?: string }) {
  return (
    <div className="h-2 rounded-full bg-slate-100">
      <div className={`h-full rounded-full ${cor}`} style={{ width: `${max ? Math.max(valor ? 3 : 0, (valor / max) * 100) : 0}%` }} />
    </div>
  );
}

export function AcessosPanel() {
  const [periodo, setPeriodo] = useState<Periodo>('hoje');
  const [filtroCanal, setFiltroCanal] = useState<Canal | 'todos'>('todos');
  const { data: r, erro } = usePolling<Resumo>(`/api/painel/acessos/resumo?periodo=${periodo}`, 5000);
  const { data: j } = usePolling<{ jornadas: Jornada[] }>(`/api/painel/acessos/jornadas?periodo=${periodo}`, 10000);

  if (!r) return <p className="p-6 text-sm text-slate-500">{erro ? `Erro: ${erro}` : 'Carregando…'}</p>;
  const k = r.kpis;
  const maxFunil = Math.max(1, r.funil[0].n);
  const maxHora = Math.max(1, ...r.horas);
  const maxDia = Math.max(1, ...r.dias.map((d) => d.visitantes));

  return (
    <div className="space-y-4">
      {/* Topo: ao vivo + período */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-2 rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-extrabold uppercase tracking-wide text-white">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-white" />
          </span>
          {r.aoVivo.total} {r.aoVivo.total === 1 ? 'pessoa' : 'pessoas'} no site agora
        </span>
        {PERIODOS.map(([v, l]) => (
          <button
            key={v}
            onClick={() => setPeriodo(v)}
            aria-pressed={periodo === v}
            className={`rounded-full px-3 py-1.5 text-xs font-bold cursor-pointer ${periodo === v ? 'bg-orange-500 text-white' : 'bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100'}`}
          >
            {l}
          </button>
        ))}
        <span className="ml-auto text-xs text-slate-500">Atualiza a cada 5 s</span>
      </div>

      {!r.banco && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          O banco não está conectado: os acessos ficam só na memória/arquivos do servidor. Configure <code>SUPABASE_URL</code> e{' '}
          <code>SUPABASE_SERVICE_ROLE_KEY</code> para guardar o histórico com segurança.
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Visitantes" valor={k.visitantes} sub={`${k.sessoes} visitas · ${k.paginasVistas} páginas`} />
        <Kpi label="Abriram um carro" valor={k.carrosAbertos} sub="aberturas de ficha" />
        <Kpi label="Cliques no WhatsApp" valor={k.cliquesWhatsapp} destaque />
        <Kpi label="Deixaram contato" valor={k.formularios} sub="nome e telefone" />
        <Kpi label="Taxa de contato" valor={pct(k.taxaContato)} sub="visitantes que chamaram ou deixaram contato" destaque />
        <Kpi label="Tempo médio na página" valor={formatarDuracao(k.tempoMedioPaginaSeg)} sub="tempo ativo" />
        <Kpi label="Viraram lead no CRM" valor={k.leadsCrm} />
        <Kpi label="Qualificados" valor={k.qualificadosCrm} sub="pelo agente" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Funil */}
        <Card titulo="Funil do visitante">
          <ul className="space-y-2.5">
            {r.funil.map((f, i) => (
              <li key={f.etapa}>
                <div className="flex justify-between text-xs font-semibold text-slate-700">
                  <span>{f.etapa}</span>
                  <span className="tabular-nums">
                    {f.n}
                    {i > 0 && r.funil[i - 1].n > 0 && <span className="ml-1 text-slate-400">({Math.round((f.n / r.funil[i - 1].n) * 100)}%)</span>}
                  </span>
                </div>
                <Barra valor={f.n} max={maxFunil} />
              </li>
            ))}
          </ul>
        </Card>

        {/* Canais */}
        <Card titulo="De onde vêm (clique para filtrar as jornadas)">
          <ul className="space-y-2">
            {r.canais.map((c) => (
              <li key={c.canal}>
                <button
                  onClick={() => setFiltroCanal(filtroCanal === c.canal ? 'todos' : c.canal)}
                  aria-pressed={filtroCanal === c.canal}
                  className={`flex w-full items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left cursor-pointer ${filtroCanal === c.canal ? 'border-orange-400 bg-orange-50' : 'border-slate-200 hover:bg-slate-50'}`}
                >
                  <span>
                    <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-bold ${COR_CANAL[c.canal]}`}>{c.label}</span>
                    <span className="mt-1 block text-[11px] text-slate-500">
                      {c.whatsapp} WhatsApp · {c.leads} contatos · {c.qualificados} qualif.
                    </span>
                  </span>
                  <span className="text-right">
                    <span className="block text-lg font-extrabold tabular-nums text-slate-900">{c.visitantes}</span>
                    <span className="text-[11px] text-slate-500">{pct(c.taxa)} contato</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Card>

        {/* Ao vivo */}
        <Card titulo="Agora no site">
          <ul className="max-h-72 space-y-2 overflow-y-auto text-sm">
            {r.aoVivo.visitantes.length === 0 && <li className="text-slate-400">Ninguém nos últimos 5 minutos.</li>}
            {r.aoVivo.visitantes.map((v) => (
              <li key={v.id} className="rounded-lg border border-slate-100 p-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-semibold text-slate-900">
                    {v.nome || (v.cidade ? `${v.cidade}${v.uf ? `/${v.uf}` : ''}` : 'Visitante')}
                  </span>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${COR_TEMP[v.temperatura]}`}>{TEMPERATURA_LABEL[v.temperatura]}</span>
                </div>
                <div className="truncate text-xs text-slate-600">{v.vendo}</div>
                <div className="truncate text-[11px] text-slate-400">
                  {v.aparelho} · {v.origem} · {tempoRelativo(v.ultimaAtividade)}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card titulo="Campanhas (cruzadas com os leads do CRM)">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-sm">
              <thead className="text-left text-[11px] uppercase text-slate-500">
                <tr><th className="py-1">Campanha</th><th>Visit.</th><th>WhatsApp</th><th>Contatos</th><th>Qualif.</th></tr>
              </thead>
              <tbody>
                {r.campanhas.length === 0 && <tr><td colSpan={5} className="py-3 text-slate-400">Sem campanhas com utm_campaign no período.</td></tr>}
                {r.campanhas.map((c) => (
                  <tr key={c.nome} className="border-t border-slate-100">
                    <td className="max-w-[14rem] truncate py-1.5" title={c.nome}>
                      <span className={`mr-1.5 rounded px-1 text-[10px] font-bold ${COR_CANAL[c.canal]}`}>{CANAL_LABEL[c.canal].split(' ')[0]}</span>
                      {c.nome}
                    </td>
                    <td className="tabular-nums">{c.visitantes}</td>
                    <td className="tabular-nums">{c.whatsapp}</td>
                    <td className="tabular-nums">{c.leads}</td>
                    <td className="tabular-nums font-bold text-emerald-700">{c.qualificados}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card titulo="Carros mais vistos">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-sm">
              <thead className="text-left text-[11px] uppercase text-slate-500">
                <tr><th className="py-1">Carro</th><th>Pessoas</th><th>Tempo médio</th><th>Fotos</th><th>Contato</th></tr>
              </thead>
              <tbody>
                {r.carros.length === 0 && <tr><td colSpan={5} className="py-3 text-slate-400">Ninguém abriu a ficha de um carro no período.</td></tr>}
                {r.carros.map((c) => (
                  <tr key={c.id ?? c.nome} className="border-t border-slate-100">
                    <td className="max-w-[16rem] truncate py-1.5" title={c.nome}>
                      {c.nome}
                      {c.valor ? <span className="ml-1 text-xs text-slate-400">{brl(c.valor)}</span> : null}
                    </td>
                    <td className="tabular-nums">{c.visitantes}</td>
                    <td className="tabular-nums">{formatarDuracao(c.tempoMedioSeg)}</td>
                    <td className="tabular-nums">{c.fotosMedia}</td>
                    <td className="tabular-nums font-bold text-emerald-700">{c.pediramContato}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Lista titulo="Cidades" itens={r.cidades} />
        <Lista titulo="Aparelhos" itens={r.aparelhos} />
        <Lista titulo="Navegadores" itens={r.navegadores} />
        <Lista titulo="Origem detalhada" itens={r.origens} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card titulo="Visitantes por hora do dia (Brasília)">
          <div className="flex h-32 gap-1">
            {r.horas.map((n, h) => (
              <div key={h} className="flex min-w-0 flex-1 flex-col items-center gap-1" title={`${h}h: ${n} visitantes`}>
                <div className="flex w-full flex-1 items-end">
                  <div className="w-full rounded-t bg-sky-400" style={{ height: `${(n / maxHora) * 100}%`, minHeight: n ? 3 : 0 }} />
                </div>
                <span className="text-[9px] text-slate-500">{h % 3 === 0 ? h : ''}</span>
              </div>
            ))}
          </div>
        </Card>
        <Card titulo="Visitantes por dia">
          {r.dias.length === 0 ? (
            <p className="text-sm text-slate-400">Sem dados no período.</p>
          ) : (
            <ul className="max-h-36 space-y-1.5 overflow-y-auto">
              {r.dias.map((d) => (
                <li key={d.dia} className="grid grid-cols-[3rem_1fr_6rem] items-center gap-2 text-xs">
                  <span className="text-slate-500">{d.dia}</span>
                  <Barra valor={d.visitantes} max={maxDia} cor="bg-sky-400" />
                  <span className="text-right tabular-nums text-slate-700">{d.visitantes} · {d.whatsapp} WA</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Jornadas jornadas={j?.jornadas ?? null} filtroCanal={filtroCanal} onCanal={setFiltroCanal} />
    </div>
  );
}

function Lista({ titulo, itens }: { titulo: string; itens: Array<{ nome: string; visitantes: number }> }) {
  const max = Math.max(1, ...itens.map((i) => i.visitantes));
  return (
    <Card titulo={titulo}>
      <ul className="space-y-1.5">
        {itens.length === 0 && <li className="text-sm text-slate-400">Sem dados.</li>}
        {itens.map((i) => (
          <li key={i.nome}>
            <div className="flex justify-between gap-2 text-xs text-slate-700">
              <span className="truncate" title={i.nome}>{i.nome}</span>
              <span className="tabular-nums font-semibold">{i.visitantes}</span>
            </div>
            <Barra valor={i.visitantes} max={max} cor="bg-slate-400" />
          </li>
        ))}
      </ul>
    </Card>
  );
}

// ───────────────────────── Jornadas ─────────────────────────

function Jornadas({ jornadas, filtroCanal, onCanal }: { jornadas: Jornada[] | null; filtroCanal: Canal | 'todos'; onCanal: (c: Canal | 'todos') => void }) {
  const [temp, setTemp] = useState<'todas' | 'quentes' | 'whatsapp'>('todas');
  const [cidade, setCidade] = useState('');
  const [carro, setCarro] = useState('');
  const [busca, setBusca] = useState('');

  const cidades = useMemo(() => [...new Set((jornadas ?? []).map((x) => x.cidade).filter((c): c is string => Boolean(c)))].sort(), [jornadas]);
  const carros = useMemo(() => [...new Set((jornadas ?? []).flatMap((x) => x.carros.map((c) => c.nome)))].sort(), [jornadas]);

  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return (jornadas ?? []).filter((x) => {
      if (filtroCanal !== 'todos' && x.canal !== filtroCanal) return false;
      if (temp === 'quentes' && !['quente', 'muito_quente'].includes(x.temperatura.nivel)) return false;
      if (temp === 'whatsapp' && !x.clicouWhatsApp) return false;
      if (cidade && x.cidade !== cidade) return false;
      if (carro && !x.carros.some((c) => c.nome === carro)) return false;
      if (q) {
        const texto = [x.subOrigem, x.campanha, x.cidade, x.lead?.nome, x.lead?.telefone, ...x.carros.map((c) => c.nome), ...x.passos.map((p) => p.detalhe)].join(' ').toLowerCase();
        if (!texto.includes(q)) return false;
      }
      return true;
    });
  }, [jornadas, filtroCanal, temp, cidade, carro, busca]);

  const sel = 'h-9 max-w-[14rem] rounded-lg border border-slate-300 bg-white px-2 text-sm';

  return (
    <Card titulo={`O que cada visitante fez no site (${lista.length})`}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <select value={filtroCanal} onChange={(e) => onCanal(e.target.value as Canal | 'todos')} className={sel} aria-label="Canal">
          <option value="todos">Todos os canais</option>
          {CANAIS.map((c) => <option key={c} value={c}>{CANAL_LABEL[c]}</option>)}
        </select>
        <select value={temp} onChange={(e) => setTemp(e.target.value as typeof temp)} className={sel} aria-label="Temperatura">
          <option value="todas">Qualquer temperatura</option>
          <option value="quentes">Quentes e muito quentes</option>
          <option value="whatsapp">Clicaram no WhatsApp</option>
        </select>
        <select value={cidade} onChange={(e) => setCidade(e.target.value)} className={sel} aria-label="Cidade">
          <option value="">Todas as cidades</option>
          {cidades.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={carro} onChange={(e) => setCarro(e.target.value)} className={sel} aria-label="Carro">
          <option value="">Todos os carros</option>
          {carros.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar nome, carro, campanha…"
          className="h-9 min-w-[12rem] flex-1 rounded-lg border border-slate-300 px-3 text-sm focus:border-orange-500 focus:outline-none" />
      </div>

      {jornadas === null ? (
        <p className="py-6 text-center text-sm text-slate-400">Carregando…</p>
      ) : lista.length === 0 ? (
        <div className="py-10 text-center text-slate-500">
          <p className="text-sm font-bold">Nenhum acesso para este filtro/período.</p>
          <p className="mt-1 text-xs text-slate-400">Assim que alguém navegar pelo site, cada passo aparece aqui. Para não contar as suas visitas, abra o site com <code>?notrack=1</code> neste aparelho.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {lista.map((x) => <JornadaCard key={x.id} j={x} />)}
        </div>
      )}
    </Card>
  );
}

const MAX_PASSOS = 12;

function JornadaCard({ j }: { j: Jornada }) {
  const [aberto, setAberto] = useState(false);
  const passos = aberto ? j.passos : j.passos.slice(-MAX_PASSOS);

  return (
    <article className="rounded-xl border border-slate-200 p-3">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${COR_TEMP[j.temperatura.nivel]}`} title={j.temperatura.motivos.join(' • ') || 'Sem sinais de interesse ainda'}>
          {TEMPERATURA_LABEL[j.temperatura.nivel]} · {j.temperatura.score}
        </span>
        <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-bold ${COR_CANAL[j.canal]}`}>{CANAL_LABEL[j.canal]}</span>
        {j.aoVivo && <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700"><i className="h-2 w-2 rounded-full bg-emerald-500" />online</span>}
        <span className="text-sm font-bold text-slate-900">
          {j.lead ? j.lead.nome || `+${j.lead.telefone}` : 'Visitante anônimo'}
        </span>
        <span className="text-xs text-slate-500">
          {j.cidade ? `${j.cidade}${j.uf ? `/${j.uf}` : ''} · ` : ''}{j.aparelho} · {formatarDuracao(j.tempoTotalSeg)} no site · {hora(j.primeiroAcesso)}
        </span>
      </header>

      <p className="mt-1 text-xs text-slate-500">
        Origem: {j.subOrigem || '—'}{j.campanha ? <> · campanha <b className="text-slate-700">{j.campanha}</b></> : null}
      </p>

      {j.lead && (
        <p className="mt-1.5 text-xs">
          <span className="rounded bg-emerald-50 px-1.5 py-0.5 font-bold text-emerald-800">Lead no CRM</span>{' '}
          +{j.lead.telefone} · {j.lead.status.replace(/_/g, ' ')} · score {j.lead.score}{j.lead.lojaNome ? ` · ${j.lead.lojaNome}` : ''}{' '}
          <Link href={`/admin/conversas?lead=${j.lead.id}`} className="font-bold text-sky-700 hover:underline">ver conversa →</Link>
        </p>
      )}

      {j.carros.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {j.carros.map((c) => (
            <span key={c.chave} className="rounded-md bg-slate-100 px-2 py-1 text-[11px] text-slate-700">
              🚗 <b>{c.nome}</b> · {formatarDuracao(c.tempo_segundos)}{c.fotos_vistas ? ` · ${c.fotos_vistas} fotos` : ''}{c.abriu_galeria ? ' · galeria' : ''}{c.visitas > 1 ? ` · ${c.visitas}x` : ''}
            </span>
          ))}
        </div>
      )}

      <ol className="mt-2 space-y-1 border-l-2 border-slate-200 pl-3">
        {passos.map((p) => (
          <li key={p.id} className="text-xs text-slate-700">
            <span className="mr-1">{ICONE_ACAO[p.acao] ?? '•'}</span>
            <span className="font-semibold">{p.acao === 'view_vehicle' ? `Abriu: ${p.veiculo_nome ?? 'carro'}` : p.detalhe || ACAO_LABEL[p.acao]}</span>
            {(p.acao === 'view_vehicle' || p.acao === 'page_view') && p.tempo_segundos > 0 && <span className="text-slate-500"> · {formatarDuracao(p.tempo_segundos)} ativo</span>}
            {p.acao === 'page_view' && p.scroll_max > 0 && <span className="text-slate-500"> · rolou {p.scroll_max}%</span>}
            <span className="ml-1 text-[10px] text-slate-400">{hora(p.criado_em).slice(-5)}</span>
          </li>
        ))}
      </ol>
      {j.passos.length > MAX_PASSOS && (
        <button onClick={() => setAberto(!aberto)} className="mt-1.5 text-xs font-bold text-sky-700 hover:underline cursor-pointer">
          {aberto ? 'Mostrar menos' : `Ver todos os ${j.passos.length} passos`}
        </button>
      )}
    </article>
  );
}
