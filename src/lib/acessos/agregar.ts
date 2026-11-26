import { LOJAS_BY_SLUG } from '../config';
import { listLeads } from '../db/store';
import type { Lead } from '../db/types';
import type { LojaSlug } from '../types';
import { eventosDesde } from './store';
import {
  ACAO_LABEL,
  CANAIS,
  CANAL_LABEL,
  agruparCarrosVistos,
  calcularTemperatura,
  tempoTotalSessaoSeg,
  type Canal,
  type CarroVisto,
  type EventoAcesso,
  type Periodo,
  type Temperatura,
} from './tipos';

const MIN = 60_000;
const AO_VIVO_MS = 5 * MIN;

/** Início do período (o dia "hoje" segue o horário de Brasília, UTC-3 sem horário de verão). */
export function inicioDoPeriodo(p: Periodo, agora = Date.now()): number {
  if (p === '24h') return agora - 24 * 3600_000;
  if (p === '7d') return agora - 7 * 86400_000;
  if (p === '30d') return agora - 30 * 86400_000;
  const d = new Date(agora - 3 * 3600_000);
  d.setUTCHours(0, 0, 0, 0);
  return d.getTime() + 3 * 3600_000;
}

function agruparPorVisitante(eventos: EventoAcesso[]): Map<string, EventoAcesso[]> {
  const m = new Map<string, EventoAcesso[]>();
  for (const ev of eventos) {
    const l = m.get(ev.visitor_id);
    if (l) l.push(ev);
    else m.set(ev.visitor_id, [ev]);
  }
  for (const l of m.values()) l.sort((a, b) => Date.parse(a.criado_em) - Date.parse(b.criado_em));
  return m;
}

/** Leads do CRM ligados a um visitante: o sid do clique/formulário é o id do visitante. */
function leadsPorVisitante(visivel?: (l: Lead) => boolean): Map<string, Lead> {
  const m = new Map<string, Lead>();
  for (const l of listLeads()) if (!l.teste && l.origem.sid && (!visivel || visivel(l))) m.set(l.origem.sid, l);
  return m;
}

const contar = (itens: Array<string | null | undefined>, limite = 8) => {
  const m = new Map<string, number>();
  for (const i of itens) if (i) m.set(i, (m.get(i) || 0) + 1);
  return [...m.entries()].map(([nome, visitantes]) => ({ nome, visitantes })).sort((a, b) => b.visitantes - a.visitantes).slice(0, limite);
};

// ───────────────────────── Resumo ─────────────────────────

