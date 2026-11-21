import { jsonOk, optionsResponse } from '@/lib/api-helpers';
import { loadEstoque } from '@/lib/estoque';

export async function OPTIONS() {
  return optionsResponse();
}

export async function GET() {
  const db = loadEstoque();
  return jsonOk({
    atualizadoEm: db.metadata.atualizadoEm,
    totalVeiculos: db.metadata.totalVeiculos,
    lojas: db.lojas.map((loja) => ({
      ...loja,
      totalVeiculos: db.metadata.porLoja[loja.slug] || 0,
    })),
  });
}
