import { NextRequest, NextResponse } from 'next/server';
import { escopoDe, exigirApi } from '@/lib/painel';
import { calcularStats } from '@/lib/stats';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const a = await exigirApi(req);
  if ('erro' in a) return a.erro;
  return NextResponse.json(calcularStats(escopoDe(a.sessao)), { headers: { 'Cache-Control': 'no-store' } });
}
