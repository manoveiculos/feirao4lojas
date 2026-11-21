import { jsonOk, optionsResponse } from '@/lib/api-helpers';
import { FEIRAO_CONFIG } from '@/lib/config';
import { getEstoqueFacets, loadEstoque } from '@/lib/estoque';
import { formatPrice } from '@/lib/scraper';

export async function OPTIONS() {
  return optionsResponse();
}

export async function GET() {
  const db = loadEstoque();
  const facets = getEstoqueFacets(db.veiculos);

  const lojas = db.lojas.map((l) => ({
    slug: l.slug,
    nome: l.nome,
    cidade: l.cidade,
    endereco: l.endereco,
    totalVeiculos: db.metadata.porLoja[l.slug] || 0,
  }));

  const catalogoCompacto = db.veiculos.map((v) => ({
    codigo: v.codigo,
    id: v.id,
    titulo: v.titulo,
    marca: v.marca,
    modelo: v.modelo,
    ano: v.anoTexto,
    preco: v.preco,
    precoFormatado: v.precoFormatado,
    km: v.kmFormatado,
    cambio: v.cambio,
    combustivel: v.combustivel,
    cor: v.cor,
    categoria: v.categoria,
    loja: v.lojaNome,
    fotoCapa: v.fotoCapa,
  }));

  const resumoTexto = [
    `${FEIRAO_CONFIG.nome} (${FEIRAO_CONFIG.cidade})`,
    `Total de veículos disponíveis: ${db.metadata.totalVeiculos} carros distribuídos em 4 lojas parceiras.`,
    `Lojas participantes: ${lojas.map((l) => `${l.nome} (${l.totalVeiculos} veículos)`).join(', ')}.`,
    `Faixa de preço: de ${formatPrice(facets.faixaPreco.min)} até ${formatPrice(facets.faixaPreco.max)}.`,
    `Principais marcas: ${facets.marcas.slice(0, 10).map((m) => `${m.nome} (${m.quantidade})`).join(', ')}.`,
    `Categorias disponíveis: ${facets.categorias.map((c) => `${c.nome} (${c.quantidade})`).join(', ')}.`,
  ].join('\n');

  return jsonOk({
    feirao: FEIRAO_CONFIG.nome,
    cidade: FEIRAO_CONFIG.cidade,
    atualizadoEm: db.metadata.atualizadoEm,
    totalVeiculos: db.metadata.totalVeiculos,
    lojas,
    faixaPreco: {
      min: facets.faixaPreco.min,
      max: facets.faixaPreco.max,
      minFormatado: formatPrice(facets.faixaPreco.min),
      maxFormatado: formatPrice(facets.faixaPreco.max),
    },
    marcas: facets.marcas,
    categorias: facets.categorias,
    combustiveis: facets.combustiveis,
    cambios: facets.cambios,
    resumoTexto,
    catalogoCompacto,
  });
}
