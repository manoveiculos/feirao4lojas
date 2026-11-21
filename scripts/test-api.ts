const BASE = process.env.BASE_URL || 'http://localhost:3000';

async function check(name: string, path: string) {
  const res = await fetch(`${BASE}${path}`);
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`[FAIL] ${name} (${path}): HTTP ${res.status} ${JSON.stringify(data)}`);
  }
  console.log(`[OK] ${name} (${path}) -> HTTP ${res.status}`);
  return data;
}

async function main() {
  const resumo = await check('Resumo Chatbot', '/api/chatbot/resumo');
  console.log(`   Total veículos: ${resumo.totalVeiculos} | Lojas: ${resumo.lojas.length} | Catálogo compacto: ${resumo.catalogoCompacto.length}`);

  const busca = await check('Busca Chatbot (SUV até 160k)', '/api/chatbot/buscar?categoria=suv&orcamento=160000&limit=3');
  console.log(`   Encontrados: ${busca.encontrados} | Exibidos: ${busca.exibidos}`);
  console.log(`   Prévia WhatsApp:\n${busca.mensagemProntaWhatsapp.split('\n').slice(0, 6).map((l: string) => '     ' + l).join('\n')}`);

  const lista = await check('Listagem /api/veiculos', '/api/veiculos?formato=compacto&limit=5');
  console.log(`   Total geral: ${lista.totalEstoqueGeral} | Retornados: ${lista.veiculos.length}`);

  const codigo = lista.veiculos[0]?.codigo || 'NA-001';
  const detalhe = await check(`Detalhes /api/veiculos/${codigo}`, `/api/veiculos/${codigo}`);
  console.log(`   Veículo: ${detalhe.veiculo.titulo} | Fotos: ${detalhe.veiculo.fotos.length} | Opcionais: ${detalhe.veiculo.opcionais.length}`);

  const lojas = await check('Lojas /api/lojas', '/api/lojas');
  console.log(`   Lojas: ${lojas.lojas.map((l: any) => `${l.nome} (${l.totalVeiculos})`).join(', ')}`);

  console.log('\n✅ Todos os endpoints da API passaram com sucesso!');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
