import { createHash } from 'node:crypto';
import type { Lead } from '../db/types';

const sha = (v: string) => createHash('sha256').update(v.trim().toLowerCase()).digest('hex');

export function capiConfigurado(): boolean {
  return Boolean(process.env.META_PIXEL_ID && process.env.META_CAPI_TOKEN);
}

/**
 * Meta Conversions API: devolve para a Meta o evento "lead qualificado".
 * Assim o algoritmo dos anúncios passa a otimizar para quem realmente tem
 * perfil de compra, e não apenas para quem clica ou manda "oi".
 * Nunca lança: falha aqui não pode quebrar o atendimento.
 */
export async function enviarEventoQualificado(lead: Lead): Promise<void> {
  if (!capiConfigurado()) return;
  try {
    const userData: Record<string, unknown> = { ph: [sha(lead.telefone)], country: [sha('br')] };
    const primeiroNome = lead.nome.split(/\s+/)[0];
    if (primeiroNome) userData.fn = [sha(primeiroNome)];
    if (lead.origem.fbclid) {
      userData.fbc = `fb.1.${Date.parse(lead.criadoEm)}.${lead.origem.fbclid}`;
    }
    if (lead.origem.ctwa_clid) userData.ctwa_clid = lead.origem.ctwa_clid;

    const evento: Record<string, unknown> = {
      event_name: 'LeadQualificado',
      event_time: Math.floor(Date.now() / 1000),
      event_id: `qual-${lead.id}`,
      action_source: lead.origem.ctwa_clid ? 'business_messaging' : 'system_generated',
      user_data: userData,
      custom_data: {
        currency: 'BRL',
        value: lead.perfil.orcamento ?? 0,
        lead_score: lead.score,
        loja: lead.lojaSlug ?? '',
        campanha: lead.origem.utm_campaign,
      },
    };
    if (lead.origem.ctwa_clid) evento.messaging_channel = 'whatsapp';

    const body: Record<string, unknown> = { data: [evento] };
    if (process.env.META_TEST_EVENT_CODE) body.test_event_code = process.env.META_TEST_EVENT_CODE;

    const res = await fetch(
      `https://graph.facebook.com/v21.0/${process.env.META_PIXEL_ID}/events?access_token=${encodeURIComponent(
        process.env.META_CAPI_TOKEN!
      )}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15_000),
      }
    );
    if (!res.ok) console.error('[capi] resposta', res.status, await res.text());
  } catch (e) {
    console.error('[capi] falha', e);
  }
}
