import { NextRequest, NextResponse } from 'next/server';
import { FEIRAO_CONFIG } from '@/lib/config';
import { loadEstoque } from '@/lib/estoque';
import {
  chaveFeedValida,
  descricaoVeiculo,
  fotoJpeg,
  linkVeiculo,
  rotulos,
  veiculosDoFeed,
  xmlEsc as e,
} from '@/lib/feed';
import type { Veiculo } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Catálogo de COMÉRCIO (padrão, igual ao catálogo atual da Manos): RSS 2.0 com campos g:. */
function itemComercio(v: Veiculo): string {
  const [l0, l1, l2, l3, l4] = rotulos(v);
  const extras = v.fotos
    .slice(1, 11)
    .map((f) => `      <g:additional_image_link>${e(fotoJpeg(f))}</g:additional_image_link>`)
    .join('\n');
  return `    <item>
      <g:id>${e(v.codigo)}</g:id>
      <g:title>${e(`${v.titulo} ${v.anoTexto}`.slice(0, 150))}</g:title>
      <g:description>${e(descricaoVeiculo(v))}</g:description>
      <g:link>${e(linkVeiculo(v))}</g:link>
      <g:image_link>${e(fotoJpeg(v.fotoCapa))}</g:image_link>
${extras}
      <g:availability>in stock</g:availability>
      <g:condition>used</g:condition>
      <g:price>${(v.preco as number).toFixed(2)} BRL</g:price>
      <g:brand>${e(v.marca)}</g:brand>
      <g:google_product_category>${v.categoria === 'Moto' ? '919' : '916'}</g:google_product_category>
      <g:product_type>${e(`Veículos > ${v.categoria} > ${v.marca}`)}</g:product_type>
      <g:custom_label_0>${e(l0)}</g:custom_label_0>
      <g:custom_label_1>${e(l1)}</g:custom_label_1>
      <g:custom_label_2>${e(l2)}</g:custom_label_2>
      <g:custom_label_3>${e(l3)}</g:custom_label_3>
      <g:custom_label_4>${e(l4)}</g:custom_label_4>
    </item>`;
}

const BODY_STYLE: Record<string, string> = {
  SUV: 'SUV', Hatch: 'HATCHBACK', Sedan: 'SEDAN', Picape: 'TRUCK', 'Utilitário': 'VAN', Moto: 'OTHER',
};
const TRANSMISSAO = (c: string) => (/autom/i.test(c) ? 'AUTOMATIC' : /manual/i.test(c) ? 'MANUAL' : 'OTHER');
const COMBUSTIVEL = (c: string) =>
  /el[eé]tric/i.test(c) ? 'ELECTRIC' : /h[ií]brid/i.test(c) ? 'HYBRID' : /diesel/i.test(c) ? 'DIESEL'
  : /flex/i.test(c) ? 'FLEX' : /gasolina/i.test(c) ? 'GASOLINE' : 'OTHER';

/**
 * Catálogo de VEÍCULOS (vertical automotivo da Meta, para anúncios de inventário automotivo).
 * Endereço = local único do feirão.
 */
function itemVeiculo(v: Veiculo): string {
  const [l0, l1, l2, l3, l4] = rotulos(v);
  const imagens = v.fotos
    .slice(0, 20)
    .map((f) => `    <image><url>${e(fotoJpeg(f))}</url></image>`)
    .join('\n');
  const end = FEIRAO_CONFIG.localPrincipal.endereco; // "Alameda Aristiliano Ramos, 741 - Centro, Rio do Sul - SC, 89160-129"
  const cep = end.match(/\d{5}-\d{3}/)?.[0] ?? '';
  const rua = end.split(' - ')[0];
  return `  <listing>
    <vehicle_id>${e(v.codigo)}</vehicle_id>
    <title>${e(`${v.titulo} ${v.anoTexto}`.slice(0, 150))}</title>
    <description>${e(descricaoVeiculo(v))}</description>
    <url>${e(linkVeiculo(v))}</url>
    <make>${e(v.marca)}</make>
    <model>${e(v.modelo)}</model>
    <year>${v.anoModelo ?? v.anoFabricacao ?? ''}</year>
    <mileage><value>${v.km ?? 0}</value><unit>KM</unit></mileage>
${imagens}
    <body_style>${BODY_STYLE[v.categoria] ?? 'OTHER'}</body_style>
    <transmission>${TRANSMISSAO(v.cambio)}</transmission>
    <fuel_type>${COMBUSTIVEL(v.combustivel)}</fuel_type>
    <exterior_color>${e(v.cor || 'Outra')}</exterior_color>
    <state_of_vehicle>USED</state_of_vehicle>
    <price>${(v.preco as number).toFixed(2)} BRL</price>
    <availability>AVAILABLE</availability>
    <address format="simple">
      <component name="addr1">${e(rua)}</component>
      <component name="city">Rio do Sul</component>
      <component name="region">SC</component>
      <component name="postal_code">${e(cep)}</component>
      <component name="country">BR</component>
    </address>
    <dealer_name>${e(v.lojaNome)}</dealer_name>
    <custom_label_0>${e(l0)}</custom_label_0>
    <custom_label_1>${e(l1)}</custom_label_1>
    <custom_label_2>${e(l2)}</custom_label_2>
    <custom_label_3>${e(l3)}</custom_label_3>
    <custom_label_4>${e(l4)}</custom_label_4>
  </listing>`;
}

/**
 * Feed XML do estoque das 4 lojas para o Catálogo da Meta.
 *   /api/feed/meta.xml?key=FEED_KEY               → catálogo de comércio (RSS g:)
 *   /api/feed/meta.xml?key=FEED_KEY&tipo=veiculos → catálogo de veículos (automotivo)
 * Cadastre como "Feed agendado" com atualização a cada hora.
 */
export async function GET(req: NextRequest) {
  if (!chaveFeedValida(req)) {
    return NextResponse.json({ erro: 'chave inválida ou FEED_KEY não configurada' }, { status: 401 });
  }

  const itens = veiculosDoFeed(loadEstoque().veiculos);
  const veiculos = req.nextUrl.searchParams.get('tipo') === 'veiculos';

  const xml = veiculos
    ? `<?xml version="1.0" encoding="UTF-8"?>
<listings>
  <title>${e(`${FEIRAO_CONFIG.nome} — estoque das 4 lojas`)}</title>
  <link rel="self" href="${e(`${FEIRAO_CONFIG.siteUrl}/api/feed/meta.xml?tipo=veiculos`)}"/>
${itens.map(itemVeiculo).join('\n')}
</listings>
`
    : `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>${e(`${FEIRAO_CONFIG.nome} — estoque das 4 lojas`)}</title>
    <link>${e(FEIRAO_CONFIG.siteUrl)}</link>
    <description>${e(`Veículos das lojas participantes do ${FEIRAO_CONFIG.nome}, ${FEIRAO_CONFIG.periodo}, em Rio do Sul/SC.`)}</description>
${itens.map(itemComercio).join('\n')}
  </channel>
</rss>
`;

  return new NextResponse(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
      'X-Total-Itens': String(itens.length),
    },
  });
}
