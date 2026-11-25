import type { LojaSigla, LojaSlug } from '../types';

export type LeadStatus =
  | 'novo'
  | 'em_atendimento'
  | 'qualificado'
  | 'visita_agendada'
  | 'visitou'
  | 'comprou'
  | 'perdido'
  | 'optout';

export type Temperatura = 'frio' | 'morno' | 'quente';

export interface Origem {
  /** Canal que trouxe o lead */
  canal: 'site' | 'whatsapp_direto' | 'anuncio_ctwa' | 'lista_vip' | 'saida_site' | 'outro';
  ref: string;
  sid: string;
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
  utm_content: string;
  fbclid: string;
  /** Click-to-WhatsApp: id do anúncio e do clique */
  ad_id: string;
  ctwa_clid: string;
  ad_headline: string;
}

export interface Perfil {
  veiculosInteresse: string[]; // códigos NA-001...
  categoria: string | null; // suv, sedan, hatch, picape...
  marca_modelo: string | null;
  orcamento: number | null; // valor total que quer pagar
  entrada: number | null;
  parcelaDesejada: number | null;
  formaPagamento: 'financiamento' | 'avista' | 'consorcio' | null;
  temTroca: boolean | null;
  trocaModelo: string | null;
  trocaAno: string | null;
  trocaKm: string | null;
  prazoCompra: 'imediato' | 'ate_7_dias' | 'ate_30_dias' | 'mais_30_dias' | null;
  nomeConfirmado: boolean;
  cidade: string | null;
  observacoes: string | null;
}

export interface Visita {
  quando: string | null; // texto amigável, ex: "terça 16/12 às 10h30"
  iso: string | null; // ISO 8601 quando o horário é exato
  confirmada: boolean;
  lojaSlug: LojaSlug | null;
}

export interface Lead {
  id: string;
  /** Somente dígitos, formato 55DDDNUMERO. Chave de identidade. */
  telefone: string;
  nome: string;
  status: LeadStatus;
  score: number; // 0-100
  temperatura: Temperatura;
  /**
   * Loja responsável (coluna loja_slug no banco = "loja_responsavel").
   * Só é preenchida pelo Agente Roteador, DEPOIS da triagem do SDR. Enquanto o lead está
   * em triagem fica null e nenhuma loja vê ou é avisada.
   */
  lojaSlug: LojaSlug | null;
  /** Pista de loja vinda da origem (ref do site, formulário de uma loja). Não dá acesso à loja. */
  lojaSugerida?: LojaSlug | null;
  /** Quando o Agente Roteador atribuiu a loja (liberou o lead no painel dela). */
  roteadoEm?: string | null;
  /** Por que/como foi roteado: veiculo | loja_escolhida | rodizio | admin | lista_espera */
  roteamentoMotivo?: string;
  /** Aviso de lista de espera enviado ao cliente e ainda sem resposta (contexto para o SDR). */
  esperaAviso?: { esperaId: string; codigo: string; ts: string } | null;
  origem: Origem;
  perfil: Perfil;
  visita: Visita;
  resumo: string; // resumo gerado pelo agente para a loja
  notas: string; // anotações humanas
  /** Agente pausado: loja assumiu a conversa */
  humano: boolean;
  humanoMotivo: string;
  agenteAtivo: boolean;
  /** Controle de follow-up */
  followupsEnviados: number;
  proximoFollowupEm: string | null;
  optoutEm: string | null;
  qualificadoEm: string | null;
  lojaNotificadaEm: string | null;
  conviteEnviadoEm: string | null;
  criadoEm: string;
  atualizadoEm: string;
  ultimaMensagemEm: string | null;
  ultimaMensagemLeadEm: string | null;
  naoLidas: number;
  totalMensagensLead: number;
  /** Lead criado pelo simulador do admin: fora de métricas e notificações. */
  teste?: boolean;
}

export type MensagemAutor = 'lead' | 'agente' | 'humano' | 'sistema';

export interface Mensagem {
  id: string;
  leadId: string;
  autor: MensagemAutor;
  texto: string;
  midias: string[];
  /** id da mensagem no WhatsApp (dedupe e eco) */
  waId: string;
  ts: string;
}

