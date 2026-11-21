import { NextRequest } from 'next/server';
import {
  jsonOk,
  optionsResponse,
  parseNumberParam,
} from '@/lib/api-helpers';
import { FEIRAO_CONFIG } from '@/lib/config';
import { filterVeiculos, loadEstoque } from '@/lib/estoque';
import type { FiltroVeiculos } from '@/lib/types';

export async function OPTIONS() {
  return optionsResponse();
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const db = loadEstoque();

  const filtros: FiltroVeiculos = {
    q: searchParams.get('q') || undefined,
    loja: searchParams.get('loja') || undefined,
    marca: searchParams.get('marca') || undefined,
    modelo: searchParams.get('modelo') || undefined,
    categoria: searchParams.get('categoria') || undefined,
    cambio: searchParams.get('cambio') || undefined,
    combustivel: searchParams.get('combustivel') || undefined,
    precoMin: parseNumberParam(searchParams.get('precoMin')),
    precoMax: parseNumberParam(
      searchParams.get('precoMax') || searchParams.get('orcamento')
    ),
    anoMin: parseNumberParam(searchParams.get('anoMin')),
    anoMax: parseNumberParam(searchParams.get('anoMax')),
    kmMax: parseNumberParam(searchParams.get('kmMax')),
    ordenar:
      (searchParams.get('ordenar') as FiltroVeiculos['ordenar']) || 'destaque',
  };

  const filtrados = filterVeiculos(db.veiculos, filtros);

  const page = Math.max(1, parseNumberParam(searchParams.get('page')) || 1);
  const limitParam = parseNumberParam(searchParams.get('limit'));
  const limit = limitParam ? Math.min(200, Math.max(1, limitParam)) : filtrados.length || 100;
  const start = (page - 1) * limit;
  const paginados = filtrados.slice(start, start + limit);

  const compacto = searchParams.get('formato') === 'compacto';

  const veiculos = compacto
    ? paginados.map((v) => ({
        id: v.id,
        codigo: v.codigo,
        titulo: v.titulo,
        marca: v.marca,
        modelo: v.modelo,
        ano: v.anoTexto,
        preco: v.preco,
        precoFormatado: v.precoFormatado,
        km: v.km,
        kmFormatado: v.kmFormatado,
        cambio: v.cambio,
        combustivel: v.combustivel,
        cor: v.cor,
        categoria: v.categoria,
        lojaSlug: v.lojaSlug,
        lojaNome: v.lojaNome,
        fotoCapa: v.fotoCapa,
        totalFotos: v.fotos.length,
        endpointDetalhes: `${FEIRAO_CONFIG.siteUrl}/api/veiculos/${v.codigo}`,
      }))
    : paginados;

  return jsonOk({
    feirao: FEIRAO_CONFIG.nome,
    cidade: FEIRAO_CONFIG.cidade,
    atualizadoEm: db.metadata.atualizadoEm,
    totalEstoqueGeral: db.metadata.totalVeiculos,
    totalEncontrado: filtrados.length,
    pagina: page,
    porPagina: limit,
    totalPaginas: Math.max(1, Math.ceil(filtrados.length / limit)),
    veiculos,
  });
}
