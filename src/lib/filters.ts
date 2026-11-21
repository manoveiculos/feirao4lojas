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

export function filterVeiculos(
  veiculos: Veiculo[],
  filtros: FiltroVeiculos
): Veiculo[] {
  let list = [...veiculos];

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

  if (filtros.q && filtros.q.trim()) {
    const tokens = normalizeSearch(filtros.q)
      .split(/\s+/)
      .filter((t) => t.length >= 2);
    list = list.filter((v) => {
      const haystack = normalizeSearch(
        [
          v.codigo,
          v.titulo,
          v.marca,
          v.modelo,
          v.versao,
          v.anoTexto,
          v.categoria,
          v.cambio,
          v.combustivel,
          v.cor,
          v.lojaNome,
          v.descricao,
          v.opcionais.join(' '),
        ].join(' ')
      );
      return tokens.every((tok) => {
        const synonyms = SEARCH_SYNONYMS[tok] || [tok];
        return synonyms.some((s) => haystack.includes(s));
      });
    });
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
    default:
      break;
  }

  return list;
}

export function getEstoqueFacets(veiculos: Veiculo[]) {
  const marcasMap = new Map<string, number>();
  const categoriasMap = new Map<string, number>();
  const combustiveisMap = new Map<string, number>();
  const cambiosMap = new Map<string, number>();
  let minPreco = Infinity;
  let maxPreco = 0;

  for (const v of veiculos) {
    marcasMap.set(v.marca, (marcasMap.get(v.marca) || 0) + 1);
    categoriasMap.set(v.categoria, (categoriasMap.get(v.categoria) || 0) + 1);
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

  const sortMap = (m: Map<string, number>) =>
    [...m.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([nome, quantidade]) => ({ nome, quantidade }));

  return {
    marcas: sortMap(marcasMap),
    categorias: sortMap(categoriasMap),
    combustiveis: sortMap(combustiveisMap),
    cambios: sortMap(cambiosMap),
    faixaPreco: {
      min: Number.isFinite(minPreco) ? minPreco : 0,
      max: maxPreco,
    },
  };
}

export function formatVeiculoParaWhatsapp(v: Veiculo): string {
  const linhas = [
    `*${v.titulo}*`,
    `💰 *${v.precoFormatado}*`,
    `📅 Ano: ${v.anoTexto} | 🛣️ ${v.kmFormatado}`,
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
