import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { NextRequest } from 'next/server';
import { LOJAS } from './config';
import type { LojaSigla, LojaSlug } from './types';

export type Papel = 'admin' | 'loja';

export interface Sessao {
  papel: Papel;
  loja: LojaSlug | null;
  exp: number;
}

export const COOKIE = 'av3_sessao';
const DURACAO_MS = 12 * 3600_000;

function secret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 16) {
    throw new Error('AUTH_SECRET ausente ou curto demais (mínimo 16 caracteres).');
  }
  return s;
}

const enc = new TextEncoder();

function b64url(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  return Buffer.from(bytes).toString('base64url');
}

async function hmac(data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  return b64url(await crypto.subtle.sign('HMAC', key, enc.encode(data)));
}

function igual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export async function criarToken(papel: Papel, loja: LojaSlug | null): Promise<string> {
  const payload: Sessao = { papel, loja, exp: Date.now() + DURACAO_MS };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${await hmac(body)}`;
}

export async function lerToken(token: string | undefined): Promise<Sessao | null> {
  if (!token) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  if (!igual(sig, await hmac(body))) return null;
  try {
    const s = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as Sessao;
    return s.exp > Date.now() ? s : null;
  } catch {
    return null;
  }
}

/** Valida credenciais contra variáveis de ambiente. */
export function validarCredenciais(
  usuario: string,
  senha: string
): { papel: Papel; loja: LojaSlug | null } | null {
  const u = usuario.trim().toLowerCase();
  if (!senha) return null;

  if (u === 'admin') {
    const esperado = process.env.ADMIN_PASSWORD;
    return esperado && igual(senha, esperado) ? { papel: 'admin', loja: null } : null;
  }

  const loja = LOJAS.find((l) => l.slug === u || l.sigla.toLowerCase() === u);
  if (!loja) return null;
  const esperado = process.env[`LOJA_PASSWORD_${loja.sigla}` as `LOJA_PASSWORD_${LojaSigla}`];
  return esperado && igual(senha, esperado) ? { papel: 'loja', loja: loja.slug } : null;
}

/** Para route handlers. */
export async function sessaoDaRequest(req: NextRequest): Promise<Sessao | null> {
  return lerToken(req.cookies.get(COOKIE)?.value);
}

/** Para server components/layouts: redireciona se não autenticado. */
export async function exigirSessao(papel?: Papel, loja?: LojaSlug): Promise<Sessao> {
  const store = await cookies();
  const s = await lerToken(store.get(COOKIE)?.value);
  if (!s) redirect('/login');
  if (papel && s.papel !== papel) {
    redirect(s.papel === 'loja' && s.loja ? `/loja/${s.loja}` : '/login');
  }
  if (loja && s.papel === 'loja' && s.loja !== loja) redirect(`/loja/${s.loja}`);
  return s;
}

// Rate limit simples em memória para o login
const tentativas = new Map<string, { n: number; ate: number }>();

export function limitarLogin(ip: string): boolean {
  const agora = Date.now();
  const t = tentativas.get(ip);
  if (t && t.ate > agora && t.n >= 8) return false;
  return true;
}

export function registrarFalha(ip: string): void {
  const agora = Date.now();
  const t = tentativas.get(ip);
  if (!t || t.ate < agora) tentativas.set(ip, { n: 1, ate: agora + 10 * 60_000 });
  else t.n += 1;
}

export function limparFalhas(ip: string): void {
  tentativas.delete(ip);
}
