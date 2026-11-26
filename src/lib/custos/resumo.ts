import { carregarAds, type Periodo as PeriodoAds } from '../ads/insights';
import { listLeads } from '../db/store';
import { configCustos, custoUsd, lerUsos, precoDoModelo, type ServicoApi } from './medidor';

export type PeriodoCustos = 'hoje' | '7d' | '30d' | 'mes';
export const PERIODOS_CUSTOS: Array<[PeriodoCustos, string]> = [['hoje', 'Hoje'], ['7d', '7 dias'], ['30d', '30 dias'], ['mes', 'Este mês']];

const DIA = 86400_000;
const BRT = 3 * 3600_000;

/** Início do dia em Brasília (UTC-3). */
const inicioDia = (ts: number) => {
  const d = new Date(ts - BRT);
  d.setUTCHours(0, 0, 0, 0);
  return d.getTime() + BRT;
};
const inicioMes = (ts: number) => {
  const d = new Date(ts - BRT);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) + BRT;
};
const diasNoMes = (ts: number) => {
  const d = new Date(ts - BRT);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
};
const diaBrt = (ts: number) => new Date(ts - BRT).toISOString().slice(0, 10);

function inicioDoPeriodo(p: PeriodoCustos, agora: number): number {
  if (p === 'hoje') return inicioDia(agora);
  if (p === '7d') return inicioDia(agora) - 6 * DIA;
  if (p === '30d') return inicioDia(agora) - 29 * DIA;
  return inicioMes(agora);
}

const ADS: Record<PeriodoCustos, PeriodoAds | null> = { hoje: 'today', '7d': 'last_7d', '30d': 'last_30d', mes: null };

export async function montarCustos(periodo: PeriodoCustos, agora = Date.now()) {
  const cfg = configCustos();
  const ini = inicioDoPeriodo(periodo, agora);
  // o mês corrente (para a projeção) pode começar antes do período escolhido
  const desdeLeitura = Math.min(ini, inicioMes(agora));
  const todos = await lerUsos(new Date(desdeLeitura).toISOString());
  const usos = todos.filter((u) => Date.parse(u.ts) >= ini);
  const doMes = todos.filter((u) => Date.parse(u.ts) >= inicioMes(agora));

  const brl = (usd: number) => usd * cfg.cotacaoUsdBrl;
  const somaUsd = (l: typeof usos) => l.reduce((s, u) => s + custoUsd(u, cfg), 0);

  // por serviço/modelo
  const porModelo = new Map<string, { servico: ServicoApi; modelo: string; chamadas: number; entrada: number; saida: number; cacheEscrita: number; cacheLeitura: number; usd: number; precoCadastrado: boolean }>();
  for (const u of usos) {
    const k = `${u.servico}|${u.modelo}`;
    const x = porModelo.get(k) ?? { servico: u.servico, modelo: u.modelo, chamadas: 0, entrada: 0, saida: 0, cacheEscrita: 0, cacheLeitura: 0, usd: 0, precoCadastrado: precoDoModelo(cfg, u).cadastrado };
    x.chamadas++;
    x.entrada += u.entrada;
    x.saida += u.saida;
    x.cacheEscrita += u.cacheEscrita;
    x.cacheLeitura += u.cacheLeitura;
    x.usd += custoUsd(u, cfg);
    porModelo.set(k, x);
  }

  // por dia
  const dias = new Map<string, { anthropic: number; openai: number }>();
  for (let t = ini; t <= agora; t += DIA) dias.set(diaBrt(t), { anthropic: 0, openai: 0 });
  for (const u of usos) {
    const d = dias.get(diaBrt(Date.parse(u.ts)));
    if (d) d[u.servico] += brl(custoUsd(u, cfg));
  }

  // custo por lead
  const leads = listLeads().filter((l) => !l.teste && Date.parse(l.criadoEm) >= ini);
  const conversaram = leads.filter((l) => l.totalMensagensLead > 0).length;
  const qualificados = leads.filter((l) => l.qualificadoEm).length;
  const totalBrl = brl(somaUsd(usos));

  // projeção do mês (só APIs por uso): média diária dos dias decorridos × dias do mês
  const diasDecorridos = Math.max(1, Math.ceil((agora - inicioMes(agora)) / DIA));
  const mesBrl = brl(somaUsd(doMes));
  const projecaoMesBrl = (mesBrl / diasDecorridos) * diasNoMes(agora);

  const fixosMensalBrl = cfg.fixos.reduce((s, f) => s + (f.valorMensalBrl || 0), 0);

  // anúncios (gasto exato informado pela própria Meta; fora do total de APIs)
  let anuncios: { configurado: boolean; gastoBrl: number | null; erro?: string; nota?: string } = { configurado: false, gastoBrl: null };
  const pAds = ADS[periodo];
  try {
    const a = await carregarAds(pAds ?? 'last_30d');
    anuncios = { configurado: a.configurado, gastoBrl: a.configurado ? a.totais.gasto : null, erro: a.erro };
    if (!pAds && a.configurado) anuncios.nota = 'Para "Este mês", os anúncios mostram os últimos 30 dias.';
  } catch (e) {
    anuncios.erro = e instanceof Error ? e.message : String(e);
  }

  return {
    periodo,
    desde: new Date(ini).toISOString(),
    config: cfg,
    totais: {
      apisBrl: totalBrl,
      apisUsd: somaUsd(usos),
      anthropicBrl: brl(somaUsd(usos.filter((u) => u.servico === 'anthropic'))),
      openaiBrl: brl(somaUsd(usos.filter((u) => u.servico === 'openai'))),
      chamadas: usos.length,
      mesBrl,
      projecaoMesBrl,
      fixosMensalBrl,
      /** estimativa mensal do sistema: APIs por uso (projeção) + custos fixos */
      sistemaMensalEstimadoBrl: projecaoMesBrl + fixosMensalBrl,
    },
    porModelo: [...porModelo.values()].map((m) => ({ ...m, brl: brl(m.usd) })).sort((a, b) => b.brl - a.brl),
    porDia: [...dias.entries()].map(([dia, v]) => ({ dia, ...v })),
    porLead: {
      leads: leads.length,
      conversaram,
      qualificados,
      brlPorConversa: conversaram ? totalBrl / conversaram : null,
      brlPorQualificado: qualificados ? totalBrl / qualificados : null,
    },
    anuncios,
    semPrecoCadastrado: [...porModelo.values()].filter((m) => !m.precoCadastrado).map((m) => m.modelo),
    primeiroRegistro: todos[0]?.ts ?? null,
  };
}
