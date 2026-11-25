/**
 * Teste da sincronização entre instâncias (incidente de 25/11/2026: duas instâncias no ar durante
 * o deploy, uma desfez o roteamento e ignorou a pausa do painel feita na outra).
 *
 * O código real é a instância "A". A instância "B" é simulada gravando direto num banco PostgREST
 * FALSO em memória. Claude e Evolution também são falsos; qualquer outro destino de rede é bloqueado.
 *
 *   npx tsx scripts/test-sync.ts
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.SUPABASE_URL = 'https://db.teste.invalid';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'chave-falsa';
process.env.WHATSAPP_PROVIDER = 'evolution';
process.env.EVOLUTION_API_URL = 'https://evo.teste.invalid';
process.env.EVOLUTION_API_KEY = 'x';
process.env.EVOLUTION_INSTANCE = 'teste';
process.env.ANTHROPIC_API_KEY = 'x';
process.env.OPENAI_API_KEY = '';
process.env.META_CAPI_TOKEN = '';
process.env.AGENT_DEBOUNCE_MS = '200';
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'av3-sync-'));

const logOriginal = console.log;
console.log = () => {};
console.warn = () => {};
let falhas = 0;
const ok = (c: unknown, m: string) => {
  if (c) logOriginal(`  ✔ ${m}`);
  else {
    falhas++;
    logOriginal(`  ✘ ${m}`);
  }
};

// ── banco falso (PostgREST mínimo) ──
type Linha = Record<string, unknown>;
const db: Record<string, Linha[]> = { av3_leads: [], av3_mensagens: [], av3_eventos: [], av3_settings: [], av3_cliques: [], av3_lista_espera: [], av3_instancias: [], av3_lojas: [] };
const chave: Record<string, string> = { av3_leads: 'id', av3_mensagens: 'id', av3_eventos: 'id', av3_settings: 'id', av3_cliques: 'sid', av3_lista_espera: 'id', av3_instancias: 'id', av3_lojas: 'slug' };

function filtrar(linhas: Linha[], qs: URLSearchParams): Linha[] {
  let out = linhas;
  for (const [k, v] of qs) {
    if (['select', 'order', 'limit', 'on_conflict'].includes(k)) continue;
    const [op, ...resto] = v.split('.');
    const val = resto.join('.');
    if (op === 'eq') out = out.filter((l) => String(l[k]) === val);
    if (op === 'gte') out = out.filter((l) => String(l[k]) >= val);
    if (op === 'in') {
      const lista = val.replace(/^\(|\)$/g, '').split(',');
      out = out.filter((l) => lista.includes(String(l[k])));
    }
  }
  const ord = qs.get('order');
  if (ord) {
    const [campo, dir] = ord.split(',')[0].split('.');
    out = [...out].sort((a, b) => (String(a[campo]) < String(b[campo]) ? -1 : String(a[campo]) > String(b[campo]) ? 1 : 0) * (dir === 'desc' ? -1 : 1));
  }
  const lim = Number(qs.get('limit') || 0);
  return lim ? out.slice(0, lim) : out;
}

const enviadosWa: Array<{ numero: string; texto: string }> = [];
let respostasClaude: Array<() => unknown> = [];
let chamadasClaude = 0;

globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = new URL(String(input instanceof Request ? input.url : input));
  const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } });
  if (url.host === 'db.teste.invalid') {
    const tabela = url.pathname.replace('/rest/v1/', '');
    const linhas = db[tabela];
    if (!linhas) return json({ message: `tabela ${tabela}` }, 404);
    const metodo = init?.method ?? 'GET';
    if (metodo === 'GET') return json(filtrar(linhas, url.searchParams));
    if (metodo === 'POST') {
      const novas = JSON.parse(String(init?.body)) as Linha[];
      const ignorar = String((init?.headers as Record<string, string>)?.Prefer ?? '').includes('ignore-duplicates');
      for (const n of novas) {
        const i = linhas.findIndex((l) => l[chave[tabela]] === n[chave[tabela]]);
        if (i < 0) linhas.push(n);
        else if (!ignorar) linhas[i] = { ...linhas[i], ...n };
      }
      return new Response(null, { status: 201 });
    }
    if (metodo === 'DELETE') return new Response(null, { status: 204 });
  }
  if (url.host === 'api.anthropic.com') {
    chamadasClaude++;
    const prox = respostasClaude.shift();
    return json(prox ? prox() : { stop_reason: 'end_turn', content: [{ type: 'text', text: 'ok' }] });
  }
  if (url.host === 'evo.teste.invalid') {
    if (url.pathname.includes('/message/send')) {
      const b = JSON.parse(String(init?.body));
      enviadosWa.push({ numero: b.number, texto: b.text ?? b.caption ?? '' });
      return json({ key: { id: `wa-${enviadosWa.length}-${Math.random().toString(36).slice(2)}` } });
    }
    return json({});
  }
  throw new Error(`[teste] rede bloqueada: ${url}`);
}) as typeof fetch;

const agoraIso = (deltaMs = 0) => new Date(Date.now() + deltaMs).toISOString();
const texto = (t: string) => () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: t }] });

/** Grava um lead "da instância B" no banco falso. */
function gravarDeB(lead: Record<string, unknown>) {
  const dados = { ...lead, instancia: 'inst-b' };
  const i = db.av3_leads.findIndex((l) => l.id === lead.id);
  const linha = { id: lead.id, telefone: lead.telefone, loja_slug: lead.lojaSlug ?? null, atualizado_em: lead.atualizadoEm, criado_em: lead.criadoEm, dados };
  if (i < 0) db.av3_leads.push(linha);
  else db.av3_leads[i] = linha;
}

