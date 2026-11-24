import { NextRequest } from 'next/server';
import { jsonError, jsonOk, optionsResponse } from '@/lib/api-helpers';
import {
  buildVehicleWhatsappMessage,
  buildWhatsappUrl,
  LOJAS_BY_SLUG,
} from '@/lib/config';
import { formatVeiculoParaWhatsapp, loadEstoque } from '@/lib/estoque';

export async function OPTIONS() {
  return optionsResponse();
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const lookup = decodeURIComponent(id).trim().toLowerCase();
  const db = loadEstoque();

  const veiculo = db.veiculos.find(
    (v) =>
      v.id.toLowerCase() === lookup ||
      v.codigo.toLowerCase() === lookup
  );

  if (!veiculo) {
    return jsonError(`Veículo "${id}" não encontrado no estoque do feirão.`, 404);
  }

  const loja = LOJAS_BY_SLUG[veiculo.lojaSlug];

  return jsonOk({
    veiculo,
    loja,
    textoWhatsapp: formatVeiculoParaWhatsapp(veiculo),
    linkWhatsappFeirao: buildWhatsappUrl(buildVehicleWhatsappMessage(veiculo)),
  });
}
