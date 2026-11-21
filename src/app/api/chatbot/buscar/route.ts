import { NextRequest } from 'next/server';
import {
  jsonOk,
  optionsResponse,
  parseNumberParam,
} from '@/lib/api-helpers';
import { FEIRAO_CONFIG } from '@/lib/config';
import {
  filterVeiculos,
  formatVeiculoParaWhatsapp,
  loadEstoque,
} from '@/lib/estoque';
import type { FiltroVeiculos } from '@/lib/types';

export async function OPTIONS() {
  return optionsResponse();
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const db = loadEstoque();

  const codigo = searchParams.get('codigo')?.trim();
  if (codigo) {
    const found = db.veiculos.find(
      (v) =>
        v.codigo.toLowerCase() === codigo.toLowerCase() ||
        v.id.toLowerCase() === codigo.toLowerCase()
    );
    if (!found) {
      return jsonOk({
        encontrados: 0,
        exibidos: 0,
        veiculos: [],
        mensagemProntaWhatsapp: `Não encontrei nenhum veículo com o código *${codigo}* no estoque atual do ${FEIRAO_CONFIG.nome}. Posso buscar por marca, modelo ou faixa de valor para você!`,
      });
    }
    return jsonOk({
      encontrados: 1,
      exibidos: 1,
      veiculos: [
        {
          ...found,
          textoWhatsapp: formatVeiculoParaWhatsapp(found),
        },
      ],
      mensagemProntaWhatsapp: formatVeiculoParaWhatsapp(found),
    });
  }

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
      searchParams.get('orcamento') || searchParams.get('precoMax')
    ),
    anoMin: parseNumberParam(searchParams.get('anoMin')),
    anoMax: parseNumberParam(searchParams.get('anoMax')),
    kmMax: parseNumberParam(searchParams.get('kmMax')),
    ordenar:
      (searchParams.get('ordenar') as FiltroVeiculos['ordenar']) || 'preco_asc',
  };

  const filtrados = filterVeiculos(db.veiculos, filtros);
  const limit = Math.min(50, Math.max(1, parseNumberParam(searchParams.get('limit')) || 5));
  const selecionados = filtrados.slice(0, limit);

  let mensagemProntaWhatsapp: string;
  if (selecionados.length === 0) {
    mensagemProntaWhatsapp = `No momento não encontrei veículos exatamente com esses filtros no *${FEIRAO_CONFIG.nome}* (${db.metadata.totalVeiculos} carros em estoque). Quer que eu busque opções parecidas ou outra faixa de valor?`;
  } else {
    const cabecalho =
      filtrados.length > selecionados.length
        ? `Encontrei *${filtrados.length} opções* no *${FEIRAO_CONFIG.nome}*! Aqui estão as *${selecionados.length} principais*:\n`
        : `Encontrei *${filtrados.length} ${filtrados.length === 1 ? 'opção' : 'opções'}* no *${FEIRAO_CONFIG.nome}*:\n`;

    const lista = selecionados
      .map(
        (v, idx) =>
          `${idx + 1}. *${v.titulo}* (${v.anoTexto})\n` +
          `   💰 ${v.precoFormatado} | 🛣️ ${v.kmFormatado} | ⚙️ ${v.cambio}\n` +
          `   🏪 ${v.lojaNome} | 🔖 Cód: ${v.codigo}`
      )
      .join('\n\n');

    const rodape = `\n\nMe diga o *código* ou o *modelo* de algum deles que eu te mando todas as fotos, opcionais e simulação!`;
    mensagemProntaWhatsapp = `${cabecalho}\n${lista}${rodape}`;
  }

  return jsonOk({
    atualizadoEm: db.metadata.atualizadoEm,
    encontrados: filtrados.length,
    exibidos: selecionados.length,
    veiculos: selecionados.map((v) => ({
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
      lojaNome: v.lojaNome,
      lojaSlug: v.lojaSlug,
      descricao: v.descricao,
      opcionais: v.opcionais,
      fotoCapa: v.fotoCapa,
      fotos: v.fotos,
      urlOriginal: v.urlOriginal,
      textoWhatsapp: formatVeiculoParaWhatsapp(v),
    })),
    mensagemProntaWhatsapp,
  });
}
