import { TZDate } from '@date-fns/tz';
import { CAMPAIGN_TIMEZONE } from '../campaign';
import { addEvento, getLead, getSettings, listEventos, listLeads, updateLead } from '../db/store';
import { sincronizarLead } from '../db/sync';
import type { Lead } from '../db/types';
import { loadEstoque } from '../estoque';
import { enviarTexto, marcarProximoFollowup } from '../whatsapp/outbound';
import { gerarFollowupIA } from './engine';
import { podeReceberFollowup, primeiroNome } from './respeito';
import { FEIRAO_CONFIG } from '../config';
import { getCampaignState, resolveEffectiveDate } from '../campaign';

/** Só envia ativamente entre 8h e 20h (horário de Brasília). */
export function dentroDoHorarioComercial(agora = new Date()): boolean {
  const h = new TZDate(agora, CAMPAIGN_TIMEZONE).getHours();
  return h >= 8 && h < 20;
}

/** Carro que o cliente ainda quer: nunca um que ele recusou. Vazio quando não há nenhum. */
function interesse(lead: Lead): string {
  const desc = new Set((lead.veiculosDescartados ?? []).map((c) => c.toUpperCase()));
  const cods = lead.perfil.veiculosInteresse.filter((c) => !desc.has(c.toUpperCase()));
  const cod = cods[cods.length - 1];
  if (cod) {
    const v = loadEstoque().veiculos.find((x) => x.codigo === cod);
    if (v) return `o ${v.marca} ${v.modelo} ${v.anoTexto}`.replace(/s{2,}/g, ' ');
  }
  return lead.perfil.marca_modelo || (lead.perfil.categoria ? `um ${lead.perfil.categoria}` : '');
}

/**
 * Texto de reserva do follow-up (usado só se a IA não puder escrever). Curto, sem inventar,
 * nunca cita carro recusado e não presume financiamento.
 */
export function textoFollowup(lead: Lead, etapa: number): string {
  const nome = primeiroNome(lead);
  const oi = nome ? `Oi, ${nome}!` : 'Oi!';
  const carro = interesse(lead);
  const st = getCampaignState(resolveEffectiveDate(null, 0).nowBrt);
  const evento =
    st.mode === 'encerrado'
      ? ''
      : st.mode === 'pre_lancamento'
        ? `O ${FEIRAO_CONFIG.nome} abre dia 14/12.`
        : st.isLastCall
          ? `O ${FEIRAO_CONFIG.nome} vai só até 23/12.`
          : `O ${FEIRAO_CONFIG.nome} está rolando agora.`;
  const beneficio =
    lead.perfil.formaPagamento === 'financiamento' ? 'a 1ª parcela fica só depois do Carnaval' : 'avaliamos seu usado na hora';

  if (etapa === 0) return carro ? `${oi} Ainda quer ver ${carro}? Te mando mais fotos 😉` : `${oi} Ficou alguma dúvida? Posso te ajudar por aqui 🙂`;
  if (etapa === 1) return (carro ? `${oi} ${evento} E ${beneficio}. Quer reservar um horário pra ver ${carro}?` : `${oi} ${evento} E ${beneficio}. Quer que eu reserve um horário pra você?`).replace(/s{2,}/g, ' ');
  return `${oi} Vou pausar por aqui. Quando quiser retomar, é só me chamar 🙏`;
}

/**
 * Executado a cada minuto: follow-ups pendentes e lembretes de visita.
 * Idempotente: cada lead só avança quando a mensagem sai de fato.
 */
export async function executarTick(agora = new Date()): Promise<{ followups: number; lembretes: number }> {
  const s = getSettings();
  let followups = 0;
  let lembretes = 0;
  if (!s.agenteLigado || !dentroDoHorarioComercial(agora)) return { followups, lembretes };

  const eventos = listEventos();

  for (const lead of listLeads()) {
    if (lead.teste || lead.humano || lead.status === 'optout' || !lead.agenteAtivo) continue;

    // ── Follow-up ──
    if (
      s.followupsAtivos &&
      lead.proximoFollowupEm &&
      Date.parse(lead.proximoFollowupEm) <= agora.getTime() &&
      lead.followupsEnviados < s.maxFollowups &&
      !['comprou', 'perdido', 'visitou'].includes(lead.status)
    ) {
      // o cliente pode ter respondido (ou um humano assumido) em outra instância
      await sincronizarLead(lead.id);
      const fresco = getLead(lead.id);
      if (!fresco || fresco.humano || fresco.status === 'optout' || !fresco.proximoFollowupEm || Date.parse(fresco.proximoFollowupEm) > agora.getTime() || fresco.followupsEnviados !== lead.followupsEnviados) continue;
      // regras de respeito: quem recusou, pediu espaço, está na lista de espera ou já tem consultor não recebe
      const pode = podeReceberFollowup(fresco);
      if (!pode.ok) {
        updateLead(lead.id, { proximoFollowupEm: null });
        continue;
      }
      const etapa = lead.followupsEnviados;
      // a Val escreve lendo a conversa; sem IA disponível, usa o texto de reserva
      const ia = await gerarFollowupIA(fresco, etapa);
      if (ia === '') {
        // a IA concluiu que não há nada útil a dizer: melhor silêncio que insistência
        updateLead(lead.id, { proximoFollowupEm: null });
        continue;
      }
      const r = await enviarTexto(lead, ia ?? textoFollowup(fresco, etapa), { autor: 'agente' });
      if (r.ok) {
        updateLead(lead.id, { followupsEnviados: etapa + 1, ultimoFollowupEm: agora.toISOString(), followupsTotal: (lead.followupsTotal ?? 0) + 1 });
        addEvento({ tipo: 'followup', leadId: lead.id, lojaSlug: lead.lojaSlug, meta: { etapa } });
        marcarProximoFollowup(lead);
        followups++;
      } else {
        // evita martelar um número com erro: tenta de novo em 1h
        updateLead(lead.id, { proximoFollowupEm: new Date(agora.getTime() + 3600_000).toISOString() });
      }
    }

    // ── Lembrete de visita: no dia anterior (a partir das 9h) ──
    const iso = lead.visita.iso;
    if (iso && lead.visita.confirmada && Date.parse(iso) > agora.getTime()) {
      const falta = Date.parse(iso) - agora.getTime();
      const jaLembrou = eventos.some((e) => e.tipo === 'lembrete_visita' && e.leadId === lead.id && e.meta.iso === iso);
      const horaLocal = new TZDate(agora, CAMPAIGN_TIMEZONE).getHours();
      if (!jaLembrou && falta <= 26 * 3600_000 && horaLocal >= 9) {
        const nome = lead.nome ? lead.nome.split(/\s+/)[0] : '';
        const texto =
          `${nome ? `Oi, ${nome}!` : 'Oi!'} Passando pra lembrar da sua visita ao ${FEIRAO_CONFIG.nome}: *${lead.visita.quando}*.\n\n` +
          `📍 ${FEIRAO_CONFIG.localPrincipal.endereco}\n🗺️ ${FEIRAO_CONFIG.localPrincipal.mapsUrl}\n\nTraga seus documentos e, se tiver usado na troca, o documento do carro. Te esperamos! 🚗`;
        const r = await enviarTexto(lead, texto);
        if (r.ok) {
          addEvento({ tipo: 'lembrete_visita', leadId: lead.id, lojaSlug: lead.lojaSlug, meta: { iso } });
          lembretes++;
        }
      }
    }
  }
  return { followups, lembretes };
}
