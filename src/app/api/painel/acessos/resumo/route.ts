import { NextRequest, NextResponse } from 'next/server';
import { montarResumo } from '@/lib/acessos/agregar';
import { bancoAcessosAtivo } from '@/lib/acessos/store';
import { PERIODOS, type Periodo } from '@/lib/acessos/tipos';
import { exigirApi } from '@/lib/painel';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Visão geral dos acessos (somente admin): KPIs, funil, canais, campanhas, carros, público e ao vivo. */
export async function GET(req: NextRequest) {
  const a = await exigirApi(req, 'admin');
  if ('erro' in a) return a.erro;
  const p = req.nextUrl.searchParams.get('periodo') as Periodo;
  const periodo: Periodo = PERIODOS.some(([v]) => v === p) ? p : 'hoje';
  return NextResponse.json(
    { ...montarResumo(periodo), banco: bancoAcessosAtivo() },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
