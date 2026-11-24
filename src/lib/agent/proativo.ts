import { FEIRAO_CONFIG } from '../config';
import { getCampaignState, resolveEffectiveDate } from '../campaign';
import { addEvento, getLead, getSettings, updateLead } from '../db/store';
import { enviarImagem, enviarTexto, marcarProximoFollowup } from '../whatsapp/outbound';

/**
 * Primeiro contato ativo para quem deixou o WhatsApp no site (lista VIP, formulário).
 * Velocidade importa: o lead recebe a mensagem em segundos, ainda com a página aberta.
 */
export async function boasVindasProativas(leadId: string, interesse = ''): Promise<void> {
  const s = getSettings();
  const lead = getLead(leadId);
  if (!lead || !s.agenteLigado || !s.boasVindasProativas) return;
  if (lead.humano || lead.status === 'optout' || lead.teste) return;
  if (lead.ultimaMensagemEm) return; // já existe conversa: não reabre com mensagem fria

  const nome = lead.nome ? lead.nome.split(/\s+/)[0] : '';
  const st = getCampaignState(resolveEffectiveDate(null, 0).nowBrt);
  const gancho =
    st.mode === 'encerrado'
      ? `O ${FEIRAO_CONFIG.nome} já terminou, mas você vai ser um dos primeiros a saber do próximo feirão das 4 lojas.`
      : st.mode === 'pre_lancamento'
        ? `Você está na lista VIP do ${FEIRAO_CONFIG.nome}, que abre dia 14/12 em Rio do Sul, e já pode adiantar sua simulação por aqui.`
        : `O ${FEIRAO_CONFIG.nome} está rolando agora em Rio do Sul (até 23/12) e dá pra adiantar tudo por aqui.`;

  const abertura =
    `${nome ? `Oi, ${nome}!` : 'Oi!'} Sou o assistente virtual do ${FEIRAO_CONFIG.nome} 🚗\n` +
    `${gancho}`;
  const pergunta = interesse
    ? `Vi que seu interesse é em *${interesse}*. Qual faixa de valor você tem em mente? Já separo as melhores opções pra você.`
    : `Me conta: que tipo de carro você procura e até quanto pretende investir? Já separo as melhores opções pra você.`;

  const r = await enviarTexto(lead, abertura);
  if (!r.ok) return;
  if (st.mode !== 'encerrado' && !lead.conviteEnviadoEm) {
    await enviarImagem(lead, `${FEIRAO_CONFIG.siteUrl}${FEIRAO_CONFIG.ogImage}`, '');
    updateLead(lead.id, { conviteEnviadoEm: new Date().toISOString() });
    addEvento({ tipo: 'convite_enviado', leadId: lead.id, lojaSlug: lead.lojaSlug, meta: { proativo: true } });
  }
  await enviarTexto(lead, pergunta);
  updateLead(lead.id, { status: 'em_atendimento' });
  marcarProximoFollowup(getLead(lead.id)!);
}
