import fs from 'node:fs';
import { DATA_FILE_PATH, loadEstoque, saveEstoque } from '../src/lib/estoque';
import { mergeAndNormalizeSync } from '../src/lib/normalize';
import { syncAllStores } from '../src/lib/scraper';

async function main() {
  console.log('🚗 Iniciando sincronização automática das 4 lojas do ACELERA V3...');
  const start = Date.now();

  const previousDb = fs.existsSync(DATA_FILE_PATH) ? loadEstoque() : null;
  const freshDb = await syncAllStores();
  const { db, diff } = mergeAndNormalizeSync(previousDb, freshDb);

  // Only rewrite file when real inventory data changed (keeps git clean on scheduled runs)
  if (diff.houveMudanca || !previousDb) {
    saveEstoque(db);
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`\n✅ Sincronização concluída em ${elapsed}s!`);
  console.log(`Total de veículos ativos: ${db.metadata.totalVeiculos}`);
  console.log('Por loja:', db.metadata.porLoja);
  console.log(
    `Alterações -> +${diff.adicionados.length} novos | -${diff.removidos.length} vendidos/removidos | ${diff.precoAlterado.length} preços alterados | Mudança gravada: ${diff.houveMudanca ? 'SIM' : 'NÃO'}`
  );

  if (diff.adicionados.length > 0) {
    console.log('\n🆕 Novos veículos encontrados:');
    diff.adicionados.forEach((v) =>
      console.log(`  + [${v.codigo}] ${v.lojaNome}: ${v.titulo} (${v.anoTexto}) — ${v.precoFormatado}`)
    );
  }

  if (diff.removidos.length > 0) {
    console.log('\n🏷️ Veículos vendidos/removidos dos sites:');
    diff.removidos.forEach((v) =>
      console.log(`  - [${v.codigo}] ${v.lojaNome}: ${v.titulo} (${v.anoTexto}) — ${v.precoFormatado}`)
    );
  }

  if (diff.precoAlterado.length > 0) {
    console.log('\n💲 Alterações de preço:');
    diff.precoAlterado.forEach(({ veiculo, precoAnterior, precoNovo }) =>
      console.log(`  ~ [${veiculo.codigo}] ${veiculo.titulo}: ${precoAnterior} -> ${precoNovo}`)
    );
  }

  if (diff.lojasEmFallback.length > 0) {
    console.log('\n🛡️ Lojas protegidas por fallback (site instável):', diff.lojasEmFallback);
  }

  if (db.metadata.erros.length > 0) {
    console.log(`\n⚠️ Avisos (${db.metadata.erros.length}):`);
    db.metadata.erros.forEach((e) => console.log('  -', e));
  }
}

main().catch((err) => {
  console.error('❌ Erro fatal na sincronização:', err);
  process.exit(1);
});
