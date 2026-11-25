import { NextRequest, NextResponse } from 'next/server';
import { exigirApi, leadAcessivel } from '@/lib/painel';
import { caminhoMidia, lerMidia } from '@/lib/whatsapp/midia';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Foto/áudio enviados pelo cliente. Só para quem pode ver a conversa (admin ou a loja responsável). */
export async function GET(req: NextRequest) {
  const a = await exigirApi(req);
  if ('erro' in a) return a.erro;
  const ref = req.nextUrl.searchParams.get('f') || '';
  const c = caminhoMidia(ref);
  if (!c || !leadAcessivel(a.sessao, c.leadId)) return NextResponse.json({ erro: 'não encontrado' }, { status: 404 });
  const m = lerMidia(ref);
  if (!m) return NextResponse.json({ erro: 'mídia não encontrada' }, { status: 404 });
  return new NextResponse(new Uint8Array(m.buf), {
    headers: { 'Content-Type': m.mime, 'Cache-Control': 'private, max-age=3600', 'X-Content-Type-Options': 'nosniff' },
  });
}
