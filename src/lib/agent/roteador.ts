import { enviarEventoQualificado } from '../ads/capi';
import { FEIRAO_CONFIG, LOJAS, LOJAS_BY_SLUG, getSiglaFromCodigo } from '../config';
import { addEvento, getLead, getMensagens, getSettings, listLeads, updateLead } from '../db/store';
import type { Lead } from '../db/types';
import { loadEstoque } from '../estoque';
import { filterVeiculos } from '../filters';
import type { LojaSlug, Veiculo } from '../types';
import { enviarAvisoInterno } from '../whatsapp/outbound';

/**
 * ═══ Agente 2 — Agente Roteador ═══
 * Serviço interno (sem LLM: regra de negócio auditável) que só entra em ação DEPOIS que o
 * SDR aprova o lead. Decide a loja, grava a loja responsável, libera o lead no painel dela e
 * avisa o WhatsApp de notificação da loja (uma única vez por lead).
 * Especificação: .claude/skills/agente-roteador/SKILL.md
 */

export type MotivoRoteamento = 'veiculo' | 'loja_escolhida' | 'rodizio' | 'admin' | 'lista_espera';

export interface DecisaoRoteamento {
  loja: LojaSlug;
  motivo: MotivoRoteamento;
  veiculo: Veiculo | null;
  /** Lojas que disputaram o rodízio (com estoque compatível) */
  candidatas: LojaSlug[];
  explicacao: string;
}

/** Janela do rodízio: conta os leads que cada loja recebeu nos últimos N dias. */
const JANELA_RODIZIO_DIAS = 7;

function veiculoPorCodigo(codigo: string): Veiculo | undefined {
  const c = codigo.trim().toLowerCase();
  return loadEstoque().veiculos.find((v) => v.codigo.toLowerCase() === c);
}

function lojaPorCodigo(codigo: string): LojaSlug | null {
  const sigla = getSiglaFromCodigo(codigo);
  return LOJAS.find((l) => l.sigla === sigla)?.slug ?? null;
}

/** Leads recebidos (roteados) por loja na janela do rodízio + quando foi o último. */
export function cargaDasLojas(agora = Date.now()): Map<LojaSlug, { recebidos: number; ultimo: number }> {
  const corte = agora - JANELA_RODIZIO_DIAS * 86400_000;
  const carga = new Map<LojaSlug, { recebidos: number; ultimo: number }>(LOJAS.map((l) => [l.slug, { recebidos: 0, ultimo: 0 }]));
  for (const l of listLeads()) {
    if (l.teste || !l.lojaSlug || !l.roteadoEm) continue;
    const ts = Date.parse(l.roteadoEm);
    const c = carga.get(l.lojaSlug);
    if (!c) continue;
    if (ts >= corte) c.recebidos += 1;
    c.ultimo = Math.max(c.ultimo, ts);
  }
  return carga;
}

/** Rodízio balanceado: menor nº de leads recebidos na janela; empate → quem recebeu há mais tempo. */
function rodizio(candidatas: LojaSlug[]): LojaSlug {
  const carga = cargaDasLojas();
  return [...candidatas].sort((a, b) => {
    const ca = carga.get(a)!;
    const cb = carga.get(b)!;
    return ca.recebidos - cb.recebidos || ca.ultimo - cb.ultimo || a.localeCompare(b);
  })[0];
}

/** Lojas com pelo menos um veículo compatível com o perfil genérico do lead. */
export function lojasCompativeis(lead: Lead): LojaSlug[] {
  const p = lead.perfil;
  if (!p.categoria && !p.marca_modelo && !p.orcamento) return [];
  const teto = p.orcamento ? Math.round(p.orcamento * 1.1) : undefined;
  const tentar = (q: string | undefined) =>
    filterVeiculos(loadEstoque().veiculos, {
      categoria: p.categoria ?? undefined,
      q,
      precoMax: teto,
      excluirMotos: p.categoria !== 'moto',
    });
  let compat = tentar(p.marca_modelo ?? undefined);
  // texto livre muito específico ("corolla xei prata") pode zerar: cai para categoria + orçamento
  if (!compat.length && p.marca_modelo && (p.categoria || p.orcamento)) compat = tentar(undefined);
  return [...new Set(compat.map((v) => v.lojaSlug))];
}

