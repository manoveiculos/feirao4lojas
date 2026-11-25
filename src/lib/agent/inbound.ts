import { getSiglaFromCodigo, LOJAS } from '../config';
import {
  addEvento,
  addMensagem,
  createLead,
  findLeadByTelefone,
  getLead,
  getMensagens,
  getSettings,
  jaProcessouWaId,
  normalizarTelefone,
  takeClique,
  takeCliquePorMensagem,
  updateLead,
} from '../db/store';
import type { Lead, Origem } from '../db/types';
import { origemVazia } from '../db/types';
import { loadEstoque } from '../estoque';
import { processarMidiaRecebida } from '../whatsapp/midia';
import { enviarTexto, sleep } from '../whatsapp/outbound';
import type { Entrada } from '../whatsapp/provider';
import { responderLead } from './engine';

const RE_REF = /\[Ref:\s*(AV3-[A-Z0-9-]+)\]/i;
const RE_SID = /\[#([a-z0-9]{6,16})\]/i;
const RE_OPTOUT =
  /^\s*(parar|pare|sair|stop|descadastrar|cancelar|remover)\b|n[aã]o quero (mais )?receber|me (tire|tira|remova|remove) da lista|para de me (mandar|enviar)|n[aã]o (me )?mande mais/i;

export function extrairRefESid(texto: string): { ref: string; sid: string; limpo: string } {
  const ref = texto.match(RE_REF)?.[1]?.toUpperCase() ?? '';
  const sid = texto.match(RE_SID)?.[1] ?? '';
  const limpo = texto.replace(RE_SID, '').replace(/\s{2,}/g, ' ').trim();
  return { ref, sid, limpo };
}

/** Aplica o que o código de referência diz sobre o interesse do lead. */
function aplicarRef(lead: Lead, ref: string): Partial<Lead> {
  const m = ref.match(/^AV3-([A-Z0-9]{2}-\d{3})$/);
  const patch: Partial<Lead> = {};
  if (m) {
    const codigo = m[1];
    if (!lead.perfil.veiculosInteresse.includes(codigo)) {
      patch.perfil = { ...lead.perfil, veiculosInteresse: [...lead.perfil.veiculosInteresse, codigo].slice(-5) };
    }
    const sigla = getSiglaFromCodigo(codigo);
    const loja = LOJAS.find((l) => l.sigla === sigla);
    // só uma pista: a loja responsável é definida pelo Agente Roteador depois da triagem
    if (loja && !lead.lojaSugerida && !lead.roteadoEm) patch.lojaSugerida = loja.slug;
  }
  const l = ref.match(/^AV3-LOJA-(MV|NA|RA|V3)$/);
  if (l && !lead.roteadoEm) {
    const loja = LOJAS.find((x) => x.sigla === l[1]);
    if (loja) patch.lojaSugerida = loja.slug;
  }
  return patch;
}

/** Cria (ou localiza) o lead a partir de um telefone. */
export function obterOuCriarLead(telefone: string, base: Partial<Lead> = {}): { lead: Lead; novo: boolean } {
  const existente = findLeadByTelefone(telefone);
  if (existente) return { lead: existente, novo: false };
  const lead = createLead({ telefone: normalizarTelefone(telefone), ...base });
  addEvento({ tipo: 'lead_criado', leadId: lead.id, lojaSlug: lead.lojaSlug, meta: { canal: lead.origem.canal } });
  return { lead, novo: true };
}

/** Processa uma entrada vinda do webhook do WhatsApp. */
export async function processarEntrada(e: Entrada, agendar: (fn: () => Promise<void>) => void): Promise<void> {
  if (!e.telefone) return;
  if (e.waId && jaProcessouWaId(e.waId)) return;

  // ── Mensagem enviada por um humano pelo celular da loja ──
  if (e.tipo === 'eco_humano') {
    await sleep(1500); // dá tempo de o nosso próprio envio registrar o waId
    if (e.waId && jaProcessouWaId(e.waId)) return;
    const lead = findLeadByTelefone(e.telefone);
    if (!lead) return;
    addMensagem({ leadId: lead.id, autor: 'humano', texto: e.texto || '[mídia]', midias: [], waId: e.waId });
    updateLead(lead.id, {
      humano: true,
      humanoMotivo: 'Atendente respondeu pelo WhatsApp da loja',
      proximoFollowupEm: null,
    });
    return;
  }

  // ── Mensagem do cliente ──
  // Mensagens antigas do site ainda podem trazer [Ref:…]/[#…]; as novas chegam limpas e casam pelo texto.
  const { ref: refTexto, sid, limpo } = extrairRefESid(e.texto);
  const marcador = e.midia === 'audio' ? '[áudio]' : e.midia === 'imagem' ? '[imagem]' : e.midia ? `[${e.midia}]` : '';
  if (!limpo && !marcador) return;
  if (e.waId) {
    if (emProcesso.has(e.waId)) return; // webhook repetido enquanto a mídia baixa
    emProcesso.add(e.waId);
  }

  try {
    await processarMensagemCliente(e, refTexto, sid, limpo, marcador, agendar);
  } finally {
    if (e.waId) emProcesso.delete(e.waId);
  }
}

const emProcesso = new Set<string>();

async function processarMensagemCliente(
  e: Entrada,
  refTexto: string,
  sid: string,
  limpo: string,
  marcador: string,
  agendar: (fn: () => Promise<void>) => void
): Promise<void> {
  const existente = findLeadByTelefone(e.telefone);
  let lead: Lead;
  let novo = false;

  // clique do site que abriu esta mensagem (pelo sid antigo ou pelo texto idêntico)
  const clique = sid ? takeClique(sid) : limpo ? takeCliquePorMensagem(limpo) : undefined;
  const ref = refTexto || clique?.ref || '';

  if (existente) {
    lead = existente;
  } else {
    const origem: Origem = {
      ...(clique?.origem ?? origemVazia()),
      canal: e.referral ? 'anuncio_ctwa' : clique ? 'site' : 'whatsapp_direto',
      ref,
      sid: sid || clique?.sid || '',
      ad_id: e.referral?.ad_id ?? '',
      ctwa_clid: e.referral?.ctwa_clid ?? '',
      ad_headline: e.referral?.headline ?? '',
    };
    const criado = obterOuCriarLead(e.telefone, { nome: e.nome, origem });
    lead = criado.lead;
    novo = criado.novo;
  }

  // ── Foto/áudio: baixa, guarda, transcreve (áudio) e o agente passa a enxergar a foto ──
  let texto = limpo || marcador;
  const midias: string[] = [];
  if ((e.midia === 'imagem' || e.midia === 'audio') && e.midiaFonte) {
    const m = await processarMidiaRecebida(lead.id, e.waId, e.midia, e.midiaFonte, limpo);
    texto = m.texto;
    if (m.ref) midias.push(m.ref);
  }

  const patch: Partial<Lead> = { ...aplicarRef(lead, ref) };
  // sem código: reconhece o carro pelo nome/ano que o site escreve na mensagem
  if (!ref && limpo) {
    const v = veiculoCitado(limpo);
    if (v && !lead.perfil.veiculosInteresse.includes(v.codigo)) {
      patch.perfil = { ...(patch.perfil ?? lead.perfil), veiculosInteresse: [...lead.perfil.veiculosInteresse, v.codigo].slice(-5) };
      if (!lead.roteadoEm && !lead.lojaSugerida) patch.lojaSugerida = v.lojaSlug;
    }
  }
  if (!lead.nome && e.nome) patch.nome = e.nome;
  if (lead.status === 'perdido') patch.status = 'em_atendimento';
  // cliente voltou a falar: zera a cadência de follow-up
  patch.followupsEnviados = 0;
  patch.proximoFollowupEm = null;
  // anúncio CTWA em lead já existente: registra o anúncio mais recente
  if (e.referral && !lead.origem.ad_id) {
    patch.origem = { ...lead.origem, ad_id: e.referral.ad_id, ctwa_clid: e.referral.ctwa_clid, ad_headline: e.referral.headline };
  }
  updateLead(lead.id, patch);

  const msg = addMensagem({ leadId: lead.id, autor: 'lead', texto, midias, waId: e.waId });
  if (getMensagens(lead.id).filter((m) => m.autor === 'lead').length === 1) {
    addEvento({ tipo: 'primeira_resposta', leadId: lead.id, lojaSlug: lead.lojaSlug, meta: { canal: lead.origem.canal } });
  }
  void novo;

  // ── Opt-out (LGPD / boa prática) ──
  if (RE_OPTOUT.test(texto)) {
    updateLead(lead.id, { status: 'optout', optoutEm: new Date().toISOString(), proximoFollowupEm: null, agenteAtivo: false });
    addEvento({ tipo: 'optout', leadId: lead.id, lojaSlug: lead.lojaSlug, meta: {} });
    await enviarTexto(getLead(lead.id)!, 'Tudo bem! Não vou mais te enviar mensagens. Se precisar de algo no futuro, é só chamar. Obrigado pelo contato! 🙏');
    return;
  }

  const atual = getLead(lead.id)!;
  if (!getSettings().agenteLigado || !atual.agenteAtivo || atual.humano || atual.status === 'optout') return;

  // ── Agrupamento: espera o cliente terminar de digitar e responde UMA vez a tudo ──
  agendar(async () => {
    await sleep(debounceMs());
    if (ultimaDoCliente(lead.id) !== msg.id) return; // chegou mensagem mais nova; ela cuida da resposta
    await rodarAgenteAgrupado(lead.id);
  });
}

const debounceMs = () => Number(process.env.AGENT_DEBOUNCE_MS || 8000);

function ultimaDoCliente(leadId: string): string | undefined {
  const msgs = getMensagens(leadId);
  for (let i = msgs.length - 1; i >= 0; i--) if (msgs[i].autor === 'lead') return msgs[i].id;
  return undefined;
}

/**
 * Uma geração por lead de cada vez. Se o cliente mandar algo enquanto o agente pensa,
 * a resposta em preparo é descartada (engine) e o agente roda de novo com tudo junto.
 */
const g = globalThis as unknown as { __feiraoAgenteEmCurso?: Map<string, boolean> };
const emCurso = (g.__feiraoAgenteEmCurso ??= new Map<string, boolean>());

async function rodarAgenteAgrupado(leadId: string): Promise<void> {
  if (emCurso.has(leadId)) {
    emCurso.set(leadId, true); // marca para refazer quando a geração atual terminar
    return;
  }
  emCurso.set(leadId, false);
  try {
    for (let rodada = 0; rodada < 3; rodada++) {
      const l = getLead(leadId);
      if (!l || l.humano || !l.agenteAtivo || l.status === 'optout' || !getSettings().agenteLigado) return;
      const r = await responderLead(leadId);
      const refazer = emCurso.get(leadId) || r.descartada;
      emCurso.set(leadId, false);
      if (!refazer) return;
      await sleep(debounceMs()); // deixa o cliente terminar a nova rajada
    }
  } finally {
    emCurso.delete(leadId);
  }
}

/** Reconhece "Vi o {titulo} {ano}" (texto que o site gera) no estoque. */
function veiculoCitado(texto: string) {
  const n = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ');
  const t = n(texto);
  if (!/\bvi o\b|\binteresse\b|disponivel/.test(t)) return undefined;
  const achados = loadEstoque().veiculos.filter((v) => t.includes(n(`${v.titulo} ${v.anoTexto}`)));
  return achados.length === 1 ? achados[0] : undefined;
}
