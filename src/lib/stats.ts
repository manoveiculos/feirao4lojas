import { LOJAS } from './config';
import { listEventos, listLeads } from './db/store';
import type { Lead } from './db/types';
import type { LojaSlug } from './types';

const DIA = 86400_000;

function inicioDoDia(ts: number): number {
  // fuso de Brasília (UTC-3, sem horário de verão desde 2019)
  const d = new Date(ts - 3 * 3600_000);
  d.setUTCHours(0, 0, 0, 0);
  return d.getTime() + 3 * 3600_000;
}

export function leadsVisiveis(escopo: LojaSlug | null): Lead[] {
  return listLeads().filter((l) => !l.teste && (!escopo || l.lojaSlug === escopo));
}

export function calcularStats(escopo: LojaSlug | null, dias = 14) {
  const leads = leadsVisiveis(escopo);
  const agora = Date.now();
  const hoje = inicioDoDia(agora);

  const kpis = {
    total: leads.length,
    hoje: leads.filter((l) => Date.parse(l.criadoEm) >= hoje).length,
    qualificados: leads.filter((l) => l.qualificadoEm).length,
    qualificadosHoje: leads.filter((l) => l.qualificadoEm && Date.parse(l.qualificadoEm) >= hoje).length,
    quentes: leads.filter((l) => l.temperatura === 'quente' && !['comprou', 'perdido', 'optout'].includes(l.status)).length,
    visitasAgendadas: leads.filter((l) => l.status === 'visita_agendada').length,
    aguardandoHumano: leads.filter((l) => l.humano && !['comprou', 'perdido', 'optout'].includes(l.status)).length,
    naoLidas: leads.reduce((n, l) => n + (l.naoLidas > 0 ? 1 : 0), 0),
    comprou: leads.filter((l) => l.status === 'comprou').length,
  };
  const taxaQualificacao = kpis.total ? kpis.qualificados / kpis.total : 0;

  const funil = [
    { etapa: 'Leads', n: leads.length },
    { etapa: 'Conversaram', n: leads.filter((l) => l.totalMensagensLead > 0).length },
    { etapa: 'Qualificados', n: kpis.qualificados },
    { etapa: 'Visita agendada', n: leads.filter((l) => l.visita.quando || ['visita_agendada', 'visitou', 'comprou'].includes(l.status)).length },
    { etapa: 'Visitaram', n: leads.filter((l) => ['visitou', 'comprou'].includes(l.status)).length },
    { etapa: 'Compraram', n: kpis.comprou },
  ];

  const serie: Array<{ dia: string; leads: number; qualificados: number }> = [];
  for (let i = dias - 1; i >= 0; i--) {
    const ini = hoje - i * DIA;
    const fim = ini + DIA;
    serie.push({
      dia: new Date(ini).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' }),
      leads: leads.filter((l) => Date.parse(l.criadoEm) >= ini && Date.parse(l.criadoEm) < fim).length,
      qualificados: leads.filter((l) => l.qualificadoEm && Date.parse(l.qualificadoEm) >= ini && Date.parse(l.qualificadoEm) < fim).length,
    });
  }

  const contar = (chave: (l: Lead) => string) => {
    const m = new Map<string, { leads: number; qualificados: number }>();
    for (const l of leads) {
      const k = chave(l) || '(sem origem)';
      const x = m.get(k) ?? { leads: 0, qualificados: 0 };
      x.leads++;
      if (l.qualificadoEm) x.qualificados++;
      m.set(k, x);
    }
    return [...m.entries()].map(([nome, v]) => ({ nome, ...v })).sort((a, b) => b.leads - a.leads).slice(0, 10);
  };

  const porLoja = escopo
    ? []
    : LOJAS.map((loja) => {
        const ls = leads.filter((l) => l.lojaSlug === loja.slug);
        return {
          slug: loja.slug,
          nome: loja.nome,
          cor: loja.corDestaque,
          leads: ls.length,
          qualificados: ls.filter((l) => l.qualificadoEm).length,
          visitas: ls.filter((l) => l.visita.quando).length,
          pendentes: ls.filter((l) => l.humano || l.naoLidas > 0).length,
        };
      });
  const semLoja = escopo ? 0 : leads.filter((l) => !l.lojaSlug).length;

  // Site (eventos): cliques e formulários nos últimos 7 dias
  const sete = agora - 7 * DIA;
  const eventos = listEventos().filter((e) => (!escopo || e.lojaSlug === escopo));
  const site = {
    cliquesWhatsapp: eventos.filter((e) => e.tipo === 'site_click_whatsapp' && Date.parse(e.ts) >= sete).length,
    formularios: eventos.filter((e) => e.tipo === 'site_form' && Date.parse(e.ts) >= sete).length,
  };

  const aoVivo = eventos
    .filter((e) => e.tipo !== 'site_click_whatsapp')
    .slice(-20)
    .reverse()
    .map((e) => {
      const lead = e.leadId ? leads.find((l) => l.id === e.leadId) : undefined;
      return { id: e.id, tipo: e.tipo, ts: e.ts, leadId: e.leadId, nome: lead?.nome || lead?.telefone || '', lojaSlug: e.lojaSlug, meta: e.meta };
    });

  return {
    atualizadoEm: new Date().toISOString(),
    kpis,
    taxaQualificacao,
    funil,
    serie,
    porOrigem: contar((l) => (l.origem.canal === 'anuncio_ctwa' ? 'Anúncio click-to-WhatsApp' : l.origem.utm_source ? `${l.origem.utm_source}${l.origem.utm_medium ? ` / ${l.origem.utm_medium}` : ''}` : l.origem.canal)),
    porCampanha: contar((l) => l.origem.utm_campaign || (l.origem.ad_id ? `ad ${l.origem.ad_id}` : '')),
    porLoja,
    semLoja,
    site,
    aoVivo,
  };
}
