import { FEIRAO_CONFIG, LOJAS_BY_SLUG } from '../config';
import {
  addEspera,
  addEvento,
  getEsperaControle,
  getLead,
  getSettings,
  listEspera,
  saveEsperaControle,
  updateEspera,
  updateLead,
} from '../db/store';
import type { EsperaItem, Lead } from '../db/types';
import { loadEstoque } from '../estoque';
import { isMoto, normalizeSearch } from '../filters';
import type { Veiculo } from '../types';
import { dentroDoHorarioComercial } from '../agent/followup';
import { enviarAvisoInterno, enviarImagem, enviarTexto, marcarProximoFollowup } from '../whatsapp/outbound';

/**
 * Lista de espera inteligente + motor de match com o estoque.
 * - O SDR cadastra o desejo quando consultar_estoque não acha nada compatível.
 * - A cada sincronização do estoque, os veículos NOVOS são cruzados com os registros "aguardando".
 * - Match: (modelo OU categoria) + ano >= ano_minimo + preço <= preco_maximo × 1,08 (+ câmbio/marca, se informados).
 */

export const TOLERANCIA_PRECO = 1.08;
/** Veículo novo detectado fora do horário fica pendente por até 7 dias. */
const VALIDADE_PENDENTE_MS = 7 * 86400_000;

// ───────────────────────── Cadastro ─────────────────────────

export interface DesejoEspera {
  marca?: string | null;
  modelo?: string | null;
  categoria?: string | null;
  anoMinimo?: number | null;
  precoMaximo?: number | null;
  cambio?: 'automatico' | 'manual' | null;
  temTroca?: boolean | null;
  observacoes?: string;
}

const norm = (s: string | null | undefined) => normalizeSearch(s ?? '').replace(/\s+/g, ' ');

/** Cadastra (ou atualiza o registro ativo equivalente do mesmo lead) e volta para "aguardando". */
export function cadastrarEspera(lead: Lead, d: DesejoEspera): { item: EsperaItem; atualizado: boolean } {
  const modelo = d.modelo?.trim() || null;
  const categoria = d.categoria?.trim().toLowerCase() || null;
  if (!modelo && !categoria) throw new Error('Informe pelo menos o modelo ou a categoria desejada.');

  const dados = {
    marca: d.marca?.trim() || null,
    modelo,
    categoria,
    anoMinimo: d.anoMinimo ?? null,
    precoMaximo: d.precoMaximo ?? null,
    cambio: d.cambio ?? null,
    temTroca: d.temTroca ?? lead.perfil.temTroca,
    observacoes: (d.observacoes ?? '').slice(0, 500),
  };

  const ativo = listEspera().find(
    (e) =>
      e.leadId === lead.id &&
      e.status !== 'encerrado' &&
      norm(e.modelo) === norm(modelo) &&
      (modelo ? true : norm(e.categoria) === norm(categoria))
  );
  if (ativo) {
    const item = updateEspera(ativo.id, { ...dados, status: 'aguardando', nome: lead.nome || ativo.nome })!;
    return { item, atualizado: true };
  }

  const item = addEspera({ leadId: lead.id, telefone: lead.telefone, nome: lead.nome, teste: lead.teste, ...dados });
  if (!lead.teste) {
    addEvento({ tipo: 'espera_cadastro', leadId: lead.id, lojaSlug: null, meta: { modelo: modelo ?? '', categoria: categoria ?? '', precoMaximo: dados.precoMaximo } });
  }
  return { item, atualizado: false };
}

// ───────────────────────── Regra de match ─────────────────────────

function cambioDe(v: Veiculo): 'automatico' | 'manual' {
  return /autom|cvt|dsg|dct|tiptronic|aut\b/i.test(`${v.cambio} ${v.versao}`) ? 'automatico' : 'manual';
}

