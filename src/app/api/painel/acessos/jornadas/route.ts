import { NextRequest, NextResponse } from 'next/server';
import { montarJornadas } from '@/lib/acessos/agregar';
import { CANAIS, PERIODOS, type Canal, type Periodo } from '@/lib/acessos/tipos';
import { exigirApi, visibilidadeDeLeads } from '@/lib/painel';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** O que cada visitante fez no site, passo a passo (somente admin). */
export async function GET(req: NextRequest) {
  const a = await exigirApi(req);
  if ('erro' in a) return a.erro;
  const sp = req.nextUrl.searchParams;
  const p = sp.get('periodo') as Periodo;
  const periodo: Periodo = PERIODOS.some(([v]) => v === p) ? p : 'hoje';
  const c = sp.get('canal') as Canal;
  const canal = CANAIS.includes(c) ? c : null;
  return NextResponse.json(
    { periodo, jornadas: montarJornadas(periodo, { canal, limite: 100 }, Date.now(), visibilidadeDeLeads(a.sessao)) },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
