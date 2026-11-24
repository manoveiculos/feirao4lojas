import { NextRequest, NextResponse } from 'next/server';
import { exigirApi } from '@/lib/painel';
import { sincronizarEstoque } from '@/lib/sync-job';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const a = await exigirApi(req, 'admin');
  if ('erro' in a) return a.erro;
  return NextResponse.json(await sincronizarEstoque());
}
