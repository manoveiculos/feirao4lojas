import type { LojaInfo, LojaSigla, LojaSlug, Veiculo } from './types';

/**
 * TODO: definir WHATSAPP_NUMBER no .env (formato 55DDDNÚMERO, ex: 5547XXXXXXXXX).
 * Nenhum número fixo é embutido no código — existe UM ÚNICO número central na campanha.
 */
export const WHATSAPP_NUMBER = (
  process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || ''
).replace(/\D/g, '');

/**
 * TODO: definir N8N_WEBHOOK_URL no .env para envio fire-and-forget dos leads.
 */
export const N8N_WEBHOOK_URL = (
  process.env.NEXT_PUBLIC_N8N_WEBHOOK_URL || ''
).trim();

/**
 * TODO: confirmar horário oficial do feirão Acelera V3 via NEXT_PUBLIC_HORARIO_FEIRAO ou abaixo.
 */
export const HORARIO_FEIRAO =
  process.env.NEXT_PUBLIC_HORARIO_FEIRAO?.trim() ||
  'TODO: confirmar horário do feirão';

export const FEIRAO_LOCAL = {
  titulo: 'Local do Feirão Presencial',
  referencia: 'V3 Automóveis — Centro',
  endereco: 'Alameda Aristiliano Ramos, 741 - Centro, Rio do Sul - SC, 89160-129',
  mapsUrl:
    'https://www.google.com/maps/search/?api=1&query=' +
    encodeURIComponent(
      'Alameda Aristiliano Ramos, 741 - Centro, Rio do Sul - SC, 89160-129'
    ),
};

const SITE_URL_PADRAO = 'https://vyro.drivvoo.com';

/**
 * URL pública do site. Usada em links do feed, fotos enviadas pelo WhatsApp, avisos às lojas e Open Graph.
 * Em produção nunca aceita "localhost": esses links precisam abrir fora do servidor (Meta, Evolution, clientes).
 * SITE_URL (lida em tempo de execução) tem prioridade sobre NEXT_PUBLIC_SITE_URL (fixada no build).
 */
function resolverSiteUrl(): string {
  const bruta = (process.env.SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || '').trim().replace(/\/$/, '');
  const local = /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?$/i.test(bruta);
  if (!bruta) return SITE_URL_PADRAO;
  if (local && process.env.NODE_ENV === 'production') return SITE_URL_PADRAO;
  return bruta;
}

export const FEIRAO_CONFIG = {
  nome: 'ACELERA V3',
  cidade: 'Rio do Sul/SC',
  periodo: 'De 14 a 23 de dezembro de 2026',
  whatsappNumber: WHATSAPP_NUMBER,
  n8nWebhookUrl: N8N_WEBHOOK_URL,
  horarioFeirao: HORARIO_FEIRAO,
  localPrincipal: FEIRAO_LOCAL,
  siteUrl: resolverSiteUrl(),
  /** Arte cinematográfica limpa (sem texto) otimizada em WebP para o fundo do Hero */
  campaignImage: '/campanha-acelera-v3.webp',
  /** Arte completa de campanha para compartilhamento OpenGraph (WhatsApp/Instagram) */
  ogImage: '/og-acelera-v3.jpg',
  /** Logos oficiais dos bancos parceiros */
  bancosParceiros: [
    {
      id: 'c6-bank',
      nome: 'C6 Bank',
      logoPath: '/logos/c6-bank.png',
      bgColor: '#FFFFFF',
      imgClass: 'h-8 max-w-[140px] object-contain',
    },
    {
      id: 'viacredi-alto-vale',
      nome: 'Viacredi Alto Vale',
      logoPath: '/logos/viacredi-alto-vale.png',
      bgColor: '#195C7C',
      imgClass: 'h-14 w-auto object-contain',
    },
  ],
};

/**
 * Lojas participantes do Acelera V3 (feirão presencial em endereço único, sem telefones individuais).
 */
