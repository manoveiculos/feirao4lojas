import { createHmac, timingSafeEqual } from 'node:crypto';
import { after, NextRequest, NextResponse } from 'next/server';
import { processarEntrada } from '@/lib/agent/inbound';
import { parseWebhook } from '@/lib/whatsapp/provider';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function igual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

/** Verificação do webhook da Meta Cloud API. */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const token = process.env.META_VERIFY_TOKEN;
  if (token && sp.get('hub.mode') === 'subscribe' && igual(sp.get('hub.verify_token') || '', token)) {
    return new NextResponse(sp.get('hub.challenge') || '', { status: 200 });
  }
  return NextResponse.json({ erro: 'forbidden' }, { status: 403 });
}

export async function POST(req: NextRequest) {
  const raw = await req.text();
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ erro: 'json inválido' }, { status: 400 });
  }

  const ehMeta = (body as { object?: string })?.object === 'whatsapp_business_account';

  if (ehMeta) {
    const appSecret = process.env.META_APP_SECRET;
    const assinatura = (req.headers.get('x-hub-signature-256') || '').replace(/^sha256=/, '');
    const esperado = appSecret ? createHmac('sha256', appSecret).update(raw).digest('hex') : '';
    if (!appSecret || !assinatura || !igual(assinatura, esperado)) {
      return NextResponse.json({ erro: 'assinatura inválida' }, { status: 401 });
    }
  } else {
    const secret = process.env.WEBHOOK_SECRET;
    const enviado =
      req.nextUrl.searchParams.get('secret') ||
      req.headers.get('x-webhook-secret') ||
      req.headers.get('apikey') ||
      '';
    if (!secret || !igual(enviado, secret)) {
      return NextResponse.json({ erro: 'não autorizado' }, { status: 401 });
    }
  }

  const entradas = parseWebhook(body);

  // Responde 200 na hora; o processamento (e a resposta do agente) segue em segundo plano.
  after(async () => {
    const pendentes: Promise<void>[] = [];
    for (const e of entradas) {
      try {
        await processarEntrada(e, (fn) => {
          pendentes.push(fn().catch((err) => console.error('[webhook] agente', err)));
        });
      } catch (err) {
        console.error('[webhook] falha ao processar entrada', err);
      }
    }
    await Promise.all(pendentes);
  });

  return NextResponse.json({ ok: true, recebidas: entradas.length });
}
