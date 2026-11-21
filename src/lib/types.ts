export type LojaSlug =
  | 'nenem-autos'
  | 'rosa-automoveis'
  | 'v3-automoveis'
  | 'manos-veiculos';

export interface LojaInfo {
  slug: LojaSlug;
  nome: string;
  nomeCurto: string;
  cidade: string;
  endereco: string;
  telefoneOriginal: string;
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
  precoMin?: number;
  precoMax?: number;
  anoMin?: number;
  anoMax?: number;
  kmMax?: number;
  ordenar?: 'destaque' | 'preco_asc' | 'preco_desc' | 'ano_desc' | 'km_asc';
  page?: number;
  limit?: number;
}
