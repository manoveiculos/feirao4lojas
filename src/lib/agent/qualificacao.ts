import { FEIRAO_CONFIG, LOJAS, LOJAS_BY_SLUG, getSiglaFromCodigo } from '../config';
import { addEvento, getSettings, listLeads, updateLead } from '../db/store';
import type { Lead, Temperatura } from '../db/types';
import { loadEstoque } from '../estoque';
import { filterVeiculos } from '../filters';
import { enviarAvisoInterno } from '../whatsapp/outbound';
import { enviarEventoQualificado } from '../ads/capi';
import type { LojaSlug } from '../types';

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
 * Escolhe a loja responsável:
 * 1) loja do carro de interesse (prefixo do código);
 * 2) loja com mais carros compatíveis com o perfil;
 * 3) loja com menos leads em aberto (distribuição justa).
 */
export function escolherLoja(lead: Lead): LojaSlug {
  const siglaPorCodigo = lead.perfil.veiculosInteresse
    .map((c) => getSiglaFromCodigo(c))
    .find(Boolean);
  if (siglaPorCodigo) {
    const loja = LOJAS.find((l) => l.sigla === siglaPorCodigo);
    if (loja) return loja.slug;
  }

  const p = lead.perfil;
  const abertos = new Map<LojaSlug, number>(LOJAS.map((l) => [l.slug, 0]));
  for (const l of listLeads()) {
    if (l.lojaSlug && ['novo', 'em_atendimento', 'qualificado', 'visita_agendada'].includes(l.status)) {
      abertos.set(l.lojaSlug, (abertos.get(l.lojaSlug) ?? 0) + 1);
    }
  }

  if (p.categoria || p.marca_modelo || p.orcamento) {
    const db = loadEstoque();
    const compat = filterVeiculos(db.veiculos, {
      categoria: p.categoria ?? undefined,
      q: p.marca_modelo ?? undefined,
      precoMax: p.orcamento ? Math.round(p.orcamento * 1.1) : undefined,
      excluirMotos: true,
    });
    const porLoja = new Map<LojaSlug, number>();
    for (const v of compat) porLoja.set(v.lojaSlug, (porLoja.get(v.lojaSlug) ?? 0) + 1);
    const ranking = [...porLoja.entries()].sort(
      (a, b) => b[1] - a[1] || (abertos.get(a[0]) ?? 0) - (abertos.get(b[0]) ?? 0)
    );
    if (ranking[0]) return ranking[0][0];
  }

  return [...abertos.entries()].sort((a, b) => a[1] - b[1])[0][0];
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
 * Chamado após cada atualização do lead. Calcula score e, na primeira vez que
 * o lead qualifica, avisa a loja certa + gerente e dispara o evento p/ Meta.
 */
export async function reavaliarLead(leadId: string, get: (id: string) => Lead | undefined): Promise<Lead | undefined> {
  const atual = get(leadId);
  if (!atual) return undefined;

  const { score, temperatura } = calcularScore(atual);
  const patch: Partial<Lead> = { score, temperatura };

  if (!atual.lojaSlug && (atual.perfil.veiculosInteresse.length || atual.perfil.categoria || atual.perfil.marca_modelo)) {
    patch.lojaSlug = escolherLoja(atual);
  }
  if (atual.status === 'novo' && atual.totalMensagensLead > 0) patch.status = 'em_atendimento';

  let lead = updateLead(leadId, patch)!;

  if (!lead.qualificadoEm && estaQualificado(lead)) {
    const loja = lead.lojaSlug ?? escolherLoja(lead);
    lead = updateLead(leadId, {
      qualificadoEm: new Date().toISOString(),
      status: lead.visita.quando ? 'visita_agendada' : 'qualificado',
      lojaSlug: loja,
    })!;
    if (lead.teste) return lead;
    addEvento({
      tipo: 'qualificado',
      leadId,
      lojaSlug: loja,
      meta: { score: lead.score, canal: lead.origem.canal, campanha: lead.origem.utm_campaign, ad_id: lead.origem.ad_id },
    });
    await notificarLojaQualificado(lead);
    void enviarEventoQualificado(lead);
  }
  return lead;
}

export async function avisarVisita(lead: Lead): Promise<void> {
  const s = getSettings();
  const texto = `📅 *Visita agendada — Acelera V3*

${fichaDoLead(lead)}`;
  const destinos = new Set<string>();
  if (lead.lojaSlug && s.lojaTelefones[lead.lojaSlug]) destinos.add(s.lojaTelefones[lead.lojaSlug]!);
  if (s.gerenteTelefone) destinos.add(s.gerenteTelefone);
  for (const tel of destinos) await enviarAvisoInterno(tel, texto);
}

export async function notificarLojaQualificado(
  lead: Lead,
  titulo = '🔔 *Lead QUALIFICADO — Acelera V3*'
): Promise<void> {
  const s = getSettings();
  const loja = lead.lojaSlug ? LOJAS_BY_SLUG[lead.lojaSlug] : null;
  const painel = `${FEIRAO_CONFIG.siteUrl}/loja/${lead.lojaSlug ?? ''}`;
  const texto =
    `${titulo}${loja ? ` (${loja.nome})` : ''}\n\n` +
    `${fichaDoLead(lead)}\n\n` +
    `👉 Abra a conversa no painel: ${painel}\n` +
    (lead.humano
      ? '_O agente está pausado: o cliente aguarda você._'
      : '_O agente seguirá atendendo até você assumir._');

  const destinos = new Set<string>();
  if (lead.lojaSlug && s.lojaTelefones[lead.lojaSlug]) destinos.add(s.lojaTelefones[lead.lojaSlug]!);
  if (s.gerenteTelefone) destinos.add(s.gerenteTelefone);

  let enviado = false;
  for (const tel of destinos) enviado = (await enviarAvisoInterno(tel, texto)) || enviado;
  if (enviado || destinos.size === 0) {
    updateLead(lead.id, { lojaNotificadaEm: new Date().toISOString() });
  }
}
