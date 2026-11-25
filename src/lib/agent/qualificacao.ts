import { FEIRAO_CONFIG, LOJAS_BY_SLUG } from '../config';
import { getSettings, updateLead } from '../db/store';
import type { Lead, Temperatura } from '../db/types';
import { enviarAvisoInterno } from '../whatsapp/outbound';
import { rotearLead } from './roteador';

/**
 * Score determinístico 0–100 calculado a partir do que o agente coletou.
 * (O LLM extrai os fatos; a regra de negócio fica em código, auditável.)
 */
export function calcularScore(lead: Lead): { score: number; temperatura: Temperatura } {
  const p = lead.perfil;
  let s = 0;
  if (lead.nome && p.nomeConfirmado) s += 5;
  if (p.veiculosInteresse.length > 0) s += 20;
  else if (p.categoria || p.marca_modelo) s += 10;
  if (p.orcamento || p.parcelaDesejada) s += 15;
  if (p.formaPagamento) s += 5;
  if (p.entrada !== null && p.entrada > 0) s += 10;
  if (p.temTroca === true) s += 8;
  if (p.prazoCompra === 'imediato') s += 20;
  else if (p.prazoCompra === 'ate_7_dias') s += 17;
  else if (p.prazoCompra === 'ate_30_dias') s += 10;
  else if (p.prazoCompra === 'mais_30_dias') s += 2;
  if (lead.visita.quando) s += 12;
  if (lead.visita.confirmada) s += 8;
  if (lead.totalMensagensLead >= 4) s += 5;
  s = Math.min(100, s);
  const temperatura: Temperatura = s >= 70 ? 'quente' : s >= 40 ? 'morno' : 'frio';
  return { score: s, temperatura };
}

/**
 * Regra de qualificação: score mínimo + sinal real de compra
 * (carro/perfil definido E prazo ≤ 30 dias OU visita marcada).
 */
export function estaQualificado(lead: Lead): boolean {
  const { scoreQualificado } = getSettings();
  const p = lead.perfil;
  const temInteresse = p.veiculosInteresse.length > 0 || Boolean(p.categoria || p.marca_modelo);
  const prazoOk = p.prazoCompra === 'imediato' || p.prazoCompra === 'ate_7_dias' || p.prazoCompra === 'ate_30_dias';
  return lead.score >= scoreQualificado && temInteresse && (prazoOk || Boolean(lead.visita.quando));
}

/**
 * Critério mínimo para o SDR aprovar o lead para roteamento (validado em código, não só no prompt):
 * - o cliente RESPONDEU ativamente (curioso que não responde nunca chega a uma loja);
 * - e: interesse claro + (orçamento/entrada/parcela/forma de pagamento OU troca definida),
 *   ou pedido explícito de visita/simulação/atendimento humano,
 *   ou resposta a um aviso da lista de espera.
 */
export function criteriosMinimos(
  lead: Lead,
  pedidoExplicito: boolean
): { ok: boolean; faltando: string[] } {
  const p = lead.perfil;
  const faltando: string[] = [];
  const respondeu = lead.totalMensagensLead >= 1;
  const interesse = p.veiculosInteresse.length > 0 || Boolean(p.categoria || p.marca_modelo);
  const condicao =
    p.orcamento !== null || p.entrada !== null || p.parcelaDesejada !== null || p.formaPagamento !== null || p.temTroca !== null;
  const visita = Boolean(lead.visita.quando);
  const espera = Boolean(lead.esperaAviso);

  if (!respondeu) faltando.push('o cliente ainda não respondeu');
  if (!(pedidoExplicito || visita || espera)) {
    if (!interesse) faltando.push('interesse (carro, modelo ou categoria)');
    if (!condicao) faltando.push('condição: orçamento/entrada/parcela/forma de pagamento ou se tem troca');
  }
  return { ok: faltando.length === 0, faltando };
}

function brl(n: number | null): string {
  return n === null ? '—' : `R$ ${new Intl.NumberFormat('pt-BR').format(n)}`;
}

export function fichaDoLead(lead: Lead): string {
  const p = lead.perfil;
  const carros = p.veiculosInteresse.length ? p.veiculosInteresse.join(', ') : p.marca_modelo || p.categoria || 'a definir';
  const linhas = [
    `👤 *${lead.nome || 'Cliente'}* — ${lead.telefone}`,
    `🚗 Interesse: ${carros}`,
    `💰 Orçamento: ${brl(p.orcamento)} | Entrada: ${brl(p.entrada)}`,
    p.formaPagamento ? `💳 Pagamento: ${p.formaPagamento}` : '',
    p.temTroca ? `🔁 Troca: ${[p.trocaModelo, p.trocaAno, p.trocaKm].filter(Boolean).join(' ') || 'sim'}` : '',
    p.prazoCompra ? `⏱️ Prazo: ${p.prazoCompra.replace(/_/g, ' ')}` : '',
    lead.visita.quando ? `📅 Visita: ${lead.visita.quando}` : '',
    `🔥 Score ${lead.score} (${lead.temperatura})`,
    lead.resumo ? `📝 ${lead.resumo}` : '',
  ];
  return linhas.filter(Boolean).join('\n');
}

/**
 * Chamado após cada atualização do lead. Só recalcula score/temperatura e o status de triagem.
 * NÃO escolhe loja nem avisa ninguém: isso é do Agente Roteador, acionado pelo SDR
 * (aprovar_para_roteamento). Rede de segurança: se o lead atingir a qualificação forte
 * (score + prazo/visita) e já respondeu, o roteamento é disparado mesmo que o SDR esqueça.
 */
export async function reavaliarLead(
  leadId: string,
  get: (id: string) => Lead | undefined,
  opts: { simulado?: boolean } = {}
): Promise<Lead | undefined> {
  const atual = get(leadId);
  if (!atual) return undefined;

  const { score, temperatura } = calcularScore(atual);
  const patch: Partial<Lead> = { score, temperatura };
  if (atual.status === 'novo' && atual.totalMensagensLead > 0) patch.status = 'em_atendimento';
  const lead = updateLead(leadId, patch)!;

  if (!lead.roteadoEm && lead.totalMensagensLead > 0 && estaQualificado(lead) && criteriosMinimos(lead, false).ok) {
    await rotearLead(leadId, { motivoAprovacao: `rede de segurança: score ${lead.score}`, simulado: opts.simulado });
  }
  return get(leadId);
}

/** Visita marcada em lead já roteado e notificado: avisa a loja responsável (e o gerente). */
export async function avisarVisita(lead: Lead): Promise<void> {
  if (!lead.lojaSlug || !lead.roteadoEm) return;
  const s = getSettings();
  const texto = `📅 *Visita agendada — Acelera V3* (${LOJAS_BY_SLUG[lead.lojaSlug].nome})

${fichaDoLead(lead)}

👉 ${FEIRAO_CONFIG.siteUrl}/admin/conversas?lead=${lead.id}`;
  const destinos = new Set<string>();
  if (s.lojaTelefones[lead.lojaSlug]) destinos.add(s.lojaTelefones[lead.lojaSlug]!);
  if (s.gerenteTelefone) destinos.add(s.gerenteTelefone);
  for (const tel of destinos) await enviarAvisoInterno(tel, texto);
}
