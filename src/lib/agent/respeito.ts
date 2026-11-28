import { getLead, listEspera, updateLead } from '../db/store';
import type { Lead } from '../db/types';

/**
 * Respeito ao cliente: o que ele recusou, quando pediu espaço e quem pode receber follow-up.
 * Regras determinísticas (não dependem do modelo lembrar) — o agente também tem as tools
 * descartar_veiculo e nao_perturbar, e esta camada pega o que escapar.
 */

/** Máximo de follow-ups automáticos por lead (vida inteira da conversa). */
export const MAX_FOLLOWUPS_TOTAL = 2;
/** Intervalo mínimo entre dois follow-ups do mesmo lead. */
export const INTERVALO_MIN_FOLLOWUP_MS = 20 * 3600_000;

const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

const RE_DESCARTE =
  /\bnao (quero|gostei|me interessa)\b.{0,25}\b(essa|esse|ela|ele|este|esta|aquela|aquele|o carro|a kicks)\b|\bja (te )?(disse|falei) que nao\b|\bnao (me )?interessa\b|\bpode (tirar|esquecer|descartar)\b/;
const RE_ESPACO =
  /\bja (te )?(disse|falei)\b|\bso me (chame|chama|avise|avisa|procure)\b|\b(para|pare|chega) de (insistir|me (mandar|chamar|perturbar))\b|\bnao (me )?(chame|chama|procure|mande|perturbe|insista)\b|\bnao precisa (me )?(chamar|insistir|mandar)\b|\bsem insistir\b/;

export interface Recusa {
  descartarUltimoCarro: boolean;
  naoPerturbar: boolean;
}

/** Lê a fala do cliente e diz se ele recusou um carro e/ou pediu para não ser incomodado. */
export function detectarRecusa(texto: string): Recusa {
  const t = norm(texto);
  return { descartarUltimoCarro: RE_DESCARTE.test(t), naoPerturbar: RE_ESPACO.test(t) };
}

export function descartarVeiculo(leadId: string, codigo: string): boolean {
  const lead = getLead(leadId);
  if (!lead) return false;
  const c = codigo.trim().toUpperCase();
  const desc = new Set((lead.veiculosDescartados ?? []).map((x) => x.toUpperCase()));
  desc.add(c);
  updateLead(leadId, {
    veiculosDescartados: [...desc].slice(-20),
    perfil: { ...lead.perfil, veiculosInteresse: lead.perfil.veiculosInteresse.filter((x) => x.toUpperCase() !== c) },
  });
  return true;
}

export function marcarNaoPerturbar(leadId: string, motivo: string): void {
  updateLead(leadId, { naoPerturbar: { em: new Date().toISOString(), motivo: motivo.slice(0, 200) }, proximoFollowupEm: null });
}

/** Aplica a recusa detectada numa fala do cliente (chamado quando a mensagem chega). */
export function aplicarRecusa(leadId: string, texto: string): Recusa {
  const r = detectarRecusa(texto);
  const lead = getLead(leadId);
  if (!lead) return r;
  if (r.descartarUltimoCarro) {
    const ultimo = lead.perfil.veiculosInteresse[lead.perfil.veiculosInteresse.length - 1];
    if (ultimo) descartarVeiculo(leadId, ultimo);
  }
  if (r.naoPerturbar) marcarNaoPerturbar(leadId, texto);
  return r;
}

/** Tem pedido ativo na lista de espera? Então o combinado é "chamo quando entrar": nada de follow-up. */
export function temEsperaAtiva(leadId: string): boolean {
  return listEspera().some((e) => e.leadId === leadId && (e.status === 'aguardando' || e.status === 'notificado'));
}

/**
 * Este lead pode receber um follow-up automático agora?
 * Nunca para: quem nunca respondeu, quem pediu espaço, quem está na lista de espera,
 * quem já tem um consultor da loja avisado, atendimento humano, opt-out e leads encerrados.
 */
export function podeReceberFollowup(lead: Lead): { ok: boolean; motivo?: string } {
  if (lead.teste || !lead.agenteAtivo) return { ok: false, motivo: 'agente inativo' };
  if (lead.humano) return { ok: false, motivo: 'atendimento humano' };
  if (lead.status === 'optout') return { ok: false, motivo: 'opt-out' };
  if (['comprou', 'perdido', 'visitou'].includes(lead.status)) return { ok: false, motivo: `status ${lead.status}` };
  if (lead.naoPerturbar) return { ok: false, motivo: 'pediu para não ser incomodado' };
  if (lead.totalMensagensLead < 1) return { ok: false, motivo: 'nunca respondeu' };
  if (lead.roteadoEm && lead.lojaNotificadaEm) return { ok: false, motivo: 'já está com um consultor da loja' };
  if (temEsperaAtiva(lead.id)) return { ok: false, motivo: 'na lista de espera' };
  if ((lead.followupsTotal ?? 0) >= MAX_FOLLOWUPS_TOTAL) return { ok: false, motivo: 'limite de follow-ups' };
  return { ok: true };
}

/** Primeiro nome para tratar o cliente; "Clodoaldo (Clo)" → "Clo". Só se o nome foi confirmado. */
export function primeiroNome(lead: Lead): string {
  if (!lead.nome || !lead.perfil.nomeConfirmado) return '';
  const apelido = lead.nome.match(/\(([^)]{2,20})\)/)?.[1]?.trim();
  if (apelido) return apelido.split(/\s+/)[0];
  return lead.nome.replace(/\(.*?\)/g, '').trim().split(/\s+/)[0] ?? '';
}
