import fs from 'node:fs';
import path from 'node:path';
import { LOJAS } from './config';
import type { EstoqueDatabase } from './types';

export {
  filterVeiculos,
  formatVeiculoParaWhatsapp,
  getEstoqueFacets,
  normalizeSearch,
} from './filters';

export const DATA_FILE_PATH = path.join(process.cwd(), 'data', 'estoque.json');

export function saveEstoque(db: EstoqueDatabase): void {
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
  return JSON.parse(raw) as EstoqueDatabase;
}