/** O veículo atende ao desejo? (regra pura, testável) */
export function veiculoAtende(item: Pick<EsperaItem, 'marca' | 'modelo' | 'categoria' | 'anoMinimo' | 'precoMaximo' | 'cambio'>, v: Veiculo): boolean {
  if (!v.preco) return false; // preço sob consulta: não dá para garantir o teto do cliente
  const categoria = norm(item.categoria);
  if (isMoto(v) && categoria !== 'moto') return false;

  if (item.precoMaximo && v.preco > item.precoMaximo * TOLERANCIA_PRECO) return false;
  const ano = v.anoModelo ?? v.anoFabricacao;
  if (item.anoMinimo && (ano === null || ano < item.anoMinimo)) return false;
  if (item.cambio && cambioDe(v) !== item.cambio) return false;

  const texto = norm(`${v.marca} ${v.modelo} ${v.titulo} ${v.versao}`);
  if (item.marca && !texto.includes(norm(item.marca))) return false;

  if (item.modelo) {
    // todas as palavras do modelo pedido precisam aparecer (ex.: "hb20s" / "t-cross" / "onix plus")
    const tokens = norm(item.modelo).replace(/-/g, ' ').split(' ').filter((t) => t.length > 1);
    const alvo = texto.replace(/-/g, ' ');
    return tokens.length > 0 && tokens.every((t) => alvo.includes(t));
  }
  return Boolean(categoria) && norm(v.categoria) === categoria;
}

// ───────────────────────── Aviso ao cliente ─────────────────────────

function legendaVeiculo(v: Veiculo): string {
  return (
    `*${v.titulo}* ${v.anoTexto}\n` +
    `💰 ${v.precoFormatado} | 🛣️ ${v.kmFormatado} | ⚙️ ${v.cambio}\n` +
    `🔖 Cód: ${v.codigo} — ${v.lojaNome}\n` +
    `🔗 ${FEIRAO_CONFIG.siteUrl}/?carro=${encodeURIComponent(v.codigo)}`
  );
}

async function avisarMatch(item: EsperaItem, v: Veiculo, lead: Lead): Promise<boolean> {
  const agora = new Date().toISOString();
  const nome = lead.nome ? lead.nome.split(/\s+/)[0] : '';
  let ok = false;

  if (lead.humano) {
    // Um vendedor já atende este cliente: não interrompe a conversa; avisa quem atende.
    const s = getSettings();
    const destino = (lead.lojaSlug && s.lojaTelefones[lead.lojaSlug]) || s.gerenteTelefone;
    ok = destino
      ? await enviarAvisoInterno(
          destino,
          `🎯 *Lista de espera — carro compatível chegou*\n\n👤 ${lead.nome || 'Cliente'} — wa.me/${lead.telefone}\nPediu: ${item.modelo || item.categoria}${item.precoMaximo ? ` até R$ ${item.precoMaximo.toLocaleString('pt-BR')}` : ''}\n\n${legendaVeiculo(v)}\n\n👉 ${FEIRAO_CONFIG.siteUrl}/admin/conversas?lead=${lead.id}`
        )
      : false;
  } else {
    const abertura = `${nome ? `Oi, ${nome}!` : 'Oi!'} Lembra que você pediu pra eu te avisar quando entrasse ${item.modelo ? `um *${item.modelo}*` : `um ${item.categoria}`} no estoque? Acabou de chegar 🚗`;
    const r1 = await enviarTexto(lead, abertura);
    if (!r1.ok) return false;
    const foto = v.fotos[0];
    const r2 = foto ? await enviarImagem(lead, foto, legendaVeiculo(v)) : { ok: false };
    if (!r2.ok) await enviarTexto(lead, legendaVeiculo(v));
    await enviarTexto(lead, 'Quer que eu reserve pra você ver de perto ou prefere que eu mande mais fotos e detalhes?');
    ok = true;

    const atual = getLead(lead.id)!;
    updateLead(lead.id, {
      esperaAviso: { esperaId: item.id, codigo: v.codigo, ts: agora },
      perfil: { ...atual.perfil, veiculosInteresse: [...atual.perfil.veiculosInteresse.filter((c) => c !== v.codigo), v.codigo].slice(-5) },
      followupsEnviados: 0,
      ...(atual.status === 'perdido' ? { status: 'em_atendimento' as const } : {}),
    });
    marcarProximoFollowup(getLead(lead.id)!);
  }

  if (!ok) return false;
  updateEspera(item.id, {
    status: 'notificado',
    matchedVehicleId: v.id,
    matchedCodigo: v.codigo,
    notifiedAt: agora,
    veiculosAvisados: [...new Set([...item.veiculosAvisados, v.id])],
  });
  addEvento({ tipo: 'espera_match', leadId: lead.id, lojaSlug: v.lojaSlug, meta: { esperaId: item.id, codigo: v.codigo, preco: v.preco, humano: lead.humano } });
  return true;
}

