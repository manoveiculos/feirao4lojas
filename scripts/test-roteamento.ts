/**
 * Teste das regras do SDR (Agente 1), do Agente Roteador (Agente 2) e da lista de espera.
 * Roda 100% local: WhatsApp desligado (provider "none"), banco desligado, dados em pasta temporária.
 * Não chama o Claude: exercita as tools diretamente.
 *
 *   npx tsx scripts/test-roteamento.ts
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// ── isolamento: nada real sai daqui (variável de processo vence o .env.local) ──
process.env.WHATSAPP_PROVIDER = 'none';
process.env.SUPABASE_URL = '';
process.env.SUPABASE_SERVICE_ROLE_KEY = '';
process.env.ANTHROPIC_API_KEY = '';
process.env.META_CAPI_TOKEN = '';
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'av3-teste-'));

const enviados: string[] = [];
const logOriginal = console.log;
console.log = (...a: unknown[]) => {
  const s = a.map(String).join(' ');
  if (s.startsWith('[whatsapp:none]')) enviados.push(s);
  else logOriginal(...a);
};

let falhas = 0;
function ok(cond: unknown, msg: string) {
  if (cond) logOriginal(`  ✔ ${msg}`);
  else {
    falhas++;
    logOriginal(`  ✘ ${msg}`);
  }
}

async function main() {
  const store = await import('../src/lib/db/store');
  const { executarTool } = await import('../src/lib/agent/engine');
  const { decidirLoja, lojasCompativeis } = await import('../src/lib/agent/roteador');
  const { leadsVisiveis } = await import('../src/lib/stats');
  const { veiculoAtende, rodarMatchEspera, TOLERANCIA_PRECO } = await import('../src/lib/espera/espera');
  const { loadEstoque } = await import('../src/lib/estoque');

  const estoque = loadEstoque().veiculos.filter((v) => v.preco && v.categoria !== 'Moto');
  if (estoque.length < 3) throw new Error('Estoque vazio: rode npm run sync antes.');
  const carro = estoque[0];

  // números fictícios no formato válido (provider "none": só registra no log)
  store.saveSettings({
    lojaTelefones: { 'nenem-autos': '5500000000011', 'rosa-automoveis': '5500000000012', 'v3-automoveis': '5500000000013', 'manos-veiculos': '120363000000000000@g.us' },
    gerenteTelefone: '',
  });
  let seq = 0;
  const novoLead = (extra: Partial<import('../src/lib/db/types').Lead> = {}) =>
    store.createLead({ telefone: `55000000${String(1000 + ++seq)}`, nome: `Cliente ${seq}`, ...extra });
  const falar = (id: string, texto: string) => store.addMensagem({ leadId: id, autor: 'lead', texto, midias: [], waId: '' });
  const ctx = (id: string) => ({ leadId: id, simulado: false });
  const avisosPara = (tel: string) => enviados.filter((e) => e.includes(`→ ${tel}:`)).length;

  logOriginal('\n1) Legado: lead com loja e sem triagem volta para a triagem');
  {
    const l = store.normalizarLeadLegado({ ...novoLead(), lojaSlug: 'v3-automoveis', roteadoEm: undefined, qualificadoEm: null, lojaNotificadaEm: null });
    ok(l.lojaSlug === null && l.lojaSugerida === 'v3-automoveis', 'loja vira lojaSugerida e lojaSlug fica null');
  }

  logOriginal('\n2) Curioso / sem resposta não é roteado');
  {
    const l = novoLead();
    const r = (await executarTool('aprovar_para_roteamento', { motivo: 'teste', resumo: 'x' }, ctx(l.id))) as { ok: boolean; faltando?: string[] };
    ok(!r.ok && r.faltando?.some((f) => f.includes('não respondeu')), 'sem resposta do cliente → negado');
    falar(l.id, 'quanto custa?');
    await executarTool('atualizar_ficha_lead', { categoria: 'suv' }, ctx(l.id));
    const r2 = (await executarTool('aprovar_para_roteamento', { motivo: 'teste', resumo: 'x' }, ctx(l.id))) as { ok: boolean; faltando?: string[] };
    ok(!r2.ok && r2.faltando?.some((f) => f.includes('condição')), 'só interesse, sem condição → negado');
    ok(store.getLead(l.id)!.lojaSlug === null, 'loja_responsavel continua NULL');
    ok(!leadsVisiveis('nenem-autos').some((x) => x.id === l.id), 'nenhuma loja enxerga o lead em triagem');
    ok(enviados.length === 0, 'nenhum aviso enviado');
  }

  logOriginal('\n3) Veículo específico → loja dona do carro, aviso único');
  {
    const l = novoLead({ lojaSugerida: 'manos-veiculos' });
    falar(l.id, `quero o ${carro.titulo}`);
    await executarTool('atualizar_ficha_lead', { veiculos_interesse: [carro.codigo], entrada: 20000, tem_troca: false }, ctx(l.id));
    const tel = store.getSettings().lojaTelefones[carro.lojaSlug]!;
    const antes = avisosPara(tel);
    const r = (await executarTool('aprovar_para_roteamento', { motivo: 'carro + entrada', resumo: 'Quer o carro. Entrada de 20 mil.', codigo_veiculo: carro.codigo }, ctx(l.id))) as { ok: boolean };
    const final = store.getLead(l.id)!;
    ok(r.ok && final.lojaSlug === carro.lojaSlug, `roteado para ${carro.lojaNome} (dona do ${carro.codigo}), não para a loja sugerida`);
    ok(final.roteamentoMotivo === 'veiculo' && Boolean(final.lojaNotificadaEm), 'motivo "veiculo" e flag de notificação gravada');
    ok(avisosPara(tel) === antes + 1, 'loja avisada uma vez');
    const aviso = enviados.filter((e) => e.includes(`→ ${tel}:`)).pop() ?? '';
    ok(aviso.includes(`/admin/conversas?lead=${l.id}`) && aviso.includes(`wa.me/${final.telefone}`), 'aviso traz link do painel e WhatsApp do cliente');
    ok(leadsVisiveis(carro.lojaSlug).some((x) => x.id === l.id), 'lead liberado no painel da loja');
    await executarTool('aprovar_para_roteamento', { motivo: 'de novo', resumo: 'x' }, ctx(l.id));
    ok(avisosPara(tel) === antes + 1, 'segunda aprovação não duplica o aviso');
  }

  logOriginal('\n4) Interesse genérico → rodízio entre lojas com estoque compatível');
  {
    const l = novoLead();
    falar(l.id, 'procuro um SUV até 200 mil, financiado');
    await executarTool('atualizar_ficha_lead', { categoria: 'suv', orcamento: 200000, forma_pagamento: 'financiamento' }, ctx(l.id));
    const cand = lojasCompativeis(store.getLead(l.id)!);
    const d = decidirLoja(store.getLead(l.id)!);
    ok(d.motivo === 'rodizio' && cand.includes(d.loja), `rodízio escolheu ${d.loja} entre [${cand.join(', ')}]`);
    const r = (await executarTool('aprovar_para_roteamento', { motivo: 'suv + orçamento', resumo: 'SUV até 200 mil' }, ctx(l.id))) as { ok: boolean };
    ok(r.ok && store.getLead(l.id)!.lojaSlug === d.loja, 'gravou a loja escolhida pelo rodízio');
  }

  logOriginal('\n5) Lista de espera: regra de match');
  {
    const base = { marca: null, modelo: carro.modelo, categoria: null, anoMinimo: null, precoMaximo: null, cambio: null };
    ok(veiculoAtende({ ...base, precoMaximo: Math.ceil(carro.preco! / TOLERANCIA_PRECO) }, carro), 'preço até +8% do máximo → casa');
    ok(!veiculoAtende({ ...base, precoMaximo: Math.floor(carro.preco! / TOLERANCIA_PRECO) - 500 }, carro), 'preço acima de +8% → não casa');
    const ano = carro.anoModelo ?? carro.anoFabricacao ?? 2000;
    ok(!veiculoAtende({ ...base, anoMinimo: ano + 1 }, carro), 'ano abaixo do mínimo → não casa');
    ok(veiculoAtende({ ...base, modelo: null, categoria: carro.categoria.toLowerCase() }, carro), 'categoria casa sem modelo');
  }

  logOriginal('\n6) Lista de espera → veículo novo → aviso ao cliente → roteamento direto');
  {
    const l = novoLead();
    falar(l.id, `tem ${carro.modelo}?`);
    const cad = (await executarTool('cadastrar_lista_espera', { modelo: carro.modelo, preco_maximo: carro.preco }, ctx(l.id))) as { ok: boolean };
    ok(cad.ok && store.listEspera().some((e) => e.leadId === l.id && e.status === 'aguardando'), 'cadastrado como "aguardando"');
    const ini = await rodarMatchEspera({ ignorarHorario: true });
    ok(ini.status === 'inicializado', '1ª execução só memoriza o estoque (não dispara nada)');
    // simula que o carro acabou de entrar no estoque
    store.saveEsperaControle({ conhecidos: store.getEsperaControle().conhecidos.filter((id) => id !== carro.id) });
    const antes = enviados.length;
    const r = await rodarMatchEspera({ ignorarHorario: true });
    const item = store.listEspera().find((e) => e.leadId === l.id)!;
    ok(r.novosDetectados === 1 && r.notificados.some((n) => n.leadId === l.id), 'veículo novo detectado e cliente avisado');
    ok(item.status === 'notificado' && item.matchedVehicleId === carro.id, 'status "notificado" + matched_vehicle_id');
    ok(enviados.slice(antes).some((e) => e.includes(`→ ${store.getLead(l.id)!.telefone}:`)), 'mensagem saiu para o cliente');
    ok(store.getLead(l.id)!.lojaSlug === null, 'aviso de espera não libera o lead para loja nenhuma');
    const r2 = await rodarMatchEspera({ forcarTodos: true, ignorarHorario: true });
    ok(!r2.notificados.some((n) => n.leadId === l.id), 'anti-spam: mesmo carro não é avisado de novo');

    falar(l.id, 'quero sim, pode reservar!');
    const ap = (await executarTool('aprovar_para_roteamento', { motivo: 'aceitou o carro da lista', resumo: 'Aceitou o carro avisado.', codigo_veiculo: carro.codigo }, ctx(l.id))) as { ok: boolean };
    const final = store.getLead(l.id)!;
    ok(ap.ok && final.lojaSlug === carro.lojaSlug && final.roteamentoMotivo === 'lista_espera', `roteado direto para ${carro.lojaNome} (motivo lista_espera)`);
    ok(store.listEspera().find((e) => e.leadId === l.id)!.status === 'em_atendimento', 'registro da espera → "em_atendimento"');
  }

  logOriginal('\n7) Destino de notificação: grupo do WhatsApp');
  {
    const { destinoAviso } = await import('../src/lib/whatsapp/outbound');
    ok(destinoAviso('120363000000000000@g.us') === '120363000000000000@g.us', 'JID de grupo preservado');
    ok(destinoAviso('(47) 99999-0000') === '47999990000', 'número só com dígitos');
  }

  logOriginal(falhas ? `\n❌ ${falhas} verificação(ões) falharam` : '\n✅ Tudo certo');
  fs.rmSync(process.env.DATA_DIR!, { recursive: true, force: true });
  process.exit(falhas ? 1 : 0);
}

main().catch((e) => {
  logOriginal(e);
  process.exit(1);
});
