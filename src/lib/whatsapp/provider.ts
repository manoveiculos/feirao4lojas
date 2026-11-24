/**
 * Camada de provedor WhatsApp. Suporta:
 *  - Evolution API (WHATSAPP_PROVIDER=evolution) — instância própria, sem janela de 24h
 *  - WhatsApp Cloud API oficial da Meta (WHATSAPP_PROVIDER=meta)
 *  - none: não envia nada (desenvolvimento / testes)
 */

export interface Entrada {
  tipo: 'mensagem' | 'eco_humano';
  telefone: string;
  texto: string;
  waId: string;
  nome: string;
  midia: 'audio' | 'imagem' | 'video' | 'documento' | 'sticker' | 'outro' | null;
  referral: { ad_id: string; headline: string; ctwa_clid: string } | null;
}

export interface Enviado {
  ok: boolean;
  waId: string;
  erro?: string;
}

export type ProviderNome = 'evolution' | 'meta' | 'none';

export function providerNome(): ProviderNome {
  const p = (process.env.WHATSAPP_PROVIDER || 'none').toLowerCase();
  return p === 'evolution' || p === 'meta' ? p : 'none';
}

async function postJson(
  url: string,
  headers: Record<string, string>,
  body: unknown
): Promise<{ ok: boolean; status: number; json: Record<string, unknown> }> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  let json: Record<string, unknown> = {};
  try {
    json = (await res.json()) as Record<string, unknown>;
  } catch {
    // corpo vazio
  }
  return { ok: res.ok, status: res.status, json };
}

// ───────────────────────── Evolution API ─────────────────────────

function evo() {
  const base = (process.env.EVOLUTION_API_URL || '').replace(/\/$/, '');
  const key = process.env.EVOLUTION_API_KEY || '';
  const inst = process.env.EVOLUTION_INSTANCE || '';
  if (!base || !key || !inst) throw new Error('Evolution API não configurada (URL/KEY/INSTANCE).');
  return { base, headers: { apikey: key }, inst };
}

function evoWaId(json: Record<string, unknown>): string {
  const key = json.key as { id?: string } | undefined;
  return key?.id || '';
}

// ───────────────────────── Meta Cloud API ─────────────────────────

function meta() {
  const token = process.env.META_WA_TOKEN || '';
  const phoneId = process.env.META_WA_PHONE_ID || '';
  if (!token || !phoneId) throw new Error('Meta Cloud API não configurada (META_WA_TOKEN/META_WA_PHONE_ID).');
  return {
    url: `https://graph.facebook.com/v21.0/${phoneId}/messages`,
    headers: { Authorization: `Bearer ${token}` },
  };
}

function metaWaId(json: Record<string, unknown>): string {
  const msgs = json.messages as Array<{ id?: string }> | undefined;
  return msgs?.[0]?.id || '';
}

function erroDe(json: Record<string, unknown>, status: number): string {
  const e = json.error as { message?: string } | string | undefined;
  const m = typeof e === 'string' ? e : e?.message;
  return `HTTP ${status}${m ? `: ${m}` : ''}`;
}

// ───────────────────────── API pública ─────────────────────────

export async function enviarTextoWa(telefone: string, texto: string, delayMs = 0): Promise<Enviado> {
  const p = providerNome();
  try {
    if (p === 'evolution') {
      const { base, headers, inst } = evo();
      const r = await postJson(`${base}/message/sendText/${inst}`, headers, {
        number: telefone,
        text: texto,
        delay: delayMs,
      });
      return r.ok ? { ok: true, waId: evoWaId(r.json) } : { ok: false, waId: '', erro: erroDe(r.json, r.status) };
    }
    if (p === 'meta') {
      const { url, headers } = meta();
      const r = await postJson(url, headers, {
        messaging_product: 'whatsapp',
        to: telefone,
        type: 'text',
        text: { body: texto, preview_url: false },
      });
      return r.ok ? { ok: true, waId: metaWaId(r.json) } : { ok: false, waId: '', erro: erroDe(r.json, r.status) };
    }
    console.log(`[whatsapp:none] → ${telefone}: ${texto}`);
    return { ok: true, waId: '' };
  } catch (e) {
    return { ok: false, waId: '', erro: e instanceof Error ? e.message : String(e) };
  }
}

export async function enviarImagemWa(
  telefone: string,
  url: string,
  legenda: string
): Promise<Enviado> {
  const p = providerNome();
  try {
    if (p === 'evolution') {
      const { base, headers, inst } = evo();
      const r = await postJson(`${base}/message/sendMedia/${inst}`, headers, {
        number: telefone,
        mediatype: 'image',
        mimetype: 'image/jpeg',
        media: url,
        caption: legenda,
        fileName: 'foto.jpg',
      });
      return r.ok ? { ok: true, waId: evoWaId(r.json) } : { ok: false, waId: '', erro: erroDe(r.json, r.status) };
    }
    if (p === 'meta') {
      const { url: endpoint, headers } = meta();
      const r = await postJson(endpoint, headers, {
        messaging_product: 'whatsapp',
        to: telefone,
        type: 'image',
        image: { link: url, caption: legenda },
      });
      return r.ok ? { ok: true, waId: metaWaId(r.json) } : { ok: false, waId: '', erro: erroDe(r.json, r.status) };
    }
    console.log(`[whatsapp:none] → ${telefone}: [imagem ${url}] ${legenda}`);
    return { ok: true, waId: '' };
  } catch (e) {
    return { ok: false, waId: '', erro: e instanceof Error ? e.message : String(e) };
  }
}

