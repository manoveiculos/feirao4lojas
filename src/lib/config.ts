import type { LojaInfo, LojaSlug, Veiculo } from './types';

export const FEIRAO_CONFIG = {
  nome: process.env.NEXT_PUBLIC_FEIRAO_NOME || 'Feirão 4 Lojas',
  cidade: process.env.NEXT_PUBLIC_FEIRAO_CIDADE || 'Rio do Sul - SC',
  periodo:
    process.env.NEXT_PUBLIC_FEIRAO_PERIODO ||
    'Condições Especiais por Tempo Limitado',
  whatsappNumber: (
    process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || '5547999999999'
  ).replace(/\D/g, ''),
  siteUrl: (
    process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
  ).replace(/\/$/, ''),
};

export const LOJAS: LojaInfo[] = [
  {
    slug: 'nenem-autos',
    nome: 'Neném Autos',
    nomeCurto: 'Neném Autos',
    cidade: 'Rio do Sul - SC',
    endereco: 'Rua Garuva, 216 - Rio do Sul / SC',
    telefoneOriginal: '(47) 98821-1529',
    siteUrl: 'https://altovaleveiculos.com.br/lojas/nenem-autos',
    logo: '/logos/nenem-autos.png',
    logoTheme: 'dark',
    corDestaque: '#7C3AED',
  },
  {
    slug: 'rosa-automoveis',
    nome: 'Rosa Automóveis',
    nomeCurto: 'Rosa Automóveis',
    cidade: 'Rio do Sul - SC',
    endereco: 'Rio do Sul / SC',
    telefoneOriginal: '(47) 99928-0404',
    siteUrl: 'https://altovaleveiculos.com.br/lojas/rosa-automoveis',
    logo: '/logos/rosa-automoveis.png',
    logoTheme: 'light',
    corDestaque: '#16A34A',
  },
  {
    slug: 'v3-automoveis',
    nome: 'V3 Automóveis',
    nomeCurto: 'V3 Automóveis',
    cidade: 'Rio do Sul - SC',
    endereco: 'Rio do Sul / SC',
    telefoneOriginal: '(47) 3525-3383',
    siteUrl: 'https://www.v3automoveis.com.br/estoque',
    logo: '/logos/v3-automoveis.png',
    logoTheme: 'dark',
    corDestaque: '#DC2626',
  },
  {
    slug: 'manos-veiculos',
    nome: 'Manos Veículos',
    nomeCurto: 'Manos Veículos',
    cidade: 'Rio do Sul - SC',
    endereco: 'Rua Dom Pedro II, 374, Canoas - Rio do Sul / SC',
    telefoneOriginal: '(47) 3300-1352',
    siteUrl: 'https://manosveiculos.com.br/',
    logo: '/logos/manos-veiculos.png',
    logoTheme: 'dark',
    corDestaque: '#B91C1C',
  },
];

export const LOJAS_BY_SLUG: Record<LojaSlug, LojaInfo> = Object.fromEntries(
  LOJAS.map((l) => [l.slug, l])
) as Record<LojaSlug, LojaInfo>;

export function buildWhatsappUrl(message: string): string {
  const encoded = encodeURIComponent(message);
  return `https://wa.me/${FEIRAO_CONFIG.whatsappNumber}?text=${encoded}`;
}

export function buildVehicleWhatsappMessage(
  v: Veiculo,
  intent: 'info' | 'financiamento' | 'troca' | 'visita' = 'info'
): string {
  const resumo = `${v.titulo} (${v.anoTexto} | ${v.precoFormatado}) [Cód: ${v.codigo}]`;
  switch (intent) {
    case 'financiamento':
      return `Olá! Vi o *${resumo}* no ${FEIRAO_CONFIG.nome} e gostaria de *simular o financiamento* com as condições do feirão!`;
    case 'troca':
      return `Olá! Vi o *${resumo}* no ${FEIRAO_CONFIG.nome} e tenho um *veículo para dar na troca*. Podemos avaliar?`;
    case 'visita':
      return `Olá! Vi o *${resumo}* no ${FEIRAO_CONFIG.nome} e gostaria de *agendar uma visita / test drive*!`;
    default:
      return `Olá! Vi o *${resumo}* na página do ${FEIRAO_CONFIG.nome} (loja ${v.lojaNome}) e quero mais informações!`;
  }
}

export function buildGeneralWhatsappMessage(contexto?: string): string {
  if (contexto) {
    return `Olá! Estou na página do ${FEIRAO_CONFIG.nome} e procuro: ${contexto}. Pode me ajudar?`;
  }
  return `Olá! Vim pela página do ${FEIRAO_CONFIG.nome} e gostaria de saber mais sobre os veículos e condições do feirão!`;
}