/** Decide a loja (não grava nada). */
export function decidirLoja(lead: Lead, opts: { codigoPreferido?: string } = {}): DecisaoRoteamento {
  // 1) Veículo específico: a loja dona do carro (o mais recente que o cliente escolheu)
  const codigos = [opts.codigoPreferido, ...[...lead.perfil.veiculosInteresse].reverse()].filter(Boolean) as string[];
  for (const codigo of codigos) {
    const loja = lojaPorCodigo(codigo);
    if (!loja) continue;
    const v = veiculoPorCodigo(codigo) ?? null;
    return {
      loja,
      motivo: lead.esperaAviso?.codigo === codigo ? 'lista_espera' : 'veiculo',
      veiculo: v,
      candidatas: [loja],
      explicacao: `Interesse no veículo ${codigo}${v ? ` (${v.titulo})` : ''}, da ${LOJAS_BY_SLUG[loja].nome}.`,
    };
  }

  // 1b) Cliente escolheu falar com uma loja (botão da loja no site / formulário da loja)
  if (lead.lojaSugerida) {
    return {
      loja: lead.lojaSugerida,
      motivo: 'loja_escolhida',
      veiculo: null,
      candidatas: [lead.lojaSugerida],
      explicacao: `Cliente chegou pelo contato da ${LOJAS_BY_SLUG[lead.lojaSugerida].nome}.`,
    };
  }

  // 2) Interesse genérico: rodízio entre as lojas com estoque compatível (ou todas, se nenhuma tiver)
  const compat = lojasCompativeis(lead);
  const candidatas = compat.length ? compat : LOJAS.map((l) => l.slug);
  const loja = rodizio(candidatas);
  return {
    loja,
    motivo: 'rodizio',
    veiculo: null,
    candidatas,
    explicacao: compat.length
      ? `Interesse genérico; ${compat.length} loja(s) com estoque compatível. Rodízio pela menor carga em ${JANELA_RODIZIO_DIAS} dias.`
      : `Interesse genérico sem estoque compatível; rodízio entre as 4 lojas.`,
  };
}

function brl(n: number | null): string {
  return n === null ? '—' : `R$ ${new Intl.NumberFormat('pt-BR').format(n)}`;
}

/** Resumo em até 2 linhas para o vendedor: usa o do SDR; sem ele, as últimas falas do cliente. */
export function resumoDuasLinhas(lead: Lead): string {
  if (lead.resumo.trim()) {
    return lead.resumo
      .split(/(?<=[.!?])\s+/)
      .slice(0, 2)
      .join('\n')
      .slice(0, 320);
  }
  const falas = getMensagens(lead.id)
    .filter((m) => m.autor === 'lead' && m.texto && !m.texto.startsWith('['))
    .slice(-2)
    .map((m) => `“${m.texto.replace(/\s+/g, ' ').slice(0, 140)}”`);
  return falas.length ? `Cliente disse: ${falas.join(' / ')}` : 'Sem resumo ainda — veja a conversa no painel.';
}

export function linkConversa(leadId: string): string {
  return `${FEIRAO_CONFIG.siteUrl}/admin/conversas?lead=${leadId}`;
}

