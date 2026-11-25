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
  updateLead,
} from '../db/store';
import type { Lead, Origem } from '../db/types';
import { origemVazia } from '../db/types';
import { enviarTexto, sleep } from '../whatsapp/outbound';
import type { Entrada } from '../whatsapp/provider';
import { responderLead } from './engine';

const DEBOUNCE_MS = Number(process.env.AGENT_DEBOUNCE_MS || 5000);

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
  const { ref, sid, limpo } = extrairRefESid(e.texto);
  const texto =
    limpo ||
    (e.midia === 'audio' ? '[áudio]' : e.midia === 'imagem' ? '[imagem]' : e.midia ? `[${e.midia}]` : '');
  if (!texto) return;

  const existente = findLeadByTelefone(e.telefone);
  let lead: Lead;
  let novo = false;

  if (existente) {
    lead = existente;
  } else {
    const clique = sid ? takeClique(sid) : undefined;
    const origem: Origem = {
      ...(clique?.origem ?? origemVazia()),
      canal: e.referral ? 'anuncio_ctwa' : clique ? 'site' : 'whatsapp_direto',
      ref: ref || clique?.ref || '',
      sid: sid || clique?.sid || '',
      ad_id: e.referral?.ad_id ?? '',
      ctwa_clid: e.referral?.ctwa_clid ?? '',
      ad_headline: e.referral?.headline ?? '',
    };
    const criado = obterOuCriarLead(e.telefone, { nome: e.nome, origem });
    lead = criado.lead;
    novo = criado.novo;
  }

  const patch: Partial<Lead> = { ...aplicarRef(lead, ref) };
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

  const msg = addMensagem({ leadId: lead.id, autor: 'lead', texto, midias: [], waId: e.waId });
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

  // ── Debounce: espera o cliente terminar de digitar e responde uma única vez ──
  agendar(async () => {
    await sleep(DEBOUNCE_MS);
    const msgs = getMensagens(lead.id);
    const ultima = msgs[msgs.length - 1];
    if (!ultima || ultima.id !== msg.id) return; // chegou mensagem mais nova; ela cuida da resposta
    const l = getLead(lead.id)!;
    if (l.humano || !l.agenteAtivo) return;
    await responderLead(lead.id);
  });
}
