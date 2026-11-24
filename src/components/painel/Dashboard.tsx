'use client';

import Link from 'next/link';
import { Barras, Card, Kpi, tempoRelativo, usePolling } from './ui';

interface Stats {
  atualizadoEm: string;
  kpis: {
    total: number; hoje: number; qualificados: number; qualificadosHoje: number; quentes: number;
    visitasAgendadas: number; aguardandoHumano: number; naoLidas: number; comprou: number;
  };
  taxaQualificacao: number;
  funil: Array<{ etapa: string; n: number }>;
  serie: Array<{ dia: string; leads: number; qualificados: number }>;
  porOrigem: Array<{ nome: string; leads: number; qualificados: number }>;
  porCampanha: Array<{ nome: string; leads: number; qualificados: number }>;
  porLoja: Array<{ slug: string; nome: string; cor: string; leads: number; qualificados: number; visitas: number; pendentes: number }>;
  semLoja: number;
  site: { cliquesWhatsapp: number; formularios: number };
  aoVivo: Array<{ id: string; tipo: string; ts: string; leadId: string | null; nome: string; lojaSlug: string | null; meta: Record<string, unknown> }>;
}

const EVENTO: Record<string, string> = {
  lead_criado: '🆕 Novo lead',
  primeira_resposta: '💬 Cliente respondeu',
  qualificado: '✅ Lead QUALIFICADO',
  visita_agendada: '📅 Visita agendada',
  handoff_humano: '🙋 Pediu atendimento humano',
  fotos_enviadas: '📸 Fotos enviadas',
  convite_enviado: '🎟️ Convite enviado',
  followup: '🔁 Follow-up enviado',
  lembrete_visita: '⏰ Lembrete de visita',
  optout: '🚫 Pediu para sair',
  lead_status: '🔄 Status alterado',
  site_form: '📝 Formulário no site',
};

