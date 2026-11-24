import { listEventos, listLeads } from '../db/store';

export type Periodo = 'today' | 'yesterday' | 'last_7d' | 'last_14d' | 'last_30d' | 'maximum';
export const PERIODOS: Periodo[] = ['today', 'yesterday', 'last_7d', 'last_14d', 'last_30d', 'maximum'];

interface LinhaMeta {
  campaign_id?: string;
  campaign_name?: string;
  adset_name?: string;
  ad_id?: string;
  ad_name?: string;
  spend?: string;
  impressions?: string;
  clicks?: string;
  actions?: Array<{ action_type: string; value: string }>;
}

export interface LinhaCampanha {
  campanhaId: string;
  campanha: string;
  anuncios: Array<{ adId: string; nome: string; gasto: number; leads: number; qualificados: number }>;
  gasto: number;
  impressoes: number;
  cliques: number;
  ctr: number;
  cpc: number;
  conversasMeta: number;
  leads: number;
  qualificados: number;
  visitas: number;
  cpl: number | null;
  cpq: number | null;
}

export interface ResultadoAds {
  configurado: boolean;
  erro?: string;
  periodo: Periodo;
  atualizadoEm: string;
  campanhas: LinhaCampanha[];
  totais: {
    gasto: number;
    leads: number;
    qualificados: number;
    visitas: number;
    cpl: number | null;
    cpq: number | null;
  };
  semAtribuicao: { leads: number; qualificados: number };
}

const cache = new Map<string, { ts: number; data: LinhaMeta[] }>();

async function graph(path: string, params: Record<string, string>): Promise<{ data?: LinhaMeta[]; error?: { message: string } }> {
  const qs = new URLSearchParams({ ...params, access_token: process.env.META_ADS_TOKEN || '' });
  const res = await fetch(`https://graph.facebook.com/v21.0/${path}?${qs}`, {
    signal: AbortSignal.timeout(20_000),
  });
  return res.json();
}

async function buscarMeta(periodo: Periodo): Promise<LinhaMeta[]> {
  const hit = cache.get(periodo);
  if (hit && Date.now() - hit.ts < 60_000) return hit.data;

  const conta = (process.env.META_AD_ACCOUNT_ID || '').replace(/^act_/, '');
  const linhas: LinhaMeta[] = [];
  let after = '';
  for (let i = 0; i < 10; i++) {
    const r = await graph(`act_${conta}/insights`, {
      level: 'ad',
      fields: 'campaign_id,campaign_name,adset_name,ad_id,ad_name,spend,impressions,clicks,actions',
      date_preset: periodo,
      limit: '200',
      ...(after ? { after } : {}),
    });
    if (r.error) throw new Error(r.error.message);
    linhas.push(...(r.data ?? []));
    const paging = (r as { paging?: { cursors?: { after?: string }; next?: string } }).paging;
    if (!paging?.next) break;
    after = paging.cursors?.after ?? '';
  }
  cache.set(periodo, { ts: Date.now(), data: linhas });
  return linhas;
}

function desde(periodo: Periodo): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  switch (periodo) {
    case 'today': return d.getTime();
    case 'yesterday': return d.getTime() - 86400_000;
    case 'last_7d': return d.getTime() - 6 * 86400_000;
    case 'last_14d': return d.getTime() - 13 * 86400_000;
    case 'last_30d': return d.getTime() - 29 * 86400_000;
    default: return 0;
  }
}

