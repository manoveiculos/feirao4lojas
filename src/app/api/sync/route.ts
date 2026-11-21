import { NextRequest } from 'next/server';
import { jsonError, jsonOk, optionsResponse } from '@/lib/api-helpers';
import { loadEstoque, saveEstoque } from '@/lib/estoque';
import { syncAllStores } from '@/lib/scraper';

export async function OPTIONS() {
  return optionsResponse();
}

export async function GET() {
  const db = loadEstoque();
  return jsonOk({
    status: 'ok',
    metadata: db.metadata,
  });
}

export async function POST(request: NextRequest) {
  const secret = process.env.SYNC_SECRET;
  if (secret) {
    const authHeader = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
    const tokenHeader = request.headers.get('x-sync-token');
    const tokenQuery = request.nextUrl.searchParams.get('token');
    const provided = authHeader || tokenHeader || tokenQuery;

    if (provided !== secret) {
      return jsonError('Token de sincronização inválido ou ausente.', 401);
    }
  }

  const start = Date.now();
  const db = await syncAllStores();
  saveEstoque(db);
  const duracaoSegundos = Number(((Date.now() - start) / 1000).toFixed(1));

  return jsonOk({
    status: 'sincronizado',
    duracaoSegundos,
    metadata: db.metadata,
  });
}