/** Indicador "digitando…" (melhor esforço; nunca lança). */
export async function digitandoWa(telefone: string, ms: number, metaMsgId = ''): Promise<void> {
  const p = providerNome();
  try {
    if (p === 'evolution') {
      const { base, headers, inst } = evo();
      await postJson(`${base}/chat/sendPresence/${inst}`, headers, {
        number: telefone,
        presence: 'composing',
        delay: ms,
      });
    } else if (p === 'meta' && metaMsgId) {
      const { url, headers } = meta();
      await postJson(url, headers, {
        messaging_product: 'whatsapp',
        status: 'read',
        message_id: metaMsgId,
        typing_indicator: { type: 'text' },
      });
    }
  } catch {
    // ignorado de propósito
  }
}

// ───────────────────────── Parsers de webhook ─────────────────────────

type Obj = Record<string, unknown>;
const asObj = (v: unknown): Obj => (v && typeof v === 'object' ? (v as Obj) : {});
const asStr = (v: unknown): string => (typeof v === 'string' ? v : '');

function midiaEvolution(msg: Obj): Entrada['midia'] {
  if (msg.audioMessage) return 'audio';
  if (msg.imageMessage) return 'imagem';
  if (msg.videoMessage) return 'video';
  if (msg.documentMessage || msg.documentWithCaptionMessage) return 'documento';
  if (msg.stickerMessage) return 'sticker';
  return null;
}

export function parseEvolution(body: unknown): Entrada[] {
  const b = asObj(body);
  const evento = asStr(b.event).toLowerCase().replace(/_/g, '.');
  if (evento && evento !== 'messages.upsert') return [];
  const data = asObj(b.data);
  const items: Obj[] = Array.isArray(b.data) ? (b.data as Obj[]) : [data];
  const out: Entrada[] = [];

  for (const d of items) {
    const key = asObj(d.key);
    const jid = asStr(key.remoteJid);
    if (!jid || jid.endsWith('@g.us') || jid.includes('status@broadcast')) continue;

    let numero = jid.split('@')[0];
    if (jid.endsWith('@lid')) {
      const alt = asStr(key.remoteJidAlt) || asStr(key.senderPn) || asStr(d.senderPn);
      if (!alt) continue; // sem número real não há como responder
      numero = alt.split('@')[0];
    }

    const message = asObj(d.message);
    const texto =
      asStr(message.conversation) ||
      asStr(asObj(message.extendedTextMessage).text) ||
      asStr(asObj(message.imageMessage).caption) ||
      asStr(asObj(message.videoMessage).caption);

    const ctx = {
      ...asObj(asObj(message.extendedTextMessage).contextInfo),
      ...asObj(d.contextInfo),
    };
    const ad = asObj(ctx.externalAdReply);
    const referral = asStr(ad.sourceId)
      ? {
          ad_id: asStr(ad.sourceId),
          headline: asStr(ad.title),
          ctwa_clid: asStr(ad.ctwaClid) || asStr(ctx.ctwaClid),
        }
      : null;

    out.push({
      tipo: key.fromMe === true ? 'eco_humano' : 'mensagem',
      telefone: numero.replace(/\D/g, ''),
      texto,
      waId: asStr(key.id),
      nome: asStr(d.pushName),
      midia: midiaEvolution(message),
      referral,
    });
  }
  return out;
}

export function parseMeta(body: unknown): Entrada[] {
  const out: Entrada[] = [];
  const entries = Array.isArray(asObj(body).entry) ? (asObj(body).entry as Obj[]) : [];
  for (const e of entries) {
    const changes = Array.isArray(e.changes) ? (e.changes as Obj[]) : [];
    for (const c of changes) {
      const value = asObj(c.value);
      const contatos = Array.isArray(value.contacts) ? (value.contacts as Obj[]) : [];
      const nomes = new Map<string, string>();
      for (const ct of contatos) nomes.set(asStr(ct.wa_id), asStr(asObj(ct.profile).name));
      const msgs = Array.isArray(value.messages) ? (value.messages as Obj[]) : [];
      for (const m of msgs) {
        const tipo = asStr(m.type);
        const ref = asObj(m.referral);
        const midia: Entrada['midia'] =
          tipo === 'audio' ? 'audio' : tipo === 'image' ? 'imagem' : tipo === 'video' ? 'video'
          : tipo === 'document' ? 'documento' : tipo === 'sticker' ? 'sticker'
          : tipo === 'text' || tipo === 'button' || tipo === 'interactive' ? null : 'outro';
        const texto =
          asStr(asObj(m.text).body) ||
          asStr(asObj(m.button).text) ||
          asStr(asObj(asObj(m.interactive).button_reply).title) ||
          asStr(asObj(m.image).caption);
        out.push({
          tipo: 'mensagem',
          telefone: asStr(m.from).replace(/\D/g, ''),
          texto,
          waId: asStr(m.id),
          nome: nomes.get(asStr(m.from)) || '',
          midia,
          referral: asStr(ref.source_id)
            ? {
                ad_id: asStr(ref.source_id),
                headline: asStr(ref.headline),
                ctwa_clid: asStr(ref.ctwa_clid),
              }
            : null,
        });
      }
    }
  }
  return out;
}

export function parseWebhook(body: unknown): Entrada[] {
  const b = asObj(body);
  if (b.object === 'whatsapp_business_account') return parseMeta(body);
  return parseEvolution(body);
}
