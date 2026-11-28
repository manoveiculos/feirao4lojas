import { FEIRAO_CONFIG } from '../config';
import { addMensagem, getLead, getSettings, marcarWaIdProcessado, updateLead } from '../db/store';
import type { Lead, MensagemAutor } from '../db/types';
import { digitandoWa, enviarImagemWa, enviarTextoWa } from './provider';
import { INTERVALO_MIN_FOLLOWUP_MS, MAX_FOLLOWUPS_TOTAL } from '../agent/respeito';

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Hosts de foto permitidos no proxy (evita SSRF). */
export const FOTO_HOSTS = new Set(['fotos.altovaleveiculos.com.br', 's3.amazonaws.com']);

/**
 * WhatsApp não aceita .webp como foto: servimos JPEG convertido pelo proxy do próprio site.
 */
export function urlFotoWhatsapp(origem: string): string {
  return `${FEIRAO_CONFIG.siteUrl}/api/media/foto?u=${encodeURIComponent(origem)}`;
}

const COD = String.raw`(?:MV|NA|RA|V3)-\d{3}`;
const RE_COD_PARENTESES = new RegExp(String.raw`\s*\((?:c[oó]d(?:igo)?\.?:?\s*)?${COD}(?:\s*(?:e|,|/|ou)\s*${COD})*\)`, 'gi');
const RE_COD_ROTULO = new RegExp(String.raw`\s*[-–—,|]?\s*(?:🔖\s*)?c[oó]d(?:igo)?\.?:?\s*${COD}(?:\s*(?:e|,|/|ou)\s*${COD})*`, 'gi');
// não mexe em código dentro de link (ex.: …/?carro=NA-001)
const RE_COD_SOLTO = new RegExp(String.raw`(?<![=/\w-])${COD}\b`, 'gi');

/**
 * O cliente nunca vê códigos internos: "(MV-006)", "cód. NA-001", "[Ref: AV3-…]", "[#sid]".
 * Os códigos continuam valendo por dentro (tools, painel, avisos às lojas).
 */
