import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { baixarMidiaWa, type MidiaFonte } from './provider';

/**
 * Mídia recebida do cliente (foto e áudio):
 * - foto: reduzida para no máx. 1024 px (JPEG) e entregue ao Claude, que enxerga imagens;
 * - áudio: transcrito pela OpenAI (OPENAI_API_KEY) na chegada; o agente responde ao texto.
 * Arquivos ficam em DATA_DIR/midia/<lead>/ e aparecem no painel em /api/painel/midia.
 * Referência gravada na mensagem: "midia:<leadId>/<arquivo>".
 */

const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(process.cwd(), 'data', 'runtime');
const PASTA = path.join(DATA_DIR, 'midia');
const MAX_BYTES = 16 * 1024 * 1024;

const EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'audio/ogg': 'ogg',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/aac': 'aac',
  'audio/amr': 'amr',
};
const MIME_POR_EXT: Record<string, string> = Object.fromEntries(Object.entries(EXT).map(([m, e]) => [e, m]));

const seguro = (s: string) => s.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80) || 'x';

export function caminhoMidia(ref: string): { arquivo: string; mime: string; leadId: string } | null {
  const m = ref.match(/^midia:([a-f0-9-]{36})\/([a-zA-Z0-9_-]+\.([a-z0-9]{2,4}))$/);
  if (!m) return null;
  const arquivo = path.join(PASTA, m[1], m[2]);
  if (!arquivo.startsWith(PASTA)) return null;
  return { arquivo, mime: MIME_POR_EXT[m[3]] ?? 'application/octet-stream', leadId: m[1] };
}

export function lerMidia(ref: string): { buf: Buffer; mime: string } | null {
  const c = caminhoMidia(ref);
  if (!c || !fs.existsSync(c.arquivo)) return null;
  return { buf: fs.readFileSync(c.arquivo), mime: c.mime };
}

function salvar(leadId: string, nome: string, buf: Buffer, mime: string): string {
  const ext = EXT[mime.split(';')[0].trim()] ?? (mime.startsWith('audio/') ? 'ogg' : 'jpg');
  const dir = path.join(PASTA, seguro(leadId));
  fs.mkdirSync(dir, { recursive: true });
  const arquivo = `${seguro(nome)}.${ext}`;
  fs.writeFileSync(path.join(dir, arquivo), buf);
  return `midia:${leadId}/${arquivo}`;
}

/** Transcreve áudio em português (OpenAI). Sem chave ou em caso de erro, devolve null. */
export async function transcreverAudio(buf: Buffer, mime: string): Promise<string | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  try {
    const form = new FormData();
    const ext = EXT[mime.split(';')[0].trim()] ?? 'ogg';
    form.append('file', new Blob([new Uint8Array(buf)], { type: mime.split(';')[0] }), `audio.${ext}`);
    form.append('model', process.env.OPENAI_TRANSCRIBE_MODEL || 'gpt-4o-mini-transcribe');
    form.append('language', 'pt');
    const r = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}` },
      body: form,
      signal: AbortSignal.timeout(60_000),
    });
    const j = (await r.json().catch(() => ({}))) as { text?: string; error?: { message?: string } };
    if (!r.ok) {
      console.error(`[audio] transcrição falhou: HTTP ${r.status} ${j.error?.message ?? ''}`);
      return null;
    }
    return (j.text || '').trim() || null;
  } catch (e) {
    console.error('[audio] transcrição falhou:', e instanceof Error ? e.message : e);
    return null;
  }
}

export interface MidiaProcessada {
  /** Referência para guardar em Mensagem.midias (painel e agente) */
  ref: string | null;
  /** Texto que entra na conversa no lugar da mídia */
  texto: string;
}

/**
 * Baixa, guarda e interpreta a mídia. Nunca lança: em falha, devolve o marcador
 * "[imagem]"/"[áudio]" de antes e o agente pede para o cliente escrever.
 */
export async function processarMidiaRecebida(
  leadId: string,
  waId: string,
  tipo: 'imagem' | 'audio',
  fonte: MidiaFonte,
  legenda: string
): Promise<MidiaProcessada> {
  const marcador = tipo === 'audio' ? '[áudio]' : '[imagem]';
  const fallback = { ref: null, texto: [marcador, legenda].filter(Boolean).join(' ') };
  const baixado = await baixarMidiaWa(fonte);
  if (!baixado || baixado.buf.length > MAX_BYTES) return fallback;
  const nome = waId || `m${Date.now()}`;

  if (tipo === 'imagem') {
    try {
      const jpg = await sharp(baixado.buf).rotate().resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer();
      return { ref: salvar(leadId, nome, jpg, 'image/jpeg'), texto: [marcador, legenda].filter(Boolean).join(' ') };
    } catch {
      return fallback;
    }
  }

  const ref = salvar(leadId, nome, baixado.buf, baixado.mime);
  const transcricao = await transcreverAudio(baixado.buf, baixado.mime);
  return { ref, texto: transcricao ? `🎤 (áudio transcrito) ${transcricao}` : '[áudio]' };
}

/** Imagem guardada pronta para o Claude (base64 JPEG). */
export function imagemParaClaude(ref: string): { media_type: 'image/jpeg' | 'image/png' | 'image/webp'; data: string } | null {
  const m = lerMidia(ref);
  if (!m || !m.mime.startsWith('image/')) return null;
  const media_type = (['image/jpeg', 'image/png', 'image/webp'].includes(m.mime) ? m.mime : 'image/jpeg') as 'image/jpeg';
  return { media_type, data: m.buf.toString('base64') };
}