// ───────────────────────── Motor ─────────────────────────

export interface ResultadoMatch {
  status: 'ok' | 'inicializado' | 'adiado' | 'sem_novos';
  novosDetectados: number;
  veiculosAnalisados: number;
  aguardando: number;
  notificados: Array<{ esperaId: string; leadId: string; codigo: string; loja: string }>;
  falhas: number;
  motivo?: string;
}

/**
 * Cruza veículos novos do estoque com a lista de espera e avisa os clientes compatíveis.
 * Seguro para rodar a cada minuto (só age quando há veículo novo pendente).
 * - forcarTodos: cruza TODO o estoque atual (admin, "rodar match agora"); o anti-spam continua valendo.
 * - veiculoIds: cruza só estes veículos.
 */
export async function rodarMatchEspera(
  opts: { forcarTodos?: boolean; veiculoIds?: string[]; ignorarHorario?: boolean; agora?: Date } = {}
): Promise<ResultadoMatch> {
  const g = globalThis as unknown as { __feiraoMatch?: Promise<ResultadoMatch> };
  if (g.__feiraoMatch) return g.__feiraoMatch; // uma execução por vez
  g.__feiraoMatch = executar(opts).finally(() => (g.__feiraoMatch = undefined));
  return g.__feiraoMatch;
}

