import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';
import { FOTO_HOSTS } from '@/lib/whatsapp/outbound';

export const runtime = 'nodejs';

/**
 * Converte as fotos do estoque (.webp) para JPEG: WhatsApp e vários placements
 * da Meta não aceitam WebP como imagem. Só aceita os hosts de foto do estoque.
 */
export async function GET(req: NextRequest) {
  const u = req.nextUrl.searchParams.get('u') || '';
  let alvo: URL;
  try {
    alvo = new URL(u);
  } catch {
    return NextResponse.json({ erro: 'url inválida' }, { status: 400 });
  }
  if (alvo.protocol !== 'https:' || !FOTO_HOSTS.has(alvo.hostname)) {
    return NextResponse.json({ erro: 'host não permitido' }, { status: 400 });
  }

  const res = await fetch(alvo, { signal: AbortSignal.timeout(15_000) }).catch(() => null);
  if (!res?.ok) return NextResponse.json({ erro: 'foto indisponível' }, { status: 502 });

  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > 12_000_000) return NextResponse.json({ erro: 'arquivo grande demais' }, { status: 413 });

  try {
    const jpeg = await sharp(buf).rotate().resize({ width: 1200, withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer();
    return new NextResponse(new Uint8Array(jpeg), {
      headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=86400, immutable' },
    });
  } catch {
    return NextResponse.json({ erro: 'formato não suportado' }, { status: 415 });
  }
}
