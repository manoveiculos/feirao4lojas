import { NextRequest, NextResponse } from 'next/server';
import { carregarAds, PERIODOS, type Periodo } from '@/lib/ads/insights';
import { exigirApi } from '@/lib/painel';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  // lojas também veem as campanhas (somente leitura; números gerais da campanha)
  const a = await exigirApi(req);
  if ('erro' in a) return a.erro;
  const p = req.nextUrl.searchParams.get('periodo') as Periodo;
  const periodo: Periodo = PERIODOS.includes(p) ? p : 'last_7d';
  return NextResponse.json(await carregarAds(periodo), { headers: { 'Cache-Control': 'no-store' } });
}
