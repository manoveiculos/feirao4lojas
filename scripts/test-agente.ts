/**
 * Teste do comportamento do agente no WhatsApp com a rede SIMULADA:
 * Claude, Evolution e OpenAI respondem por um fetch falso; qualquer outro destino é bloqueado.
 * Nada sai para WhatsApp real, banco ou APIs pagas.
 *
 *   npx tsx scripts/test-agente.ts
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.WHATSAPP_PROVIDER = 'evolution';
process.env.EVOLUTION_API_URL = 'https://evo.teste.invalid';
process.env.EVOLUTION_API_KEY = 'chave-falsa';
process.env.EVOLUTION_INSTANCE = 'teste';
process.env.SUPABASE_URL = '';
process.env.NEXT_PUBLIC_SUPABASE_URL = '';
process.env.SUPABASE_SERVICE_ROLE_KEY = '';
process.env.ANTHROPIC_API_KEY = 'chave-falsa';
process.env.OPENAI_API_KEY = 'chave-falsa';
process.env.META_CAPI_TOKEN = '';
process.env.AGENT_DEBOUNCE_MS = '300';
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'av3-agente-'));

const logOriginal = console.log;
console.log = () => {};
let falhas = 0;
const ok = (c: unknown, m: string) => {
  if (c) logOriginal(`  ✔ ${m}`);
  else {
    falhas++;
    logOriginal(`  ✘ ${m}`);
  }
};

// ── rede simulada ──
const enviadosWa: Array<{ numero: string; texto: string }> = [];
let respostasClaude: Array<() => unknown> = [];
let pedidosClaude: Array<{ messages: Array<{ role: string; content: unknown }> }> = [];
let atrasoClaudeMs = 0;
const PNG_1PX = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input);
  const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } });
  if (url.startsWith('https://api.anthropic.com/')) {
    pedidosClaude.push(JSON.parse(String(init?.body)));
    if (atrasoClaudeMs) await new Promise((r) => setTimeout(r, atrasoClaudeMs));
    const prox = respostasClaude.shift();
    return json(prox ? prox() : { stop_reason: 'end_turn', content: [{ type: 'text', text: 'ok' }] });
  }
  if (url.startsWith('https://evo.teste.invalid/message/sendText/')) {
    const b = JSON.parse(String(init?.body));
    enviadosWa.push({ numero: b.number, texto: b.text });
    return json({ key: { id: `wa-${enviadosWa.length}-${Math.random().toString(36).slice(2)}` } });
  }
  if (url.startsWith('https://evo.teste.invalid/message/sendMedia/')) {
    const b = JSON.parse(String(init?.body));
    enviadosWa.push({ numero: b.number, texto: `[foto] ${b.caption}` });
    return json({ key: { id: `wa-m-${enviadosWa.length}` } });
  }
  if (url.startsWith('https://evo.teste.invalid/chat/sendPresence/')) return json({});
  if (url.startsWith('https://evo.teste.invalid/chat/getBase64FromMediaMessage/')) {
    const b = JSON.parse(String(init?.body));
    const audio = Boolean(b.message?.message?.audioMessage);
    return json(audio ? { base64: Buffer.from('OggS-falso').toString('base64'), mimetype: 'audio/ogg; codecs=opus' } : { base64: PNG_1PX, mimetype: 'image/png' });
  }
  if (url === 'https://api.openai.com/v1/audio/transcriptions') return json({ text: 'quero uma strada até cem mil' });
  throw new Error(`[teste] rede bloqueada: ${url}`);
}) as typeof fetch;

const textoClaude = (t: string) => () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: t }] });
const toolClaude = (name: string, input: Record<string, unknown>, textoAntes = '') => () => ({
  stop_reason: 'tool_use',
  content: [...(textoAntes ? [{ type: 'text', text: textoAntes }] : []), { type: 'tool_use', id: `t${Math.random()}`, name, input }],
});

async function main() {
  const store = await import('../src/lib/db/store');
  const { processarEntrada } = await import('../src/lib/agent/inbound');
  const { responderLead } = await import('../src/lib/agent/engine');
  const { textoFollowup } = await import('../src/lib/agent/followup');
  const { loadEstoque } = await import('../src/lib/estoque');
  const { buildVehicleWhatsappMessage } = await import('../src/lib/config');

  store.saveSettings({ gerenteTelefone: '5500000000099', lojaTelefones: { 'nenem-autos': '5500000000011' } });
  const carro = loadEstoque().veiculos.find((v) => v.preco)!;
  let n = 0;
  const tel = () => `55000000${String(2000 + ++n)}`;

  // processa como o webhook: espera o agendamento terminar
  async function chegar(e: Partial<import('../src/lib/whatsapp/provider').Entrada> & { telefone: string }) {
    const pend: Promise<void>[] = [];
    await processarEntrada(
      { tipo: 'mensagem', texto: '', waId: `in-${Math.random()}`, nome: 'Perfil WhatsApp', midia: null, referral: null, ...e },
      (fn) => pend.push(fn())
    );
    return () => Promise.all(pend);
  }

  logOriginal('\n1) Só o texto final sai, em no máx. 2 balões, sem códigos');
  {
    const t = tel();
    respostasClaude = [
      toolClaude('consultar_estoque', { q: 'strada' }, 'Vou verificar no estoque…'),
      textoClaude('Oi! Aqui é a Val 😊 Tenho estas:\n\n• Strada Working 2017, R$ 74.900 (MV-006)\n• Strada Freedom 2025, R$ 91.900 (RA-002 e NA-006)\n\nCom quem eu falo?\n\nParágrafo extra que deveria juntar.'),
    ];
    const antes = enviadosWa.length;
    await (await chegar({ telefone: t, texto: 'tem strada?' }))();
    const saiu = enviadosWa.slice(antes).filter((x) => x.numero === t).map((x) => x.texto);
    ok(!saiu.some((s) => s.includes('Vou verificar')), 'frase solta antes da ferramenta não vira balão');
    ok(saiu.length <= 2, `${saiu.length} balão(ões) enviados (máx. 2)`);
    ok(!saiu.join(' ').match(/(MV|NA|RA|V3)-\d{3}/), 'nenhum código interno no texto do cliente');
  }

  logOriginal('\n2) Mensagens quebradas viram UMA resposta (agrupamento)');
  {
    const t = tel();
    respostasClaude = [textoClaude('Resposta única para tudo.')];
    pedidosClaude = [];
    const antes = enviadosWa.length;
    const f1 = await chegar({ telefone: t, texto: 'oi' });
    const f2 = await chegar({ telefone: t, texto: 'queria ver' });
    const f3 = await chegar({ telefone: t, texto: 'uma strada' });
    await Promise.all([f1(), f2(), f3()]);
    const saiu = enviadosWa.slice(antes).filter((x) => x.numero === t);
    ok(pedidosClaude.length === 1 && saiu.length === 1, `1 chamada ao Claude e 1 resposta (foram ${pedidosClaude.length} e ${saiu.length})`);
    const ultima = pedidosClaude[0]?.messages.at(-1);
    ok(JSON.stringify(ultima).includes('uma strada') && JSON.stringify(ultima).includes('oi'), 'o agente recebeu as 3 mensagens juntas');
  }

  logOriginal('\n3) Mensagem nova durante a geração: descarta e responde de novo a tudo');
  {
    const t = tel();
    const { lead } = (await import('../src/lib/agent/inbound')).obterOuCriarLead(t, { nome: 'X' });
    store.addMensagem({ leadId: lead.id, autor: 'lead', texto: 'tem hilux?', midias: [], waId: '' });
    atrasoClaudeMs = 200;
    respostasClaude = [textoClaude('resposta velha')];
    const p = responderLead(lead.id);
    await new Promise((r) => setTimeout(r, 50));
    store.addMensagem({ leadId: lead.id, autor: 'lead', texto: 'ou sw4', midias: [], waId: '' });
    const r = await p;
    atrasoClaudeMs = 0;
    ok(r.descartada && !enviadosWa.some((x) => x.numero === t), 'resposta atrasada descartada, nada enviado');
  }

  logOriginal('\n4) Foto do cliente chega ao Claude como imagem; áudio chega transcrito');
  {
    const t = tel();
    respostasClaude = [textoClaude('Que foto boa!')];
    pedidosClaude = [];
    await (
      await chegar({
        telefone: t,
        texto: 'esse é meu carro',
        midia: 'imagem',
        midiaFonte: { provedor: 'evolution', mime: 'image/png', base64: '', raw: { key: { id: 'x' }, message: { imageMessage: {} } } },
      })
    )();
    const blocos = JSON.stringify(pedidosClaude[0]?.messages ?? []);
    ok(blocos.includes('"type":"image"') && blocos.includes('esse é meu carro'), 'imagem + legenda enviadas ao Claude');
    const lead = store.findLeadByTelefone(t)!;
    const msg = store.getMensagens(lead.id).find((m) => m.autor === 'lead')!;
    ok(msg.midias[0]?.startsWith('midia:') && msg.midias[0].endsWith('.jpg'), 'foto guardada para o painel');

    respostasClaude = [textoClaude('Anotado!')];
    pedidosClaude = [];
    await (
      await chegar({
        telefone: t,
        midia: 'audio',
        midiaFonte: { provedor: 'evolution', mime: 'audio/ogg', base64: '', raw: { key: { id: 'y' }, message: { audioMessage: {} } } },
      })
    )();
    ok(JSON.stringify(pedidosClaude[0]?.messages ?? []).includes('(áudio transcrito) quero uma strada'), 'áudio transcrito chega ao agente');
  }

  logOriginal('\n5) Site sem código na mensagem: atribuição pelo texto');
  {
    const t = tel();
    const texto = buildVehicleWhatsappMessage(carro);
    ok(!/\[Ref|\[#/.test(texto), 'mensagem do site sem [Ref] nem [#]');
    store.saveClique({
      sid: 'sidteste123',
      ref: `AV3-${carro.codigo}`,
      lojaSigla: null,
      origem: { canal: 'site', ref: `AV3-${carro.codigo}`, sid: 'sidteste123', utm_source: 'facebook', utm_medium: 'cpc', utm_campaign: 'feirao', utm_content: '', fbclid: '', ad_id: '', ctwa_clid: '', ad_headline: '' },
      ts: new Date().toISOString(),
      usado: false,
      mensagem: texto,
    });
    respostasClaude = [textoClaude('Está sim!')];
    await (await chegar({ telefone: t, texto }))();
    const lead = store.findLeadByTelefone(t)!;
    ok(lead.origem.utm_campaign === 'feirao' && lead.origem.canal === 'site', 'UTM e canal recuperados do clique');
    ok(lead.perfil.veiculosInteresse.includes(carro.codigo), 'carro de interesse identificado sem código no texto');
  }

  logOriginal('\n6) Pedido de atendimento humano SEMPRE avisa o admin');
  {
    const t = tel();
    respostasClaude = [toolClaude('transferir_para_humano', { motivo: 'quer falar com vendedor' }), textoClaude('Um consultor já vai falar com você.')];
    const antes = enviadosWa.length;
    await (await chegar({ telefone: t, texto: 'quero falar com uma pessoa' }))();
    ok(enviadosWa.slice(antes).some((x) => x.numero === '5500000000099' && x.texto.includes('ATENDIMENTO HUMANO')), 'admin recebeu o alerta');
  }

  logOriginal('\n7) Mapa só sob pedido; follow-up curto');
  {
    const t = tel();
    respostasClaude = [toolClaude('enviar_convite_feirao', {}), textoClaude('Te mandei o convite!')];
    const antes = enviadosWa.length;
    await (await chegar({ telefone: t, texto: 'como funciona o feirão?' }))();
    ok(!enviadosWa.slice(antes).some((x) => x.texto.includes('google.com/maps')), 'convite sem link do mapa');
    respostasClaude = [toolClaude('enviar_localizacao', {}), textoClaude('Te espero lá!')];
    const antes2 = enviadosWa.length;
    await (await chegar({ telefone: t, texto: 'onde fica?' }))();
    ok(enviadosWa.slice(antes2).some((x) => x.texto.includes('google.com/maps')), 'mapa enviado quando pediu o endereço');
    const lead = store.findLeadByTelefone(t)!;
    const fus = [0, 1, 2].map((e) => textoFollowup(lead, e));
    ok(fus.every((f) => f.length <= 160), `follow-ups curtos (${fus.map((f) => f.length).join(', ')} caracteres)`);
    ok(!fus.join(' ').includes('Perfil WhatsApp'), 'follow-up não usa nome não confirmado');
  }

  logOriginal(falhas ? `\n❌ ${falhas} verificação(ões) falharam` : '\n✅ Tudo certo');
  fs.rmSync(process.env.DATA_DIR!, { recursive: true, force: true });
  process.exit(falhas ? 1 : 0);
}

main().catch((e) => {
  logOriginal(e);
  process.exit(1);
});
