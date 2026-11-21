import { saveEstoque } from '../src/lib/estoque';
import { syncAllStores } from '../src/lib/scraper';

async function main() {
  console.log('🚗 Iniciando extração unificada das 4 lojas do Feirão...');
  const start = Date.now();
  const db = await syncAllStores();
  saveEstoque(db);
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);

  console.log(`\n✅ Extração concluída em ${elapsed}s!`);
  console.log(`Total de veículos extraídos: ${db.metadata.totalVeiculos}`);
  console.log('Por loja:', db.metadata.porLoja);

  const semFoto = db.veiculos.filter((v) => !v.fotoCapa).length;
  const semPreco = db.veiculos.filter((v) => !v.preco).length;
  console.log(`Qualidade -> Sem foto: ${semFoto} | Sem preço: ${semPreco}`);

  if (db.metadata.erros.length > 0) {
    console.log(`\n⚠️ Avisos/Erros (${db.metadata.erros.length}):`);
    db.metadata.erros.forEach((e) => console.log(' -', e));
  }

  console.log('\nAmostra de 1 veículo por loja:');
  for (const loja of db.lojas) {
    const sample = db.veiculos.find((v) => v.lojaSlug === loja.slug);
    if (sample) {
      console.log(
        `  [${sample.codigo}] ${loja.nome}: ${sample.titulo} | ${sample.anoTexto} | ${sample.precoFormatado} | ${sample.kmFormatado} | ${sample.cambio} | ${sample.combustivel} | ${sample.fotos.length} fotos | ${sample.opcionais.length} opcionais`
      );
    }
  }
}

main().catch((err) => {
  console.error('❌ Erro fatal na sincronização:', err);
  process.exit(1);
});
