import { NextRequest } from 'next/server';
import { jsonError, jsonOk, optionsResponse } from '@/lib/api-helpers';
import { loadEstoque, saveEstoque } from '@/lib/estoque';
import { mergeAndNormalizeSync } from '@/lib/normalize';
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
  const previousDb = loadEstoque();
  const freshDb = await syncAllStores();
  const { db, diff } = mergeAndNormalizeSync(
    previousDb.veiculos.length > 0 ? previousDb : null,
    freshDb
  );

  if (diff.houveMudanca) {
    saveEstoque(db);
  }

  const duracaoSegundos = Number(((Date.now() - start) / 1000).toFixed(1));

  return jsonOk({
    status: diff.houveMudanca ? 'sincronizado' : 'sem_alteracoes',
    duracaoSegundos,
    resumo: {
      novos: diff.adicionados.length,
      vendidosOuRemovidos: diff.removidos.length,
      precosAlterados: diff.precoAlterado.length,
      lojasEmFallback: diff.lojasEmFallback,
    },
    metadata: db.metadata,
  });
}