async function main() {
  const store = await import('../src/lib/db/store');
  const { esvaziarFila, INSTANCIA } = await import('../src/lib/db/remote');
  const sync = await import('../src/lib/db/sync');
  const { processarEntrada } = await import('../src/lib/agent/inbound');

  async function chegar(telefone: string, msg: string) {
    const pend: Promise<void>[] = [];
    await processarEntrada(
      { tipo: 'mensagem', telefone, texto: msg, waId: `in-${Math.random()}`, nome: 'Cliente', midia: null, referral: null },
      (fn) => pend.push(fn())
    );
    await Promise.all(pend);
  }

  logOriginal('\n1) Lead criado pela instância B: A não cria duplicado ao receber a mensagem');
  {
    const base = store.createLead({ telefone: '5547900000001', nome: 'Base' }); // só para ter o formato completo
    const idB = '11111111-1111-4111-8111-111111111111';
    const leadB = { ...base, id: idB, telefone: '5547900000002', nome: 'Cliente B', criadoEm: agoraIso(-60_000), atualizadoEm: agoraIso(-30_000) };
    gravarDeB(leadB);
    respostasClaude = [texto('Oi! Aqui é a Val.')];
    await chegar('5547900000002', 'oi, ainda tem?');
    const local = store.findLeadByTelefone('5547900000002');
    ok(local?.id === idB, 'A usou o lead que B criou (mesmo id), sem criar outro');
  }

  logOriginal('\n2) Painel pausou o agente na instância B: A não responde o cliente');
  {
    const idB = '11111111-1111-4111-8111-111111111111';
    const atual = store.getLead(idB)!;
    gravarDeB({ ...atual, humano: true, humanoMotivo: 'Loja respondeu pelo painel', atualizadoEm: agoraIso(5_000) });
    const chamadasAntes = chamadasClaude;
    const enviadosAntes = enviadosWa.length;
    await chegar('5547900000002', 'alguém aí?');
    ok(store.getLead(idB)!.humano === true, 'A trouxe a pausa (humano=true) do banco');
    ok(chamadasClaude === chamadasAntes && enviadosWa.length === enviadosAntes, 'agente não respondeu');
  }

  logOriginal('\n3) B roteou o lead; A, com cópia velha, não desfaz o roteamento ao gravar');
  {
    const lead = store.createLead({ telefone: '5547900000003', nome: 'Cliente C' });
    await esvaziarFila();
    gravarDeB({ ...lead, lojaSlug: 'rosa-automoveis', roteadoEm: agoraIso(), roteamentoMotivo: 'veiculo', lojaNotificadaEm: agoraIso(), atualizadoEm: agoraIso(5_000) });
    const r = await sync.puxarDoBanco();
    ok(r.leads >= 1 && store.getLead(lead.id)!.lojaSlug === 'rosa-automoveis', 'leitura periódica trouxe o roteamento');
    store.updateLead(lead.id, { notas: 'anotação feita em A' });
    await esvaziarFila();
    const noBanco = db.av3_leads.find((l) => l.id === lead.id)!.dados as Record<string, unknown>;
    ok(noBanco.lojaSlug === 'rosa-automoveis' && noBanco.notas === 'anotação feita em A', 'banco ficou com o roteamento E a anotação');
    ok(noBanco.instancia === INSTANCIA.id, 'gravação marcada com a instância A');
  }

  logOriginal('\n4) Cópia mais velha no banco não sobrescreve a mais nova em memória');
  {
    const lead = store.createLead({ telefone: '5547900000004', nome: 'Cliente D' });
    store.updateLead(lead.id, { notas: 'nova' });
    gravarDeB({ ...lead, notas: 'velha', atualizadoEm: agoraIso(-3_600_000) });
    await sync.sincronizarLead(lead.id);
    ok(store.getLead(lead.id)!.notas === 'nova', 'versão local mais nova foi mantida');
  }

  logOriginal('\n5) Mensagens gravadas por B entram na conversa de A, sem duplicar');
  {
    const lead = store.createLead({ telefone: '5547900000005', nome: 'Cliente E' });
    await esvaziarFila();
    const m = { id: '22222222-2222-4222-8222-222222222222', lead_id: lead.id, autor: 'humano', texto: 'Oi, sou da loja', midias: [], wa_id: 'wa-b-1', ts: agoraIso() };
    db.av3_mensagens.push(m);
    await sync.sincronizarLead(lead.id);
    await sync.sincronizarLead(lead.id);
    const msgs = store.getMensagens(lead.id).filter((x) => x.id === m.id);
    ok(msgs.length === 1, 'mensagem de B aparece uma vez só');
  }

  logOriginal('\n6) Líder: só a instância mais nova viva roda as tarefas automáticas');
  {
    const g = globalThis as unknown as { __feiraoSync?: { liderVerificadoEm: number } };
    db.av3_instancias.push({ id: 'inst-b', iniciada_em: agoraIso(60_000), visto_em: agoraIso() });
    if (g.__feiraoSync) g.__feiraoSync.liderVerificadoEm = 0;
    ok((await sync.souLider()) === false, 'com B (mais nova) viva, A não é líder');
    db.av3_instancias.find((i) => i.id === 'inst-b')!.visto_em = agoraIso(-120_000);
    if (g.__feiraoSync) g.__feiraoSync.liderVerificadoEm = 0;
    ok((await sync.souLider()) === true, 'B parou de bater: A assume');
  }

  logOriginal('\n7) Agente ligado/desligado em B chega em A');
  {
    db.av3_settings = [{ id: 1, dados: { ...store.getSettings(), agenteLigado: false, atualizadoEm: agoraIso(10_000) }, atualizado_em: agoraIso(10_000) }];
    await sync.puxarDoBanco();
    ok(store.getSettings().agenteLigado === false, 'desligamento feito em B vale em A');
  }

  logOriginal(falhas ? `\n❌ ${falhas} verificação(ões) falharam` : '\n✅ Tudo certo');
  fs.rmSync(process.env.DATA_DIR!, { recursive: true, force: true });
  process.exit(falhas ? 1 : 0);
}

main().catch((e) => {
  logOriginal(e);
  process.exit(1);
});
