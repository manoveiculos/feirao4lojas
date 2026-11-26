import type { Canal } from './tipos';

export interface SinaisOrigem {
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  gclid?: string | null;
  fbclid?: string | null;
  ttclid?: string | null;
  referrer?: string | null;
}

const PAGO = /cpc|ppc|paid|paid_social|pmax|display|ads|sponsored|trafego_pago|remarketing|catalogo|cpm|social_pago/i;

function hostDe(referrer: string): string {
  try {
    return new URL(referrer).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

/**
 * Classifica a visita em um dos 5 canais e devolve a origem em palavras
 * (ex.: "Facebook Ads (anúncio)", "Google (busca)", "Instagram (perfil/link)").
 */
export function classificarOrigem(s: SinaisOrigem): { canal: Canal; sub_origem: string } {
  const src = (s.utm_source || '').toLowerCase().trim();
  const med = (s.utm_medium || '').toLowerCase().trim();
  const host = s.referrer ? hostDe(s.referrer) : '';
  const pago = PAGO.test(med) || (Boolean(s.utm_campaign) && src !== '' && med !== 'organic');

  // 1. Meta (Facebook/Instagram)
  if (s.fbclid || /^(facebook|instagram|meta|fb|ig)$/.test(src) || /facebook|instagram/.test(src)) {
    if (s.fbclid || pago) return { canal: 'meta_ads', sub_origem: s.fbclid ? 'Facebook/Instagram Ads (clique no anúncio)' : `Facebook/Instagram Ads (${src})` };
  }
  // 2. Google
  if (s.gclid || (/google/.test(src) && pago)) {
    return { canal: 'google_ads', sub_origem: s.gclid ? 'Google Ads (clique no anúncio)' : `Google Ads (${src})` };
  }
  // 3. TikTok
  if (s.ttclid || (/tiktok/.test(src) && pago)) {
    return { canal: 'tiktok_ads', sub_origem: 'TikTok Ads' };
  }
  // Link marcado com UTM sem sinal de mídia paga
  if (src) {
    if (/facebook|instagram|meta|fb|ig/.test(src)) return { canal: 'organico', sub_origem: `Link na rede (${src})` };
    return { canal: 'organico', sub_origem: `Link marcado (${src}${med ? ` / ${med}` : ''})` };
  }

  if (!host) return { canal: 'direto', sub_origem: 'Direto (digitou o endereço ou abriu pelo WhatsApp)' };

  if (/chatgpt\.com|openai\.com/.test(host)) return { canal: 'organico', sub_origem: 'ChatGPT' };
  if (/perplexity\.ai/.test(host)) return { canal: 'organico', sub_origem: 'Perplexity' };
  if (/gemini\.google|bard\.google/.test(host)) return { canal: 'organico', sub_origem: 'Gemini' };
  if (/claude\.ai/.test(host)) return { canal: 'organico', sub_origem: 'Claude' };
  if (/google\./.test(host)) return { canal: 'organico', sub_origem: 'Google (busca)' };
  if (/bing\.com/.test(host)) return { canal: 'organico', sub_origem: 'Bing (busca)' };
  if (/duckduckgo\.com/.test(host)) return { canal: 'organico', sub_origem: 'DuckDuckGo (busca)' };
  if (/instagram\.com/.test(host)) return { canal: 'organico', sub_origem: 'Instagram (perfil/link)' };
  if (/facebook\.com|fb\.com|l\.facebook/.test(host)) return { canal: 'organico', sub_origem: 'Facebook (post/link)' };
  if (/tiktok\.com/.test(host)) return { canal: 'organico', sub_origem: 'TikTok (perfil/link)' };
  if (/youtube\.com|youtu\.be/.test(host)) return { canal: 'organico', sub_origem: 'YouTube' };
  if (/wa\.me|whatsapp\.com/.test(host)) return { canal: 'organico', sub_origem: 'WhatsApp (link compartilhado)' };
  return { canal: 'organico', sub_origem: `Site ${host}` };
}