export const LOJAS: LojaInfo[] = [
  {
    slug: 'manos-veiculos',
    sigla: 'MV',
    nome: 'Manos Veículos',
    nomeCurto: 'Manos Veículos',
    cidade: 'Rio do Sul/SC',
    endereco: null,
    mapsUrl: FEIRAO_LOCAL.mapsUrl,
    horarioFeirao: HORARIO_FEIRAO,
    siteUrl: 'https://manosveiculos.com.br/',
    logo: '/logos/manos-veiculos.png',
    logoTheme: 'dark',
    corDestaque: '#EA580C',
  },
  {
    slug: 'nenem-autos',
    sigla: 'NA',
    nome: 'Neném Autos',
    nomeCurto: 'Neném Autos',
    cidade: 'Rio do Sul/SC',
    endereco: null,
    mapsUrl: FEIRAO_LOCAL.mapsUrl,
    horarioFeirao: HORARIO_FEIRAO,
    siteUrl: 'https://altovaleveiculos.com.br/lojas/nenem-autos',
    logo: '/logos/nenem-autos.png',
    logoTheme: 'dark',
    corDestaque: '#0E7490',
  },
  {
    slug: 'rosa-automoveis',
    sigla: 'RA',
    nome: 'Rosa Automóveis',
    nomeCurto: 'Rosa Automóveis',
    cidade: 'Rio do Sul/SC',
    endereco: null,
    mapsUrl: FEIRAO_LOCAL.mapsUrl,
    horarioFeirao: HORARIO_FEIRAO,
    siteUrl: 'https://altovaleveiculos.com.br/lojas/rosa-automoveis',
    logo: '/logos/rosa-automoveis.png',
    logoTheme: 'light',
    corDestaque: '#16A34A',
  },
  {
    slug: 'v3-automoveis',
    sigla: 'V3',
    nome: 'V3 Automóveis',
    nomeCurto: 'V3 Automóveis',
    cidade: 'Rio do Sul/SC',
    endereco: FEIRAO_LOCAL.endereco,
    mapsUrl: FEIRAO_LOCAL.mapsUrl,
    horarioFeirao: HORARIO_FEIRAO,
    siteUrl: 'https://www.v3automoveis.com.br/estoque',
    logo: '/logos/v3-automoveis.png',
    logoTheme: 'dark',
    corDestaque: '#DC2626',
  },
];

export const LOJAS_BY_SLUG: Record<LojaSlug, LojaInfo> = Object.fromEntries(
  LOJAS.map((l) => [l.slug, l])
) as Record<LojaSlug, LojaInfo>;

export const LOJA_SIGLA_BY_SLUG: Record<LojaSlug, LojaSigla> = {
  'manos-veiculos': 'MV',
  'nenem-autos': 'NA',
  'rosa-automoveis': 'RA',
  'v3-automoveis': 'V3',
};

/**
 * Extrai a sigla da loja diretamente do prefixo do código do card (MV, NA, RA, V3).
 */
export function getSiglaFromCodigo(codigo: string): LojaSigla | null {
  const prefix = codigo.split('-')[0]?.toUpperCase();
  if (prefix === 'MV' || prefix === 'NA' || prefix === 'RA' || prefix === 'V3') {
    return prefix;
  }
  return null;
}

export function buildWhatsappUrl(message: string): string {
  const encoded = encodeURIComponent(message);
  if (!WHATSAPP_NUMBER) {
    // Fallback seguro sem inventar número: abre link wa.me/?text=... até WHATSAPP_NUMBER ser configurado
    return `https://wa.me/?text=${encoded}`;
  }
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encoded}`;
}

export function buildRefCarro(codigo: string): string {
  return `AV3-${codigo.toUpperCase()}`;
}

export function buildRefLoja(sigla: LojaSigla): string {
  return `AV3-LOJA-${sigla}`;
}

/**
 * Mensagens padronizadas terminando em [Ref: AV3-...]
 * Parseável por regex: /\[Ref: (AV3-[A-Z0-9-]+)\]/
 */
export function buildVehicleWhatsappMessage(v: Veiculo): string {
  const ref = buildRefCarro(v.codigo);
  return `Olá! Vi o ${v.titulo} ${v.anoTexto} no Acelera V3 e quero sair rodando. Pode simular com a 1ª parcela depois do Carnaval? [Ref: ${ref}]`;
}

export function buildSimulatorWhatsappMessage(params: {
  entrada: string;
  prazo: string;
  banco: string;
}): string {
  return `Olá! Quero simular no Acelera V3. Entrada: ${params.entrada}. Prazo: ${params.prazo}. Banco: ${params.banco}. [Ref: AV3-SIM]`;
}

export function buildTradeInWhatsappMessage(params: {
  modelo: string;
  ano: string;
}): string {
  return `Olá! Quero avaliar meu ${params.modelo} ${params.ano} no Acelera V3. [Ref: AV3-TROCA]`;
}

export function buildStoreWhatsappMessage(loja: LojaInfo): string {
  const ref = buildRefLoja(loja.sigla);
  return `Olá! Quero falar com a loja ${loja.nome} no Acelera V3. [Ref: ${ref}]`;
}

export function buildGeneralWhatsappMessage(): string {
  return `Olá! Quero conhecer as ofertas do Acelera V3. [Ref: AV3-GERAL]`;
}