export function limparTextoCliente(texto: string): string {
  return texto
    .replace(/\s*\[Ref:[^\]]*\]/gi, '')
    .replace(/\s*\[#[a-z0-9]{4,20}\]/gi, '')
    .replace(RE_COD_PARENTESES, '')
    .replace(RE_COD_ROTULO, '')
    .replace(RE_COD_SOLTO, '')
    .replace(/\(\s*[,;]\s*/g, '(')
    .replace(/\s*\(\s*\)/g, '')
    .replace(/^[ \t]*[—–-][ \t]+/gm, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/ +([,.;:!?])/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Quebra a resposta em até 3 balões naturais, por parágrafo. */
export function quebrarEmBaloes(texto: string, max = 3): string[] {
  const partes = texto
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (partes.length <= max) return partes;
  const head = partes.slice(0, max - 1);
  head.push(partes.slice(max - 1).join('\n\n'));
  return head;
}

export interface OpcoesEnvio {
  autor?: MensagemAutor;
  /** Em modo teste: não envia ao provedor, só registra e devolve. */
  simulado?: boolean;
  /** Foto extra de um álbum: envia, mas não cria uma linha de mensagem própria (só marca o id para o eco). */
  silencioso?: boolean;
  /** Fotos mostradas na linha de mensagem do envio (álbum numa linha só). */
  midiasRegistro?: string[];
}

export async function enviarTexto(
  lead: Lead,
  texto: string,
  opts: OpcoesEnvio = {}
): Promise<{ ok: boolean; erro?: string }> {
  const autor = opts.autor ?? 'agente';
  // texto do agente passa pelo filtro de códigos; o que um humano digita sai como está
  const limpo = autor === 'agente' ? limparTextoCliente(texto) : texto.trim();
  if (!limpo) return { ok: true };
  if (!getLead(lead.id)) return { ok: false, erro: 'lead excluído' };

  if (opts.simulado) {
    addMensagem({ leadId: lead.id, autor, texto: limpo, midias: [], waId: '' });
    return { ok: true };
  }

  // tempo de "digitação" proporcional ao texto (humaniza e evita rajadas)
  const delay = Math.min(4500, 700 + limpo.length * 22);
  void digitandoWa(lead.telefone, delay);
  const r = await enviarTextoWa(lead.telefone, limpo, delay);
  if (!r.ok) {
    console.error(`[outbound] falha ao enviar texto para ${lead.telefone}: ${r.erro}`);
    addMensagem({
      leadId: lead.id,
      autor: 'sistema',
      texto: `⚠️ Falha ao enviar mensagem: ${r.erro}`,
      midias: [],
      waId: '',
    });
    return { ok: false, erro: r.erro };
  }
  addMensagem({ leadId: lead.id, autor, texto: limpo, midias: [], waId: r.waId });
  await sleep(delay);
  return { ok: true };
}

export async function enviarImagem(
  lead: Lead,
  fotoOrigem: string,
  legenda: string,
  opts: OpcoesEnvio = {}
): Promise<{ ok: boolean; erro?: string }> {
  const autor = opts.autor ?? 'agente';
  if (autor === 'agente') legenda = limparTextoCliente(legenda);
  const url = urlFotoWhatsapp(fotoOrigem);
  if (!getLead(lead.id)) return { ok: false, erro: 'lead excluído' };

  const midias = opts.midiasRegistro ?? [fotoOrigem];
  if (opts.simulado) {
    if (!opts.silencioso) addMensagem({ leadId: lead.id, autor, texto: legenda, midias, waId: '' });
    return { ok: true };
  }

  const r = await enviarImagemWa(lead.telefone, url, legenda);
  if (!r.ok) {
    console.error(`[outbound] falha ao enviar imagem para ${lead.telefone}: ${r.erro}`);
    return { ok: false, erro: r.erro };
  }
  if (opts.silencioso) marcarWaIdProcessado(r.waId);
  else addMensagem({ leadId: lead.id, autor, texto: legenda, midias, waId: r.waId });
  await sleep(900);
  return { ok: true };
}

/**
 * Destino de aviso interno: número (55DDDNÚMERO) ou JID de grupo do WhatsApp (…@g.us, só Evolution).
 * Devolve '' quando o valor não é utilizável.
 */
export function destinoAviso(raw: string): string {
  const v = (raw || '').trim();
  if (/^[0-9-]{10,40}@g\.us$/.test(v)) return v;
  const d = v.replace(/\D/g, '');
  return d.length >= 10 && d.length <= 15 ? d : '';
}

/** Envia texto direto para um telefone/grupo que não é lead (aviso interno à loja). */
export async function enviarAvisoInterno(telefone: string, texto: string): Promise<boolean> {
  const destino = destinoAviso(telefone);
  if (!destino) return false;
  const r = await enviarTextoWa(destino, texto);
  if (!r.ok) console.error(`[aviso-interno] falha para ${destino}: ${r.erro}`);
  return r.ok;
}

export function marcarProximoFollowup(lead: Lead): void {
  const s = getSettings();
  if (!s.followupsAtivos || lead.humano || lead.status === 'optout') {
    updateLead(lead.id, { proximoFollowupEm: null });
    return;
  }
  const idx = lead.followupsEnviados;
  const horas = s.followupHoras[idx];
  // sem follow-up para quem pediu espaço, nunca respondeu ou já esgotou o limite (respeito.ts)
  if (idx >= s.maxFollowups || horas === undefined || lead.naoPerturbar || (lead.followupsTotal ?? 0) >= MAX_FOLLOWUPS_TOTAL || lead.totalMensagensLead < 1) {
    updateLead(lead.id, { proximoFollowupEm: null });
    return;
  }
  // nunca dois follow-ups em menos de 20 h, mesmo que o cliente converse no meio (era o "ciclo de 2 em 2 horas")
  let quando = Date.now() + horas * 3600_000;
  if (lead.ultimoFollowupEm) quando = Math.max(quando, Date.parse(lead.ultimoFollowupEm) + INTERVALO_MIN_FOLLOWUP_MS);
  updateLead(lead.id, { proximoFollowupEm: new Date(quando).toISOString() });
}
