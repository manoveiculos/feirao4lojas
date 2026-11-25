import { NextResponse, type NextRequest } from 'next/server';

/**
 * Repassa o caminho pedido para o layout do /admin (layouts não recebem searchParams).
 * Usado para levar a loja do link do aviso (/admin/conversas?lead=ID) ao painel dela
 * e para voltar ao link depois do login. Não faz autenticação: isso é do layout.
 */
export function middleware(req: NextRequest) {
  const headers = new Headers(req.headers);
  headers.set('x-av3-url', `${req.nextUrl.pathname}${req.nextUrl.search}`);
  return NextResponse.next({ request: { headers } });
}

export const config = { matcher: ['/admin/:path*', '/admin'] };
