import { TZDate } from '@date-fns/tz';
import { CAMPAIGN_TIMEZONE } from '../campaign';
import { addEvento, getSettings, listEventos, listLeads, updateLead } from '../db/store';
import type { Lead } from '../db/types';
import { loadEstoque } from '../estoque';
import { enviarTexto, marcarProximoFollowup } from '../whatsapp/outbound';
import { FEIRAO_CONFIG } from '../config';
import { getCampaignState, resolveEffectiveDate } from '../campaign';

/** Só envia ativamente entre 8h e 20h (horário de Brasília). */
export function dentroDoHorarioComercial(agora = new Date()): boolean {
  const h = new TZDate(agora, CAMPAIGN_TIMEZONE).getHours();
  return h >= 8 && h < 20;
}

function interesse(lead: Lead): string {
  const cod = lead.perfil.veiculosInteresse[lead.perfil.veiculosInteresse.length - 1];
  if (cod) {
    const v = loadEstoque().veiculos.find((x) => x.codigo === cod);
    if (v) return `o ${v.marca} ${v.modelo} ${v.anoTexto}`.replace(/\s{2,}/g, ' ');
  }
  return lead.perfil.marca_modelo || (lead.perfil.categoria ? `um ${lead.perfil.categoria}` : 'o carro que você procura');
}

/**
 * Follow-up automático (padrão: 2 h, 24 h e 72 h sem resposta, só das 8h às 20h; ajustável em Agente & Config).
 * Mensagens de 1–2 linhas, com o carro que o cliente olhou e uma pergunta só.
 */
export function textoFollowup(lead: Lead, etapa: number): string {
  // só usa o nome que o cliente confirmou (o do perfil do WhatsApp pode ser apelido ou empresa)
  const nome = lead.perfil.nomeConfirmado && lead.nome ? lead.nome.split(/\s+/)[0] : '';
  const oi = nome ? `Oi, ${nome}!` : 'Oi!';
  const st = getCampaignState(resolveEffectiveDate(null, 0).nowBrt);
  const evento =
    st.mode === 'encerrado'
      ? ''
      : st.mode === 'pre_lancamento'
        ? `O ${FEIRAO_CONFIG.nome} abre dia 14/12.`
        : st.isLastCall
          ? `O ${FEIRAO_CONFIG.nome} vai só até 23/12.`
          : `O ${FEIRAO_CONFIG.nome} está rolando agora.`;
  // não presume financiamento: o benefício da parcela só aparece para quem disse que vai financiar
  const beneficio =
    lead.perfil.formaPagamento === 'financiamento' ? 'a 1ª parcela fica só depois do Carnaval' : 'avaliamos seu usado na hora';

  if (etapa === 0) return `${oi} Ainda quer ver ${interesse(lead)}? Te mando mais fotos 😉`;
  if (etapa === 1) return `${oi} ${evento} E ${beneficio}. Quer reservar um horário pra ver ${interesse(lead)}?`.replace(/\s{2,}/g, ' ');
  return `${oi} Vou pausar por aqui. Quando quiser retomar, é só me chamar 🙏 (Se não quiser mais mensagens, responda "parar".)`;
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
      const etapa = lead.followupsEnviados;
      const r = await enviarTexto(lead, textoFollowup(lead, etapa), { autor: 'agente' });
      if (r.ok) {
        updateLead(lead.id, { followupsEnviados: etapa + 1 });
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
