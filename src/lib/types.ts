export type LojaSlug =
  | 'nenem-autos'
  | 'rosa-automoveis'
  | 'v3-automoveis'
  | 'manos-veiculos';

export type LojaSigla = 'MV' | 'NA' | 'RA' | 'V3';

export type CampaignMode = 'pre_lancamento' | 'aberto' | 'encerrado';

export interface LojaInfo {
  slug: LojaSlug;
  sigla: LojaSigla;
  nome: string;
  nomeCurto: string;
  cidade: string;
  /** Endereço completo ou null quando pendente de confirmação (nunca inventar). */
  endereco: string | null;
  /** Indica se há pendência/confirmação necessária no endereço. */
  enderecoPendente?: string;
  mapsUrl: string;
  horarioFeirao: string;
  siteUrl: string;
  logo: string;
  logoTheme: 'dark' | 'light';
  corDestaque: string;
}

export interface Veiculo {
  id: string;
  codigo: string;
  lojaSlug: LojaSlug;
  lojaNome: string;
  titulo: string;
  marca: string;
  modelo: string;
  versao: string;
  anoFabricacao: number | null;
  anoModelo: number | null;
  anoTexto: string;
  preco: number | null;
  precoFormatado: string;
  km: number | null;
  kmFormatado: string;
  cambio: string;
  combustivel: string;
  cor: string;
  portas: number | null;
  categoria: string;
  finalPlaca: string | null;
  cidade: string;
  descricao: string;
  opcionais: string[];
  fotoCapa: string;
  fotos: string[];
  urlOriginal: string;
  atualizadoEm: string;
  /** Quando o veículo apareceu pela 1ª vez no estoque (preservado entre sincronizações). */
  entradaEm?: string;
  /** Campo pronta_entrega: documentação ok, revisado, higienizado (default false). */
  pronta_entrega: boolean;
}

export interface EstoqueMetadata {
  atualizadoEm: string;
  totalVeiculos: number;
  porLoja: Record<LojaSlug, number>;
  erros: string[];
}

export interface EstoqueDatabase {
  metadata: EstoqueMetadata;
  lojas: LojaInfo[];
  veiculos: Veiculo[];
}

export interface FiltroVeiculos {
  q?: string;
  loja?: string;
  marca?: string;
  modelo?: string;
  categoria?: string;
  cambio?: string;
  combustivel?: string;
  prontaEntrega?: boolean;
  apenasMotos?: boolean;
  excluirMotos?: boolean;
  precoMin?: number;
  precoMax?: number;
  anoMin?: number;
  anoMax?: number;
  kmMax?: number;
  ordenar?: 'destaque' | 'preco_asc' | 'preco_desc' | 'ano_desc' | 'km_asc';
  page?: number;
  limit?: number;
}
