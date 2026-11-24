import { FEIRAO_CONFIG } from '../config';
import { addMensagem, getSettings, updateLead } from '../db/store';
import type { Lead, MensagemAutor } from '../db/types';
import { digitandoWa, enviarImagemWa, enviarTextoWa } from './provider';

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Hosts de foto permitidos no proxy (evita SSRF). */
export const FOTO_HOSTS = new Set(['fotos.altovaleveiculos.com.br', 's3.amazonaws.com']);

/**
 * WhatsApp não aceita .webp como foto: servimos JPEG convertido pelo proxy do próprio site.
 */
export function urlFotoWhatsapp(origem: string): string {
  return `${FEIRAO_CONFIG.siteUrl}/api/media/foto?u=${encodeURIComponent(origem)}`;
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
}

export async function enviarTexto(
  lead: Lead,
  texto: string,
  opts: OpcoesEnvio = {}
): Promise<{ ok: boolean; erro?: string }> {
  const autor = opts.autor ?? 'agente';
  const limpo = texto.trim();
  if (!limpo) return { ok: true };

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
  const url = urlFotoWhatsapp(fotoOrigem);

  if (opts.simulado) {
    addMensagem({ leadId: lead.id, autor, texto: legenda, midias: [fotoOrigem], waId: '' });
    return { ok: true };
  }

  const r = await enviarImagemWa(lead.telefone, url, legenda);
  if (!r.ok) {
    console.error(`[outbound] falha ao enviar imagem para ${lead.telefone}: ${r.erro}`);
    return { ok: false, erro: r.erro };
  }
  addMensagem({ leadId: lead.id, autor, texto: legenda, midias: [fotoOrigem], waId: r.waId });
  await sleep(900);
  return { ok: true };
}

/** Envia texto direto para um telefone que não é lead (aviso interno à loja). */
export async function enviarAvisoInterno(telefone: string, texto: string): Promise<boolean> {
  if (!telefone) return false;
  const r = await enviarTextoWa(telefone.replace(/\D/g, ''), texto);
  if (!r.ok) console.error(`[aviso-interno] falha para ${telefone}: ${r.erro}`);
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
  if (idx >= s.maxFollowups || horas === undefined) {
    updateLead(lead.id, { proximoFollowupEm: null });
    return;
  }
  updateLead(lead.id, {
    proximoFollowupEm: new Date(Date.now() + horas * 3600_000).toISOString(),
  });
}
