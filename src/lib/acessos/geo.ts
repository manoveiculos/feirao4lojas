// Cidade/UF e aparelho do visitante, resolvidos no servidor.
// O IP NUNCA é gravado: só cidade/UF/país resultantes. Cidade vem primeiro dos headers do CDN
// (grátis e sem latência) e, se vierem vazios, de uma consulta GeoIP com cache de 24 h por IP.
// Para desligar a consulta externa: ACESSOS_GEOIP=off.

export interface GeoInfo {
  cidade: string | null;
  uf: string | null;
  pais: string | null;
}

const VAZIO: GeoInfo = { cidade: null, uf: null, pais: null };

const decodificar = (v: string | null): string | null => {
  if (!v) return null;
  try {
    const limpo = decodeURIComponent(v).trim();
    return limpo && limpo.toLowerCase() !== 'unknown' ? limpo.slice(0, 80) : null;
  } catch {
    return v.slice(0, 80);
  }
};

const UF_POR_NOME: Record<string, string> = {
  acre: 'AC', alagoas: 'AL', amapa: 'AP', amazonas: 'AM', bahia: 'BA', ceara: 'CE', 'distrito federal': 'DF',
  'espirito santo': 'ES', goias: 'GO', maranhao: 'MA', 'mato grosso': 'MT', 'mato grosso do sul': 'MS',
  'minas gerais': 'MG', para: 'PA', paraiba: 'PB', parana: 'PR', pernambuco: 'PE', piaui: 'PI',
  'rio de janeiro': 'RJ', 'rio grande do norte': 'RN', 'rio grande do sul': 'RS', rondonia: 'RO', roraima: 'RR',
  'santa catarina': 'SC', 'sao paulo': 'SP', sergipe: 'SE', tocantins: 'TO',
};

function normalizarUf(valor: string | null): string | null {
  if (!valor) return null;
  const v = valor.trim().toUpperCase();
  if (/^[A-Z]{2}$/.test(v)) return v;
  const chave = valor.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  return UF_POR_NOME[chave] || null;
}

export function lerGeoHeaders(h: Headers): GeoInfo | null {
  const cidade = decodificar(h.get('x-vercel-ip-city') || h.get('cf-ipcity') || h.get('x-appengine-city'));
  const regiao = h.get('x-vercel-ip-country-region') || h.get('cf-region-code') || h.get('cf-region') || h.get('x-appengine-region');
  const pais = (h.get('x-vercel-ip-country') || h.get('cf-ipcountry') || h.get('x-appengine-country') || '').toUpperCase().slice(0, 2);
  const uf = normalizarUf(decodificar(regiao));
  if (!cidade && !uf) return null;
  return { cidade, uf, pais: /^[A-Z]{2}$/.test(pais) && pais !== 'XX' ? pais : null };
}

export function ipDoRequest(h: Headers): string {
  const cf = h.get('cf-connecting-ip');
  if (cf) return cf.trim();
  const xff = h.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return (h.get('x-real-ip') || '').trim();
}

function ipPrivado(ip: string): boolean {
  return (
    !ip ||
    ip === '::1' ||
    /^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip) ||
    /^(fc|fd|fe80)/i.test(ip)
  );
}

const CACHE_GEO = new Map<string, { geo: GeoInfo; ts: number }>();
const TTL_MS = 24 * 3600_000;

async function consultarGeoIp(ip: string): Promise<GeoInfo> {
  if (process.env.ACESSOS_GEOIP === 'off' || ipPrivado(ip)) return VAZIO;
  const hit = CACHE_GEO.get(ip);
  if (hit && Date.now() - hit.ts < TTL_MS) return hit.geo;
  try {
    // ipwho.is: HTTPS, sem chave, devolve city/region/region_code/country_code.
    const r = await fetch(`https://ipwho.is/${encodeURIComponent(ip)}?fields=success,city,region,region_code,country_code`, {
      signal: AbortSignal.timeout(2500),
    });
    const j = (await r.json()) as Record<string, unknown>;
    const geo: GeoInfo =
      j && j.success !== false
        ? {
            cidade: j.city ? String(j.city).slice(0, 80) : null,
            uf: normalizarUf(j.region_code ? String(j.region_code) : null) || normalizarUf(j.region ? String(j.region) : null),
            pais: j.country_code ? String(j.country_code).toUpperCase().slice(0, 2) : null,
          }
        : VAZIO;
    if (CACHE_GEO.size >= 3000) CACHE_GEO.delete(CACHE_GEO.keys().next().value as string);
    // falha não fica 24h em cache: tenta de novo em 10 min
    CACHE_GEO.set(ip, { geo, ts: geo.cidade || geo.uf ? Date.now() : Date.now() - TTL_MS + 10 * 60_000 });
    return geo;
  } catch {
    return VAZIO;
  }
}