/** Mensagem que vai para o WhatsApp da loja. */
export function textoAvisoLoja(lead: Lead, d: Pick<DecisaoRoteamento, 'veiculo' | 'motivo'>, titulo?: string): string {
  const p = lead.perfil;
  const loja = lead.lojaSlug ? LOJAS_BY_SLUG[lead.lojaSlug] : null;
  const carro = d.veiculo
    ? `${d.veiculo.titulo} ${d.veiculo.anoTexto} — ${d.veiculo.precoFormatado} (cód. ${d.veiculo.codigo})`
    : p.veiculosInteresse.length
      ? p.veiculosInteresse.join(', ')
      : [p.marca_modelo, p.categoria].filter(Boolean).join(' · ') || 'a definir';
  const troca = p.temTroca === null ? '—' : p.temTroca ? [p.trocaModelo, p.trocaAno, p.trocaKm].filter(Boolean).join(' ') || 'sim' : 'não';
  const cab =
    titulo ??
    (d.motivo === 'lista_espera'
      ? '🎯 *Lead da LISTA DE ESPERA quer o carro — Acelera V3*'
      : '🔔 *Novo lead QUALIFICADO para você — Acelera V3*');
  return [
    `${cab}${loja ? `\n🏪 ${loja.nome}` : ''}`,
    '',
    `👤 *${lead.nome || 'Cliente'}* — wa.me/${lead.telefone}`,
    `🚗 ${carro}`,
    `💰 Orçamento: ${brl(p.orcamento)} | Entrada: ${brl(p.entrada)}${p.parcelaDesejada ? ` | Parcela: ${brl(p.parcelaDesejada)}` : ''}`,
    `🔁 Troca: ${troca}${p.formaPagamento ? ` | 💳 ${p.formaPagamento}` : ''}`,
    lead.visita.quando ? `📅 Visita: ${lead.visita.quando}` : '',
    '',
    `📝 ${resumoDuasLinhas(lead)}`,
    '',
    `👉 Abrir a conversa: ${linkConversa(lead.id)}`,
    lead.humano ? '_O agente está pausado: o cliente aguarda você._' : '_O agente segue atendendo até você assumir._',
  ]
    .filter((l, i, arr) => l !== '' || (arr[i - 1] ?? '') !== '')
    .join('\n');
}

/**
 * Avisa a loja responsável (e o gerente geral, se configurado). Idempotente:
 * a flag lojaNotificadaEm (coluna notificado_loja_em) impede aviso duplicado do mesmo lead.
 */
export async function notificarLoja(
  leadId: string,
  d: Pick<DecisaoRoteamento, 'veiculo' | 'motivo'>,
  opts: { titulo?: string; forcar?: boolean } = {}
): Promise<{ enviado: boolean; destinos: number; motivo?: string }> {
  const lead = getLead(leadId);
  if (!lead || lead.teste) return { enviado: false, destinos: 0, motivo: 'lead de teste' };
  if (!lead.lojaSlug || !lead.roteadoEm) return { enviado: false, destinos: 0, motivo: 'lead ainda não roteado' };
  if (lead.lojaNotificadaEm && !opts.forcar) return { enviado: false, destinos: 0, motivo: 'loja já notificada' };

  // marca ANTES de enviar: duas chamadas concorrentes não geram dois avisos
  const marcadoEm = new Date().toISOString();
  updateLead(lead.id, { lojaNotificadaEm: marcadoEm });

  const s = getSettings();
  const destinos = new Set<string>();
  const daLoja = s.lojaTelefones[lead.lojaSlug];
  if (daLoja) destinos.add(daLoja);
  if (s.gerenteTelefone) destinos.add(s.gerenteTelefone);
  if (!destinos.size) {
    console.warn(`[roteador] ${LOJAS_BY_SLUG[lead.lojaSlug].nome} sem WhatsApp de notificação configurado (Agente & Config).`);
    return { enviado: false, destinos: 0, motivo: 'loja sem WhatsApp de notificação' };
  }

  const texto = textoAvisoLoja(getLead(lead.id)!, d, opts.titulo);
  let enviado = false;
  for (const tel of destinos) enviado = (await enviarAvisoInterno(tel, texto)) || enviado;
  // falhou em todos: libera a flag para uma nova tentativa (próxima aprovação/roteamento)
  if (!enviado && getLead(lead.id)?.lojaNotificadaEm === marcadoEm) updateLead(lead.id, { lojaNotificadaEm: null });
  return { enviado, destinos: destinos.size };
}