export type EventoTipo =
  | 'site_click_whatsapp'
  | 'site_form'
  | 'lead_criado'
  | 'primeira_resposta'
  | 'qualificado'
  | 'visita_agendada'
  | 'handoff_humano'
  | 'fotos_enviadas'
  | 'convite_enviado'
  | 'followup'
  | 'lembrete_visita'
  | 'optout'
  | 'lead_status'
  | 'roteado'
  | 'espera_cadastro'
  | 'espera_match';

export interface Evento {
  id: string;
  tipo: EventoTipo;
  leadId: string | null;
  lojaSlug: LojaSlug | null;
  meta: Record<string, string | number | boolean | null>;
  ts: string;
}

/** Clique no site (sem telefone) guardado para atribuição quando a mensagem chegar. */
export interface Clique {
  sid: string;
  ref: string;
  lojaSigla: LojaSigla | null;
  origem: Origem;
  ts: string;
  usado: boolean;
}

export interface Settings {
  agenteLigado: boolean;
  /** Mensagem proativa para quem deixa o WhatsApp no site */
  boasVindasProativas: boolean;
  followupsAtivos: boolean;
  maxFollowups: number;
  /** Horas de espera para cada follow-up */
  followupHoras: number[];
  modelo: string;
  instrucoesExtras: string;
  /** Telefones (55DDD...) que recebem aviso de lead qualificado, por loja */
  lojaTelefones: Partial<Record<LojaSlug, string>>;
  /** Telefone do gerente geral: recebe todos os qualificados */
  gerenteTelefone: string;
  scoreQualificado: number;
  atualizadoEm: string;
}

// ───────────────────────── Lista de espera ─────────────────────────

export type EsperaStatus = 'aguardando' | 'notificado' | 'em_atendimento' | 'encerrado';

/** Desejo de compra que o estoque atual não atende (tabela av3_lista_espera). */
export interface EsperaItem {
  id: string;
  leadId: string;
  telefone: string;
  nome: string;
  marca: string | null;
  modelo: string | null;
  categoria: string | null;
  anoMinimo: number | null;
  precoMaximo: number | null;
  cambio: 'automatico' | 'manual' | null;
  temTroca: boolean | null;
  observacoes: string;
  status: EsperaStatus;
  matchedVehicleId: string | null;
  matchedCodigo: string | null;
  /** IDs de veículos já avisados para este registro (anti-spam: nunca o mesmo carro duas vezes). */
  veiculosAvisados: string[];
  createdAt: string;
  notifiedAt: string | null;
  atualizadoEm: string;
  teste?: boolean;
}

/** Controle do motor de match: quais veículos já foram vistos e quais novos aguardam processamento. */
export interface EsperaControle {
  /** IDs do estoque já conhecidos (para detectar veículo novo após cada sincronização). */
  conhecidos: string[];
  /** Veículos novos detectados e ainda não cruzados (ex.: chegaram fora do horário comercial). */
  pendentes: Array<{ id: string; detectadoEm: string }>;
  ultimaVerificacao: string | null;
}

export const SETTINGS_PADRAO: Settings = {
  agenteLigado: true,
  boasVindasProativas: true,
  followupsAtivos: true,
  maxFollowups: 3,
  followupHoras: [2, 24, 72],
  modelo: 'claude-sonnet-5-5',
  instrucoesExtras: '',
  lojaTelefones: {},
  gerenteTelefone: '',
  scoreQualificado: 60,
  atualizadoEm: new Date(0).toISOString(),
};

export function perfilVazio(): Perfil {
  return {
    veiculosInteresse: [],
    categoria: null,
    marca_modelo: null,
    orcamento: null,
    entrada: null,
    parcelaDesejada: null,
    formaPagamento: null,
    temTroca: null,
    trocaModelo: null,
    trocaAno: null,
    trocaKm: null,
    prazoCompra: null,
    nomeConfirmado: false,
    cidade: null,
    observacoes: null,
  };
}

export function origemVazia(): Origem {
  return {
    canal: 'outro',
    ref: '',
    sid: '',
    utm_source: '',
    utm_medium: '',
    utm_campaign: '',
    utm_content: '',
    fbclid: '',
    ad_id: '',
    ctwa_clid: '',
    ad_headline: '',
  };
}