async function executar(opts: { forcarTodos?: boolean; veiculoIds?: string[]; ignorarHorario?: boolean; agora?: Date }): Promise<ResultadoMatch> {
  const agora = opts.agora ?? new Date();
  const estoque = loadEstoque().veiculos;
  const porId = new Map(estoque.map((v) => [v.id, v]));
  const controle = getEsperaControle();
  const aguardando = listEspera().filter((e) => e.status === 'aguardando' && !e.teste);
  const base: ResultadoMatch = { status: 'ok', novosDetectados: 0, veiculosAnalisados: 0, aguardando: aguardando.length, notificados: [], falhas: 0 };

  // 1) Detecta veículos novos (id que não existia na última verificação)
  const conhecidos = new Set(controle.conhecidos);
  if (!conhecidos.size && estoque.length && !opts.forcarTodos && !opts.veiculoIds) {
    // primeira execução: memoriza o estoque atual sem disparar nada
    saveEsperaControle({ conhecidos: [...porId.keys()], pendentes: [], ultimaVerificacao: agora.toISOString() });
    return { ...base, status: 'inicializado', motivo: 'Estoque atual memorizado; os próximos veículos novos serão cruzados.' };
  }
  const novos = estoque.filter((v) => !conhecidos.has(v.id)).map((v) => v.id);
  const pendentesMap = new Map(controle.pendentes.map((p) => [p.id, p.detectadoEm]));
  for (const id of novos) if (!pendentesMap.has(id)) pendentesMap.set(id, agora.toISOString());
  // descarta pendentes vencidos ou que saíram do estoque
  for (const [id, ts] of pendentesMap) if (!porId.has(id) || agora.getTime() - Date.parse(ts) > VALIDADE_PENDENTE_MS) pendentesMap.delete(id);
  base.novosDetectados = novos.length;

  const candidatos: Veiculo[] = opts.forcarTodos
    ? estoque
    : opts.veiculoIds
      ? opts.veiculoIds.map((id) => porId.get(id)).filter((v): v is Veiculo => Boolean(v))
      : [...pendentesMap.keys()].map((id) => porId.get(id)!).filter(Boolean);

  const salvar = (pendentes: Map<string, string>) =>
    saveEsperaControle({
      conhecidos: [...porId.keys()],
      pendentes: [...pendentes.entries()].map(([id, detectadoEm]) => ({ id, detectadoEm })),
      ultimaVerificacao: agora.toISOString(),
    });

  if (!candidatos.length) {
    // nada a cruzar: só grava se o conjunto de veículos mudou (ex.: carro vendido saiu do estoque)
    if (novos.length || pendentesMap.size !== controle.pendentes.length || conhecidos.size !== porId.size) salvar(pendentesMap);
    return { ...base, status: 'sem_novos' };
  }
  const s = getSettings();
  if (!s.agenteLigado || (!opts.ignorarHorario && !dentroDoHorarioComercial(agora))) {
    salvar(pendentesMap); // fica para a próxima janela
    return { ...base, status: 'adiado', veiculosAnalisados: 0, motivo: !s.agenteLigado ? 'Agente desligado.' : 'Fora do horário comercial (8h–20h).' };
  }

  // 2) Cruza: cada lead recebe no máximo UM aviso por execução, nunca o mesmo carro duas vezes
  base.veiculosAnalisados = candidatos.length;
  const leadsAvisados = new Set<string>();
  const ordenados = [...aguardando].sort((a, b) => a.createdAt.localeCompare(b.createdAt)); // quem esperou mais vem primeiro
  for (const item of ordenados) {
    if (leadsAvisados.has(item.leadId)) continue;
    const lead = getLead(item.leadId);
    if (!lead || lead.teste || lead.status === 'optout' || lead.status === 'comprou' || !lead.agenteAtivo) continue;
    const jaAvisadosDoLead = new Set(listEspera().filter((e) => e.leadId === item.leadId).flatMap((e) => e.veiculosAvisados));
    const match = candidatos
      .filter((v) => !jaAvisadosDoLead.has(v.id) && veiculoAtende(item, v))
      .sort((a, b) => (a.preco ?? Infinity) - (b.preco ?? Infinity))[0];
    if (!match) continue;
    const ok = await avisarMatch(item, match, lead).catch((e) => {
      console.error('[espera] falha ao avisar', item.id, e);
      return false;
    });
    if (ok) {
      leadsAvisados.add(item.leadId);
      base.notificados.push({ esperaId: item.id, leadId: item.leadId, codigo: match.codigo, loja: LOJAS_BY_SLUG[match.lojaSlug].nome });
    } else base.falhas++;
  }

  // processados: limpa os pendentes que foram cruzados
  if (!opts.forcarTodos && !opts.veiculoIds) pendentesMap.clear();
  else for (const v of candidatos) pendentesMap.delete(v.id);
  salvar(pendentesMap);
  if (base.notificados.length) console.log(`[espera] ${base.notificados.length} cliente(s) avisado(s) de carro compatível`);
  return base;
}

/**
 * Chamado pelo cron a cada minuto. Compara os IDs do estoque com os já conhecidos, então pega
 * veículo novo venha ele do sync interno, de /api/sync ou de um deploy com data/estoque.json novo.
 */
export async function verificarEsperaNoTick(agora = new Date()): Promise<ResultadoMatch | null> {
  const r = await rodarMatchEspera({ agora });
  return r.status === 'sem_novos' ? null : r;
}

/** Cliente aceitou o carro avisado: registro passa a "em atendimento". */
export function marcarEsperaEmAtendimento(esperaId: string): void {
  const item = listEspera().find((e) => e.id === esperaId);
  if (item && item.status !== 'encerrado') updateEspera(esperaId, { status: 'em_atendimento' });
}