export async function resolverGeo(h: Headers): Promise<GeoInfo> {
  const dosHeaders = lerGeoHeaders(h);
  if (dosHeaders?.cidade) return dosHeaders;
  const doIp = await consultarGeoIp(ipDoRequest(h));
  return { cidade: dosHeaders?.cidade || doIp.cidade, uf: dosHeaders?.uf || doIp.uf, pais: dosHeaders?.pais || doIp.pais };
}

// ───────────────────────── User-Agent ─────────────────────────

export interface AparelhoInfo {
  dispositivo: 'Mobile' | 'Desktop';
  dispositivo_detalhe: string;
  navegador: string;
}

function detectarNavegador(ua: string): string {
  if (/FBAN|FBAV|FB_IAB/i.test(ua)) return 'Facebook (in-app)';
  if (/Instagram/i.test(ua)) return 'Instagram (in-app)';
  if (/EdgA?\//i.test(ua)) return 'Edge';
  if (/OPR\/|Opera/i.test(ua)) return 'Opera';
  if (/SamsungBrowser/i.test(ua)) return 'Samsung Internet';
  if (/CriOS|Chrome\//i.test(ua)) return 'Chrome';
  if (/FxiOS|Firefox\//i.test(ua)) return 'Firefox';
  if (/Safari\//i.test(ua)) return 'Safari';
  return 'Outro';
}

export function parseUserAgent(ua: string): AparelhoInfo {
  const u = ua || '';
  const navegador = detectarNavegador(u);
  if (/iPhone/i.test(u)) return { dispositivo: 'Mobile', dispositivo_detalhe: 'iPhone (iOS)', navegador };
  if (/iPad/i.test(u)) return { dispositivo: 'Mobile', dispositivo_detalhe: 'iPad (iOS)', navegador };
  if (/Android/i.test(u)) {
    let marca = 'Android';
    if (/SM-|Samsung|GT-[A-Z]\d/i.test(u)) marca = 'Samsung';
    else if (/Redmi|POCO|Xiaomi|\bMi\s|MIUI/i.test(u)) marca = 'Xiaomi';
    else if (/moto|Motorola|XT\d{4}/i.test(u)) marca = 'Motorola';
    else if (/LG-|LM-/i.test(u)) marca = 'LG';
    else if (/realme|RMX/i.test(u)) marca = 'Realme';
    else if (/Pixel/i.test(u)) marca = 'Google Pixel';
    else if (/ASUS|ZenFone/i.test(u)) marca = 'Asus';
    else if (/Infinix|TECNO|itel/i.test(u)) marca = 'Infinix/Tecno';
    const detalhe = marca === 'Android' ? 'Android' : `${marca} (Android)`;
    return { dispositivo: 'Mobile', dispositivo_detalhe: /Mobile/i.test(u) ? detalhe : `Tablet ${detalhe}`, navegador };
  }
  if (/Windows/i.test(u)) return { dispositivo: 'Desktop', dispositivo_detalhe: 'Desktop Windows', navegador };
  if (/Macintosh|Mac OS X/i.test(u)) return { dispositivo: 'Desktop', dispositivo_detalhe: 'Desktop Mac', navegador };
  if (/CrOS/i.test(u)) return { dispositivo: 'Desktop', dispositivo_detalhe: 'Chromebook', navegador };
  if (/Linux/i.test(u)) return { dispositivo: 'Desktop', dispositivo_detalhe: 'Desktop Linux', navegador };
  const mobile = /Mobile/i.test(u);
  return { dispositivo: mobile ? 'Mobile' : 'Desktop', dispositivo_detalhe: mobile ? 'Mobile' : 'Desktop', navegador };
}

export const EH_ROBO = /bot|crawler|spider|slurp|gptbot|claudebot|perplexitybot|facebookexternalhit|facebot|whatsapp|preview|lighthouse|headless|monitor|uptime|curl|wget|python-requests|go-http|node-fetch|axios/i;