export interface ResultadoRoteamento {
  ok: boolean;
  jaRoteado?: boolean;
  loja?: LojaSlug;
  lojaNome?: string;
  motivo?: MotivoRoteamento;
  explicacao?: string;
  notificado?: boolean;
  erro?: string;
}

/**
 * Roteia o lead aprovado pelo SDR: decide a loja, grava loja_responsavel e avisa a loja.
 * Chamado por aprovar_para_roteamento (Agente 1), pelo match da lista de espera e pelo admin.
 */
export async function rotearLead(
  leadId: string,
  opts: { motivoAprovacao: string; codigoPreferido?: string; lojaForcada?: LojaSlug; simulado?: boolean } = { motivoAprovacao: '' }
): Promise<ResultadoRoteamento> {
  const lead = getLead(leadId);
  if (!lead) return { ok: false, erro: 'lead inexistente' };

  // Idempotência: lead já roteado não troca de loja sozinho (troca só pelo admin)
  if (lead.roteadoEm && lead.lojaSlug && !opts.lojaForcada) {
    const r = lead.lojaNotificadaEm ? null : await notificarLoja(lead.id, { veiculo: null, motivo: (lead.roteamentoMotivo as MotivoRoteamento) || 'veiculo' });
    return { ok: true, jaRoteado: true, loja: lead.lojaSlug, lojaNome: LOJAS_BY_SLUG[lead.lojaSlug].nome, notificado: Boolean(lead.lojaNotificadaEm || r?.enviado) };
  }

  const d: DecisaoRoteamento = opts.lojaForcada
    ? { loja: opts.lojaForcada, motivo: 'admin', veiculo: null, candidatas: [opts.lojaForcada], explicacao: 'Atribuído manualmente pelo admin.' }
    : decidirLoja(lead, { codigoPreferido: opts.codigoPreferido });

  const agora = new Date().toISOString();
  updateLead(lead.id, {
    lojaSlug: d.loja,
    roteadoEm: agora,
    roteamentoMotivo: d.motivo,
    qualificadoEm: lead.qualificadoEm ?? agora,
    status: lead.visita.quando ? 'visita_agendada' : ['novo', 'em_atendimento'].includes(lead.status) ? 'qualificado' : lead.status,
    // a loja nova ainda não foi avisada deste lead
    ...(opts.lojaForcada && lead.lojaSlug !== d.loja ? { lojaNotificadaEm: null } : {}),
  });

  if (opts.simulado || lead.teste) {
    return { ok: true, loja: d.loja, lojaNome: LOJAS_BY_SLUG[d.loja].nome, motivo: d.motivo, explicacao: d.explicacao, notificado: false };
  }

  addEvento({
    tipo: 'roteado',
    leadId: lead.id,
    lojaSlug: d.loja,
    meta: { motivo: d.motivo, aprovacao: opts.motivoAprovacao.slice(0, 200), candidatas: d.candidatas.join(','), veiculo: d.veiculo?.codigo ?? '' },
  });
  if (!lead.qualificadoEm) {
    const l = getLead(lead.id)!;
    addEvento({ tipo: 'qualificado', leadId: l.id, lojaSlug: d.loja, meta: { score: l.score, canal: l.origem.canal, campanha: l.origem.utm_campaign, ad_id: l.origem.ad_id } });
    void enviarEventoQualificado(l);
  }

  const n = await notificarLoja(lead.id, d);
  console.log(`[roteador] lead ${lead.id} → ${d.loja} (${d.motivo}) · aviso ${n.enviado ? 'enviado' : `não enviado: ${n.motivo ?? 'falha'}`}`);
  return { ok: true, loja: d.loja, lojaNome: LOJAS_BY_SLUG[d.loja].nome, motivo: d.motivo, explicacao: d.explicacao, notificado: n.enviado };
}
