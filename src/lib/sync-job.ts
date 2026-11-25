import { loadEstoque, saveEstoque } from './estoque';
import { syncAllStores } from './scraper';

let rodando: Promise<Awaited<ReturnType<typeof executar>>> | null = null;

async function executar() {
  const inicio = Date.now();
  const antes = loadEstoque().metadata.totalVeiculos;
  const db = await syncAllStores();
  // Segurança: não substitui um estoque bom por um vazio (site fora do ar / bloqueio)
  if (antes > 10 && db.veiculos.length < antes * 0.5) {
    return {
      status: 'ignorado' as const,
      motivo: `Extração retornou ${db.veiculos.length} veículos (antes: ${antes}). Estoque anterior mantido.`,
      erros: db.metadata.erros,
    };
  }
  saveEstoque(db);
  // estoque mudou: cruza os veículos novos com a lista de espera
  const { rodarMatchEspera } = await import('./espera/espera');
  const espera = await rodarMatchEspera().catch((e) => ({ status: 'erro' as const, erro: String(e) }));
  return {
    status: 'sincronizado' as const,
    duracaoSegundos: Number(((Date.now() - inicio) / 1000).toFixed(1)),
    total: db.metadata.totalVeiculos,
    metadata: db.metadata,
    espera,
  };
}

/** Garante uma única sincronização por vez. */
export function sincronizarEstoque() {
  if (!rodando) rodando = executar().finally(() => (rodando = null));
  return rodando;
}
