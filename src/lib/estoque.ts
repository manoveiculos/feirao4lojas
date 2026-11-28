import fs from 'node:fs';
import path from 'node:path';
import { LOJAS } from './config';
import type { EstoqueDatabase } from './types';

export {
  filterVeiculos,
  formatKmDisplay,
  formatVeiculoParaWhatsapp,
  getEstoqueFacets,
  isMoto,
  normalizeSearch,
} from './filters';

export const DATA_FILE_PATH = path.join(process.cwd(), 'data', 'estoque.json');

/** Data-sentinela: veículo que já estava no estoque antes de existir o carimbo de entrada (data real desconhecida). */
export const ENTRADA_LEGADO = '2000-01-01T00:00:00.000Z';

/**
 * Carimba `entradaEm` (1ª vez que o veículo apareceu). Quem já estava no estoque anterior mantém a data;
 * veículo inédito recebe agora; estoque antigo sem data recebe ENTRADA_LEGADO (não dispara aviso retroativo).
 */
function carimbarEntrada(db: EstoqueDatabase): void {
  let anterior: EstoqueDatabase | null = null;
  try {
    if (fs.existsSync(DATA_FILE_PATH)) anterior = JSON.parse(fs.readFileSync(DATA_FILE_PATH, 'utf8')) as EstoqueDatabase;
  } catch {
    anterior = null;
  }
  const porId = new Map<string, string>();
  const porUrl = new Map<string, string>();
  for (const v of anterior?.veiculos ?? []) {
    const t = v.entradaEm || ENTRADA_LEGADO;
    porId.set(v.id, t);
    if (v.urlOriginal) porUrl.set(v.urlOriginal, t);
  }
  const agora = new Date().toISOString();
  for (const v of db.veiculos) {
    v.entradaEm = v.entradaEm || porId.get(v.id) || (v.urlOriginal && porUrl.get(v.urlOriginal)) || (anterior ? agora : ENTRADA_LEGADO);
  }
}

export function saveEstoque(db: EstoqueDatabase): void {
  carimbarEntrada(db);
  fs.mkdirSync(path.dirname(DATA_FILE_PATH), { recursive: true });
  fs.writeFileSync(DATA_FILE_PATH, JSON.stringify(db, null, 2), 'utf8');
}

export function loadEstoque(): EstoqueDatabase {
  if (!fs.existsSync(DATA_FILE_PATH)) {
    return {
      metadata: {
        atualizadoEm: new Date(0).toISOString(),
        totalVeiculos: 0,
        porLoja: {
          'nenem-autos': 0,
          'rosa-automoveis': 0,
          'v3-automoveis': 0,
          'manos-veiculos': 0,
        },
        erros: ['Estoque ainda não sincronizado. Execute: npm run sync'],
      },
      lojas: LOJAS,
      veiculos: [],
    };
  }
  const raw = fs.readFileSync(DATA_FILE_PATH, 'utf8');
  const parsed = JSON.parse(raw) as EstoqueDatabase;
  return {
    ...parsed,
    // Always use canonical store config (with sigla, mapsUrl, TODOs and no per-store phone)
    lojas: LOJAS,
    veiculos: (parsed.veiculos || []).map((v) => ({
      ...v,
      pronta_entrega: Boolean(v.pronta_entrega),
    })),
  };
}