export async function carregarAds(periodo: Periodo): Promise<ResultadoAds> {
  const base: ResultadoAds = {
    configurado: Boolean(process.env.META_ADS_TOKEN && process.env.META_AD_ACCOUNT_ID),
    periodo,
    atualizadoEm: new Date().toISOString(),
    campanhas: [],
    totais: { gasto: 0, leads: 0, qualificados: 0, visitas: 0, cpl: null, cpq: null },
    semAtribuicao: { leads: 0, qualificados: 0 },
  };

  // leads do período (para cruzar com a Meta)
  const ini = desde(periodo);
  const leads = listLeads().filter((l) => Date.parse(l.criadoEm) >= ini);
  const visitasPorLead = new Set(
    listEventos().filter((e) => e.tipo === 'visita_agendada' && e.leadId && Date.parse(e.ts) >= ini).map((e) => e.leadId!)
  );

  let meta: LinhaMeta[] = [];
  if (base.configurado) {
    try {
      meta = await buscarMeta(periodo);
    } catch (e) {
      base.erro = e instanceof Error ? e.message : String(e);
    }
  }

  const porCampanha = new Map<string, LinhaCampanha>();
  const porAd = new Map<string, string>(); // ad_id → campaignId
  const porNome = new Map<string, string>(); // nome minúsculo / id → campaignId

  for (const m of meta) {
    const id = m.campaign_id || 'sem-id';
    let c = porCampanha.get(id);
    if (!c) {
      c = {
        campanhaId: id, campanha: m.campaign_name || id, anuncios: [],
        gasto: 0, impressoes: 0, cliques: 0, ctr: 0, cpc: 0, conversasMeta: 0,
        leads: 0, qualificados: 0, visitas: 0, cpl: null, cpq: null,
      };
      porCampanha.set(id, c);
      porNome.set(id.toLowerCase(), id);
      porNome.set((m.campaign_name || '').toLowerCase(), id);
    }
    const gasto = Number(m.spend || 0);
    c.gasto += gasto;
    c.impressoes += Number(m.impressions || 0);
    c.cliques += Number(m.clicks || 0);
    c.conversasMeta += Number(
      m.actions?.find((a) => a.action_type.startsWith('onsite_conversion.messaging_conversation_started'))?.value || 0
    );
    if (m.ad_id) {
      c.anuncios.push({ adId: m.ad_id, nome: m.ad_name || m.ad_id, gasto, leads: 0, qualificados: 0 });
      porAd.set(m.ad_id, id);
    }
  }

  let semLeads = 0;
  let semQual = 0;
  for (const l of leads) {
    const qual = Boolean(l.qualificadoEm);
    const idCampanha =
      (l.origem.ad_id && porAd.get(l.origem.ad_id)) ||
      (l.origem.utm_campaign && porNome.get(l.origem.utm_campaign.toLowerCase())) ||
      '';
    const c = idCampanha ? porCampanha.get(idCampanha) : undefined;
    if (!c) {
      semLeads++;
      if (qual) semQual++;
      continue;
    }
    c.leads++;
    if (qual) c.qualificados++;
    if (visitasPorLead.has(l.id)) c.visitas++;
    const ad = c.anuncios.find((a) => a.adId === l.origem.ad_id);
    if (ad) {
      ad.leads++;
      if (qual) ad.qualificados++;
    }
  }

  for (const c of porCampanha.values()) {
    c.ctr = c.impressoes ? (c.cliques / c.impressoes) * 100 : 0;
    c.cpc = c.cliques ? c.gasto / c.cliques : 0;
    c.cpl = c.leads ? c.gasto / c.leads : null;
    c.cpq = c.qualificados ? c.gasto / c.qualificados : null;
    c.anuncios.sort((a, b) => b.gasto - a.gasto);
  }

  base.campanhas = [...porCampanha.values()].sort((a, b) => b.gasto - a.gasto);
  const t = base.totais;
  for (const c of base.campanhas) {
    t.gasto += c.gasto; t.leads += c.leads; t.qualificados += c.qualificados; t.visitas += c.visitas;
  }
  t.leads += semLeads;
  t.qualificados += semQual;
  t.cpl = t.leads ? t.gasto / t.leads : null;
  t.cpq = t.qualificados ? t.gasto / t.qualificados : null;
  base.semAtribuicao = { leads: semLeads, qualificados: semQual };
  return base;
}