export function Dashboard({ baseConversas, escopoLoja }: { baseConversas: string; escopoLoja: boolean }) {
  const { data: s, erro } = usePolling<Stats>('/api/painel/stats', 5000);
  if (!s) return <p className="p-6 text-sm text-slate-500">{erro ? `Erro: ${erro}` : 'Carregando…'}</p>;
  const k = s.kpis;
  const maxFunil = Math.max(1, s.funil[0].n);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-xs text-slate-500">
        <span className="relative flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
        </span>
        Ao vivo · atualiza a cada 5 s
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Leads" valor={k.total} sub={`+${k.hoje} hoje`} />
        <Kpi label="Qualificados" valor={k.qualificados} sub={`${(s.taxaQualificacao * 100).toFixed(0)}% dos leads · +${k.qualificadosHoje} hoje`} destaque />
        <Kpi label="Quentes agora" valor={k.quentes} sub="score ≥ 70, em aberto" />
        <Kpi label="Visitas agendadas" valor={k.visitasAgendadas} />
        <Link href={`${baseConversas}?filtro=humano`}><Kpi label="Aguardando humano" valor={k.aguardandoHumano} sub="clique para atender" destaque={k.aguardandoHumano > 0} /></Link>
        <Link href={`${baseConversas}?filtro=naolidas`}><Kpi label="Com mensagem nova" valor={k.naoLidas} /></Link>
        <Kpi label="Cliques WhatsApp (7d)" valor={s.site.cliquesWhatsapp} sub="no site" />
        <Kpi label="Compraram" valor={k.comprou} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card titulo="Funil">
          <ul className="space-y-2">
            {s.funil.map((f, i) => (
              <li key={f.etapa}>
                <div className="flex justify-between text-xs font-semibold text-slate-700">
                  <span>{f.etapa}</span>
                  <span className="tabular-nums">
                    {f.n}
                    {i > 0 && s.funil[i - 1].n > 0 && <span className="ml-1 text-slate-400">({Math.round((f.n / s.funil[i - 1].n) * 100)}%)</span>}
                  </span>
                </div>
                <div className="mt-1 h-2.5 rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-orange-500" style={{ width: `${(f.n / maxFunil) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </Card>

        <Card titulo="Últimos 14 dias">
          <Barras dados={s.serie} />
          <div className="mt-2 flex gap-4 text-[11px] text-slate-500">
            <span><i className="mr-1 inline-block h-2 w-2 rounded-sm bg-sky-200" />Leads</span>
            <span><i className="mr-1 inline-block h-2 w-2 rounded-sm bg-emerald-500" />Qualificados</span>
          </div>
        </Card>

        <Card titulo="Acontecendo agora">
          <ul className="max-h-64 space-y-2 overflow-y-auto text-sm">
            {s.aoVivo.length === 0 && <li className="text-slate-400">Nada ainda. Os eventos aparecem aqui em tempo real.</li>}
            {s.aoVivo.map((e) => (
              <li key={e.id} className="flex items-start justify-between gap-2">
                <span>
                  {EVENTO[e.tipo] ?? e.tipo}
                  {e.nome && (e.leadId ? (
                    <Link href={`${baseConversas}?lead=${e.leadId}`} className="ml-1 font-semibold text-sky-700 hover:underline">{e.nome}</Link>
                  ) : <span className="ml-1 font-semibold">{e.nome}</span>)}
                </span>
                <span className="shrink-0 text-xs text-slate-400">{tempoRelativo(e.ts)}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {!escopoLoja && (
        <Card titulo="Desempenho por loja">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-[11px] uppercase text-slate-500">
                <tr><th className="py-1">Loja</th><th>Leads</th><th>Qualificados</th><th>Visitas</th><th>Pendentes</th><th /></tr>
              </thead>
              <tbody>
                {s.porLoja.map((l) => (
                  <tr key={l.slug} className="border-t border-slate-100">
                    <td className="py-2 font-bold" style={{ color: l.cor }}>{l.nome}</td>
                    <td className="tabular-nums">{l.leads}</td>
                    <td className="tabular-nums">{l.qualificados}</td>
                    <td className="tabular-nums">{l.visitas}</td>
                    <td className="tabular-nums">{l.pendentes}</td>
                    <td className="text-right"><Link className="text-xs font-bold text-sky-700 hover:underline" href={`${baseConversas}?loja=${l.slug}`}>Ver conversas</Link></td>
                  </tr>
                ))}
                {s.semLoja > 0 && (
                  <tr className="border-t border-slate-100 text-slate-500">
                    <td className="py-2">Sem loja definida</td><td>{s.semLoja}</td><td colSpan={3} />
                    <td className="text-right"><Link className="text-xs font-bold text-sky-700 hover:underline" href={`${baseConversas}?loja=sem-loja`}>Distribuir</Link></td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Tabela titulo="Origem dos leads" linhas={s.porOrigem} />
        <Tabela titulo="Campanhas (UTM / anúncio)" linhas={s.porCampanha} />
      </div>
    </div>
  );
}

function Tabela({ titulo, linhas }: { titulo: string; linhas: Array<{ nome: string; leads: number; qualificados: number }> }) {
  return (
    <Card titulo={titulo}>
      <table className="w-full text-sm">
        <thead className="text-left text-[11px] uppercase text-slate-500"><tr><th className="py-1">Nome</th><th>Leads</th><th>Qualif.</th></tr></thead>
        <tbody>
          {linhas.length === 0 && <tr><td colSpan={3} className="py-3 text-slate-400">Sem dados ainda.</td></tr>}
          {linhas.map((l) => (
            <tr key={l.nome} className="border-t border-slate-100">
              <td className="max-w-[16rem] truncate py-1.5" title={l.nome}>{l.nome}</td>
              <td className="tabular-nums">{l.leads}</td>
              <td className="tabular-nums">{l.qualificados}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
