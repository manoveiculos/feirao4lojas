import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { executarTick } from '@/lib/agent/followup';
import { sincronizarEstoque } from '@/lib/sync-job';
import { loadEstoque } from '@/lib/estoque';
import { verificarEsperaNoTick } from '@/lib/espera/espera';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function autorizado(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const enviado = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || req.nextUrl.searchParams.get('token') || '';
  const a = Buffer.from(enviado);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Follow-ups, lembretes de visita e sync horário do estoque. Chame a cada minuto. */
async function handler(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ erro: 'não autorizado' }, { status: 401 });
  const resultado = await executarTick();
  let sync: unknown = null;
  const idade = Date.now() - Date.parse(loadEstoque().metadata.atualizadoEm);
  if (idade > 55 * 60_000) sync = await sincronizarEstoque().catch((e) => ({ status: 'erro', erro: String(e) }));
  const espera = await verificarEsperaNoTick().catch((e) => ({ status: 'erro', erro: String(e) }));
  return NextResponse.json({ ok: true, ...resultado, sync, espera });
}

export const GET = handler;
export const POST = handler;