/** `visivel`: quando informado (usuário de loja), só leads liberados para ele aparecem com dados de contato. */
export function montarResumo(periodo: Periodo, agora = Date.now(), visivel?: (l: Lead) => boolean) {
  const ini = inicioDoPeriodo(periodo, agora);
  const eventos = eventosDesde(ini).filter((e) => Date.parse(e.criado_em) >= ini);
  const porVisitante = agruparPorVisitante(eventos);
  const leads = leadsPorVisitante(visivel);

  const visitantes = [...porVisitante.entries()].map(([id, passos]) => {
    const primeiro = passos.find((p) => p.canal !== 'direto') || passos[0];
    const geo = [...passos].reverse().find((p) => p.cidade) || null;
    const ua = [...passos].reverse().find((p) => p.dispositivo_detalhe) || passos[passos.length - 1];
    return {
      id,
      passos,
      canal: primeiro.canal,
      campanha: primeiro.utm_campaign,
      cidade: geo?.cidade ?? null,
      uf: geo?.uf ?? null,
      aparelho: ua.dispositivo_detalhe || ua.dispositivo || 'Desconhecido',
      navegador: ua.navegador,
      viuCarro: passos.some((p) => p.acao === 'view_vehicle'),
      usouFerramenta: passos.some((p) => p.acao === 'simulacao' || p.acao === 'troca'),
      whatsapp: passos.some((p) => p.acao === 'whatsapp_click'),
      formulario: passos.some((p) => p.acao === 'lead_formulario'),
      lead: leads.get(id) ?? null,
    };
  });

  // ── ao vivo ──
  const vivos = visitantes
    .filter((v) => v.passos.some((p) => agora - Date.parse(p.atualizado_em) <= AO_VIVO_MS))
    .map((v) => {
      const ultimo = [...v.passos].sort((a, b) => Date.parse(b.atualizado_em) - Date.parse(a.atualizado_em))[0];
      const vendo =
        ultimo.acao === 'view_vehicle'
          ? `Carro: ${ultimo.veiculo_nome || ultimo.veiculo_id || '—'}`
          : ultimo.detalhe || ACAO_LABEL[ultimo.acao];
      return {
        id: v.id,
        canal: v.canal,
        origem: v.passos[0].sub_origem,
        cidade: v.cidade,
        uf: v.uf,
        aparelho: v.aparelho,
        vendo,
        ultimaAtividade: ultimo.atualizado_em,
        nome: v.lead?.nome || null,
        temperatura: calcularTemperatura(v.passos).nivel,
      };
    })
    .sort((a, b) => Date.parse(b.ultimaAtividade) - Date.parse(a.ultimaAtividade));

  // ── KPIs ──
  const paginas = eventos.filter((e) => e.acao === 'page_view');
  const temposPagina = paginas.map((e) => e.tempo_segundos).filter((t) => t > 0);
  const sessoes = new Set(eventos.map((e) => e.session_id)).size;
  const visitantesUnicos = visitantes.length;
  const comWhatsapp = visitantes.filter((v) => v.whatsapp).length;
  const comLead = visitantes.filter((v) => v.formulario || v.lead).length;
  const comLeadCrm = visitantes.filter((v) => v.lead).length;
  const qualificados = visitantes.filter((v) => v.lead?.qualificadoEm).length;

  const kpis = {
    visitantes: visitantesUnicos,
    sessoes,
    paginasVistas: paginas.length,
    carrosAbertos: eventos.filter((e) => e.acao === 'view_vehicle').length,
    cliquesWhatsapp: eventos.filter((e) => e.acao === 'whatsapp_click').length,
    formularios: eventos.filter((e) => e.acao === 'lead_formulario').length,
    tempoMedioPaginaSeg: temposPagina.length ? Math.round(temposPagina.reduce((a, b) => a + b, 0) / temposPagina.length) : 0,
    taxaContato: visitantesUnicos ? (visitantes.filter((v) => v.whatsapp || v.formulario).length / visitantesUnicos) : 0,
    leadsCrm: comLeadCrm,
    qualificadosCrm: qualificados,
  };

  // ── funil ──
  const funil = [
    { etapa: 'Visitantes', n: visitantesUnicos },
    { etapa: 'Abriram um carro', n: visitantes.filter((v) => v.viuCarro).length },
    { etapa: 'Usaram simulador/troca', n: visitantes.filter((v) => v.usouFerramenta).length },
    { etapa: 'Pediram contato', n: visitantes.filter((v) => v.whatsapp || v.formulario).length },
    { etapa: 'Viraram lead no CRM', n: comLeadCrm },
    { etapa: 'Qualificados', n: qualificados },
  ];

  // ── canais ──
  const canais = CANAIS.map((c) => {
    const vs = visitantes.filter((v) => v.canal === c);
    return {
      canal: c as Canal,
      label: CANAL_LABEL[c],
      visitantes: vs.length,
      whatsapp: vs.filter((v) => v.whatsapp).length,
      leads: vs.filter((v) => v.formulario || v.lead).length,
      qualificados: vs.filter((v) => v.lead?.qualificadoEm).length,
      taxa: vs.length ? vs.filter((v) => v.whatsapp || v.formulario).length / vs.length : 0,
    };
  });

  // ── campanhas (utm_campaign), cruzadas com o CRM ──
  const porCampanha = new Map<string, typeof visitantes>();
  for (const v of visitantes) {
    const nome = v.campanha || (v.canal === 'meta_ads' || v.canal === 'google_ads' || v.canal === 'tiktok_ads' ? '(anúncio sem utm_campaign)' : null);
    if (!nome) continue;
    const l = porCampanha.get(nome);
    if (l) l.push(v);
    else porCampanha.set(nome, [v]);
  }
  const campanhas = [...porCampanha.entries()]
    .map(([nome, vs]) => ({
      nome,
      canal: vs[0].canal,
      visitantes: vs.length,
      whatsapp: vs.filter((v) => v.whatsapp).length,
      leads: vs.filter((v) => v.formulario || v.lead).length,
      qualificados: vs.filter((v) => v.lead?.qualificadoEm).length,
    }))
    .sort((a, b) => b.visitantes - a.visitantes)
    .slice(0, 15);

  // ── carros mais vistos ──
  const porCarro = new Map<string, { id: string | null; nome: string; valor: number | null; vs: Set<string>; views: number; tempo: number; fotos: number; whatsapp: Set<string> }>();
  for (const v of visitantes) {
    for (const p of v.passos) {
      if (p.acao !== 'view_vehicle') continue;
      const chave = p.veiculo_id || p.veiculo_nome;
      if (!chave) continue;
      const c = porCarro.get(chave) || { id: p.veiculo_id, nome: p.veiculo_nome || `Carro ${p.veiculo_id}`, valor: p.valor_veiculo, vs: new Set<string>(), views: 0, tempo: 0, fotos: 0, whatsapp: new Set<string>() };
      c.vs.add(v.id);
      c.views += 1;
      c.tempo += p.tempo_segundos;
      c.fotos += p.fotos_vistas;
      if (v.whatsapp) c.whatsapp.add(v.id);
      if (!c.valor && p.valor_veiculo) c.valor = p.valor_veiculo;
      porCarro.set(chave, c);
    }
  }
  const carros = [...porCarro.values()]
    .map((c) => ({
      id: c.id,
      nome: c.nome,
      valor: c.valor,
      visitantes: c.vs.size,
      aberturas: c.views,
      tempoMedioSeg: c.views ? Math.round(c.tempo / c.views) : 0,
      fotosMedia: c.views ? Math.round((c.fotos / c.views) * 10) / 10 : 0,
      pediramContato: c.whatsapp.size,
    }))
    .sort((a, b) => b.visitantes - a.visitantes || b.tempoMedioSeg - a.tempoMedioSeg)
    .slice(0, 15);

  // ── perfil do público ──
  const cidades = contar(visitantes.map((v) => (v.cidade ? `${v.cidade}${v.uf ? `/${v.uf}` : ''}` : null)), 10);
  const aparelhos = contar(visitantes.map((v) => v.aparelho));
  const navegadores = contar(visitantes.map((v) => v.navegador));
  const origens = contar(visitantes.map((v) => v.passos[0].sub_origem), 10);

  // ── horas (BRT) e dias ──
  const horas = Array.from({ length: 24 }, () => new Set<string>());
  const dias = new Map<string, { visitantes: Set<string>; whatsapp: Set<string> }>();
  for (const ev of eventos) {
    const t = new Date(Date.parse(ev.criado_em) - 3 * 3600_000);
    horas[t.getUTCHours()].add(ev.visitor_id);
    const dia = `${String(t.getUTCDate()).padStart(2, '0')}/${String(t.getUTCMonth() + 1).padStart(2, '0')}`;
    const d = dias.get(dia) || { visitantes: new Set<string>(), whatsapp: new Set<string>() };
    d.visitantes.add(ev.visitor_id);
    if (ev.acao === 'whatsapp_click') d.whatsapp.add(ev.visitor_id);
    dias.set(dia, d);
  }

  return {
    periodo,
    atualizadoEm: new Date(agora).toISOString(),
    aoVivo: { total: vivos.length, visitantes: vivos.slice(0, 25) },
    kpis,
    funil,
    canais,
    campanhas,
    carros,
    cidades,
    aparelhos,
    navegadores,
    origens,
    horas: horas.map((s) => s.size),
    dias: [...dias.entries()].map(([dia, d]) => ({ dia, visitantes: d.visitantes.size, whatsapp: d.whatsapp.size })),
  };
}

