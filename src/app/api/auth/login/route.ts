import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { COOKIE, criarToken, limitarLogin, limparFalhas, registrarFalha, validarCredenciais } from '@/lib/auth';

export const runtime = 'nodejs';

const schema = z.object({ usuario: z.string().max(60), senha: z.string().max(200) });

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
  if (!limitarLogin(ip)) {
    return NextResponse.json({ erro: 'Muitas tentativas. Aguarde alguns minutos.' }, { status: 429 });
  }
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ erro: 'Dados inválidos.' }, { status: 400 });

  let cred;
  try {
    cred = validarCredenciais(parsed.data.usuario, parsed.data.senha);
  } catch {
    return NextResponse.json({ erro: 'Servidor sem AUTH_SECRET configurado.' }, { status: 500 });
  }
  if (!cred) {
    registrarFalha(ip);
    return NextResponse.json({ erro: 'Usuário ou senha incorretos.' }, { status: 401 });
  }
  limparFalhas(ip);

  const token = await criarToken(cred.papel, cred.loja);
  const res = NextResponse.json({
    ok: true,
    destino: cred.papel === 'admin' ? '/admin' : `/loja/${cred.loja}`,
  });
  res.cookies.set(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 12 * 3600,
  });
  return res;
}
