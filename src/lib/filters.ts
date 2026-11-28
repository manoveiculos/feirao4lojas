import Fuse from 'fuse.js';
import type { FiltroVeiculos, Veiculo } from './types';

export function normalizeSearch(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

const SEARCH_SYNONYMS: Record<string, string[]> = {
  vw: ['volkswagen'],
  gm: ['chevrolet'],
  camionete: ['picape'],
  caminhonete: ['picape'],
  pickup: ['picape'],
  auto: ['automatico'],
  automatica: ['automatico'],
  eletrica: ['eletrico'],
  hibrida: ['hibrido'],
  seda: ['sedan'],
  utilitario: ['utilitario', 'picape'],
};

/** Marcas que só fabricam motos: protegem contra anúncio de moto cadastrado com categoria de carro. */
const MARCAS_SO_MOTO = ['yamaha', 'dafra', 'haojue', 'shineray', 'kawasaki', 'harley', 'triumph', 'ducati', 'royal enfield'];

export function isMoto(v: Veiculo): boolean {
  if (normalizeSearch(v.categoria) === 'moto') return true;
  const marca = normalizeSearch(v.marca || '');
  return MARCAS_SO_MOTO.some((m) => marca.startsWith(m));
}

export function formatKmDisplay(km: number | null, kmFormatado?: string): string {
  if (km === null || km === undefined) return 'Km sob consulta';
  if (kmFormatado && /consulte/i.test(kmFormatado)) return 'Km sob consulta';
  if (km === 0) return '0 km';
  return `${new Intl.NumberFormat('pt-BR').format(km)} km`;
}

export function filterVeiculos(
  veiculos: Veiculo[],
  filtros: FiltroVeiculos
): Veiculo[] {
  let list = [...veiculos];

  if (filtros.apenasMotos) {
    list = list.filter((v) => isMoto(v));
  } else if (filtros.excluirMotos) {
    list = list.filter((v) => !isMoto(v));
  }

  if (filtros.prontaEntrega) {
    list = list.filter((v) => Boolean(v.pronta_entrega));
  }

  if (filtros.loja && filtros.loja !== 'todas') {
    const target = normalizeSearch(filtros.loja);
    list = list.filter(
      (v) =>
        normalizeSearch(v.lojaSlug) === target ||
        normalizeSearch(v.lojaNome).includes(target)
    );
  }

  if (filtros.marca && filtros.marca !== 'todas') {
    const target = normalizeSearch(filtros.marca);
    const expanded = SEARCH_SYNONYMS[target] || [target];
    list = list.filter((v) =>
      expanded.some((m) => normalizeSearch(v.marca).includes(m))
    );
  }

  if (filtros.modelo) {
    const target = normalizeSearch(filtros.modelo);
    list = list.filter(
      (v) =>
        normalizeSearch(v.modelo).includes(target) ||
        normalizeSearch(v.titulo).includes(target)
    );
  }

  if (filtros.categoria && filtros.categoria !== 'todas') {
    const target = normalizeSearch(filtros.categoria);
    const expanded = SEARCH_SYNONYMS[target] || [target];
    list = list.filter((v) =>
      expanded.some(
        (c) =>
          normalizeSearch(v.categoria).includes(c) ||
          (c === 'eletrico' &&
            (normalizeSearch(v.combustivel).includes('eletrico') ||
              normalizeSearch(v.combustivel).includes('hibrido')))
      )
    );
  }

  if (filtros.cambio && filtros.cambio !== 'todos') {
    const target = normalizeSearch(filtros.cambio);
    const expanded = SEARCH_SYNONYMS[target] || [target];
    list = list.filter((v) =>
      expanded.some((c) => normalizeSearch(v.cambio).includes(c))
    );
  }

  if (filtros.combustivel && filtros.combustivel !== 'todos') {
    const target = normalizeSearch(filtros.combustivel);
    const expanded = SEARCH_SYNONYMS[target] || [target];
    list = list.filter((v) =>
      expanded.some((c) => normalizeSearch(v.combustivel).includes(c))
    );
  }

  if (typeof filtros.precoMin === 'number' && filtros.precoMin > 0) {
    list = list.filter((v) => v.preco !== null && v.preco >= filtros.precoMin!);
  }

  if (typeof filtros.precoMax === 'number' && filtros.precoMax > 0) {
    list = list.filter((v) => v.preco !== null && v.preco <= filtros.precoMax!);
  }

  if (typeof filtros.anoMin === 'number' && filtros.anoMin > 0) {
    list = list.filter(
      (v) => (v.anoModelo ?? v.anoFabricacao ?? 0) >= filtros.anoMin!
    );
  }

  if (typeof filtros.anoMax === 'number' && filtros.anoMax > 0) {
    list = list.filter(
      (v) => (v.anoModelo ?? v.anoFabricacao ?? 9999) <= filtros.anoMax!
    );
  }

  if (typeof filtros.kmMax === 'number' && filtros.kmMax > 0) {
    list = list.filter((v) => v.km !== null && v.km <= filtros.kmMax!);
  }

  // Fuzzy search with Fuse.js (tolerates typos like "Corola", "Haval", "Onix", "Renegad")
  if (filtros.q && filtros.q.trim()) {
    const query = filtros.q.trim();
    const normQuery = normalizeSearch(query);

    // Exact/code fast match first (e.g. "NA-001", "V3-001")
    const codeMatch = list.filter(
      (v) => normalizeSearch(v.codigo) === normQuery
    );
    if (codeMatch.length > 0) {
      list = codeMatch;
    } else {
      // Expand common synonyms in query tokens (vw -> volkswagen, gm -> chevrolet)
      const expandedQuery = normQuery
        .split(/\s+/)
        .map((tok) => (SEARCH_SYNONYMS[tok] ? SEARCH_SYNONYMS[tok][0] : tok))
        .join(' ');

      const fuse = new Fuse(list, {
        includeScore: true,
        threshold: 0.36,
        ignoreLocation: true,
        minMatchCharLength: 2,
        keys: [
          { name: 'marca', weight: 0.3 },
          { name: 'modelo', weight: 0.35 },
          { name: 'titulo', weight: 0.25 },
          { name: 'versao', weight: 0.15 },
          { name: 'codigo', weight: 0.2 },
          { name: 'anoTexto', weight: 0.1 },
          { name: 'combustivel', weight: 0.1 },
          { name: 'cambio', weight: 0.1 },
          { name: 'cor', weight: 0.08 },
          { name: 'lojaNome', weight: 0.08 },
        ],
      });

      list = fuse.search(expandedQuery).map((r) => r.item);
    }
  }

  switch (filtros.ordenar) {
    case 'preco_asc':
      list.sort((a, b) => (a.preco ?? 9e9) - (b.preco ?? 9e9));
      break;
    case 'preco_desc':
      list.sort((a, b) => (b.preco ?? 0) - (a.preco ?? 0));
      break;
    case 'ano_desc':
      list.sort(
        (a, b) =>
          (b.anoModelo ?? b.anoFabricacao ?? 0) -
          (a.anoModelo ?? a.anoFabricacao ?? 0)
      );
      break;
    case 'km_asc':
      list.sort((a, b) => (a.km ?? 9e9) - (b.km ?? 9e9));
      break;
    case 'destaque':
    default:
      // "Mais recentes": o que entrou por último no estoque aparece primeiro (empate mantém a ordem da origem)
      list.sort((a, b) => Date.parse(b.entradaEm ?? '') - Date.parse(a.entradaEm ?? '') || 0);
      break;
  }

  return list;
}

export function getEstoqueFacets(veiculos: Veiculo[]) {
  const carros = veiculos.filter((v) => !isMoto(v));
  const motos = veiculos.filter((v) => isMoto(v));

  const marcasMap = new Map<string, number>();
  const categoriasMap = new Map<string, number>();
  const combustiveisMap = new Map<string, number>();
  const cambiosMap = new Map<string, number>();
  let minPreco = Infinity;
  let maxPreco = 0;

  for (const v of carros) {
    marcasMap.set(v.marca, (marcasMap.get(v.marca) || 0) + 1);
    const cat = v.categoria === 'Hatch / Passeio' ? 'Hatch' : v.categoria;
    categoriasMap.set(cat, (categoriasMap.get(cat) || 0) + 1);
    combustiveisMap.set(
      v.combustivel,
      (combustiveisMap.get(v.combustivel) || 0) + 1
    );
    cambiosMap.set(v.cambio, (cambiosMap.get(v.cambio) || 0) + 1);
    if (v.preco && v.preco > 0) {
      if (v.preco < minPreco) minPreco = v.preco;
      if (v.preco > maxPreco) maxPreco = v.preco;
    }
  }

  // Round max price UP to nearest 10k so the highest-priced vehicle is always covered
  const maxPrecoArredondado =
    maxPreco > 0 ? Math.ceil(maxPreco / 10000) * 10000 : 300000;

  const sortMap = (m: Map<string, number>) =>
    [...m.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([nome, quantidade]) => ({ nome, quantidade }));

  return {
    marcas: sortMap(marcasMap),
    categorias: sortMap(categoriasMap),
    combustiveis: sortMap(combustiveisMap),
    cambios: sortMap(cambiosMap),
    totalCarros: carros.length,
    totalMotos: motos.length,
    totalEletricos: carros.filter(
      (v) => normalizeSearch(v.combustivel) === 'eletrico'
    ).length,
    totalProntaEntrega: carros.filter((v) => Boolean(v.pronta_entrega)).length,
    faixaPreco: {
      min: Number.isFinite(minPreco) ? minPreco : 0,
      max: maxPreco,
      maxArredondado: maxPrecoArredondado,
    },
  };
}

export function formatVeiculoParaWhatsapp(v: Veiculo): string {
  const linhas = [
    `*${v.titulo}*`,
    `💰 *${v.precoFormatado}*`,
    `📅 Ano: ${v.anoTexto} | 🛣️ ${formatKmDisplay(v.km, v.kmFormatado)}`,
    `⚙️ ${v.cambio} | ⛽ ${v.combustivel} | 🎨 ${v.cor}`,
    `🏪 Loja: ${v.lojaNome} (${v.cidade}) | 🔖 Cód: ${v.codigo}`,
  ];
  if (v.opcionais.length > 0) {
    linhas.push(
      `✅ Destaques: ${v.opcionais.slice(0, 6).join(', ')}${v.opcionais.length > 6 ? ` (+${v.opcionais.length - 6} itens)` : ''}`
    );
  }
  return linhas.join('\n');
}