// ───────────────────────── Jornadas ─────────────────────────

export interface PassoJornada {
  id: string;
  criado_em: string;
  atualizado_em: string;
  acao: EventoAcesso['acao'];
  pagina: string | null;
  detalhe: string | null;
  veiculo_nome: string | null;
  valor_veiculo: number | null;
  tempo_segundos: number;
  fotos_vistas: number;
  abriu_galeria: boolean;
  scroll_max: number;
  interacoes: Record<string, number>;
}

export interface Jornada {
  id: string;
  canal: Canal;
  subOrigem: string | null;
  campanha: string | null;
  cidade: string | null;
  uf: string | null;
  aparelho: string;
  dispositivo: string | null;
  primeiroAcesso: string;
  ultimoAcesso: string;
  aoVivo: boolean;
  clicouWhatsApp: boolean;
  converteu: boolean;
  tempoTotalSeg: number;
  temperatura: Temperatura;
  carros: CarroVisto[];
  passos: PassoJornada[];
  lead: { id: string; nome: string; telefone: string; status: string; score: number; lojaNome: string | null; qualificado: boolean } | null;
}

export function montarJornadas(periodo: Periodo, opcoes: { canal?: Canal | null; limite?: number } = {}, agora = Date.now(), visivel?: (l: Lead) => boolean): Jornada[] {
  const ini = inicioDoPeriodo(periodo, agora);
  const eventos = eventosDesde(ini);
  const leads = leadsPorVisitante(visivel);
  const lista: Jornada[] = [];

  for (const [id, passos] of agruparPorVisitante(eventos)) {
    const primeiro = passos.find((p) => p.canal !== 'direto') || passos[0];
    if (opcoes.canal && primeiro.canal !== opcoes.canal) continue;
    const geo = [...passos].reverse().find((p) => p.cidade) || null;
    const ua = [...passos].reverse().find((p) => p.dispositivo_detalhe) || passos[passos.length - 1];
    const ultimo = passos.reduce((max, p) => Math.max(max, Date.parse(p.atualizado_em), Date.parse(p.criado_em)), 0);
    const lead = leads.get(id);
    lista.push({
      id,
      canal: primeiro.canal,
      subOrigem: primeiro.sub_origem,
      campanha: [...passos].find((p) => p.utm_campaign)?.utm_campaign ?? null,
      cidade: geo?.cidade ?? null,
      uf: geo?.uf ?? null,
      aparelho: ua.dispositivo_detalhe || ua.dispositivo || 'Desconhecido',
      dispositivo: ua.dispositivo,
      primeiroAcesso: passos[0].criado_em,
      ultimoAcesso: new Date(ultimo).toISOString(),
      aoVivo: agora - ultimo <= AO_VIVO_MS,
      clicouWhatsApp: passos.some((p) => p.acao === 'whatsapp_click'),
      converteu: passos.some((p) => p.acao === 'whatsapp_click' || p.acao === 'lead_formulario'),
      tempoTotalSeg: tempoTotalSessaoSeg(passos),
      temperatura: calcularTemperatura(passos),
      carros: agruparCarrosVistos(passos),
      passos: passos.slice(-60).map((p) => ({
        id: p.id,
        criado_em: p.criado_em,
        atualizado_em: p.atualizado_em,
        acao: p.acao,
        pagina: p.pagina,
        detalhe: p.detalhe,
        veiculo_nome: p.veiculo_nome,
        valor_veiculo: p.valor_veiculo,
        tempo_segundos: p.tempo_segundos,
        fotos_vistas: p.fotos_vistas,
        abriu_galeria: p.abriu_galeria,
        scroll_max: p.scroll_max,
        interacoes: p.interacoes,
      })),
      lead: lead
        ? {
            id: lead.id,
            nome: lead.nome,
            telefone: lead.telefone,
            status: lead.status,
            score: lead.score,
            lojaNome: lead.lojaSlug ? LOJAS_BY_SLUG[lead.lojaSlug as LojaSlug]?.nome ?? lead.lojaSlug : null,
            qualificado: Boolean(lead.qualificadoEm),
          }
        : null,
    });
  }

  lista.sort((a, b) => Date.parse(b.ultimoAcesso) - Date.parse(a.ultimoAcesso));
  return lista.slice(0, opcoes.limite ?? 100);
}
