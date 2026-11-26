'use client';

import { idDoVisitante, registrarAcao } from './acessos/cliente';
import { buildWhatsappUrl, N8N_WEBHOOK_URL } from './config';
import type { LojaSigla, Veiculo } from './types';

export type LeadTipo =
  | 'lista_vip'
  | 'saida'
  | 'simulacao'
  | 'troca'
  | 'carro'
  | 'loja'
  | 'geral';

export type LeadOrigem =
  | 'hero'
  | 'card'
  | 'simulador'
  | 'troca'
  | 'lojas'
  | 'saida'
  | 'flutuante'
  | 'header';

export interface SimulacaoExtra {
  forma: 'financiamento' | 'avista' | 'troca';
  faixa: string;
  /** valor numérico aproximado da faixa (entrada ou orçamento), quando existir */
  valor?: number | null;
}

export interface TrackingParams {
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
  utm_content: string;
  fbclid: string;
}

export interface WebhookLeadPayload {
  campanha: 'acelerav3';
  tipo: LeadTipo;
  ref: string;
  loja_sigla: LojaSigla | null;
  origem: LeadOrigem;
  veiculo: {
    codigo: string;
    modelo: string;
    ano: string;
    preco: string;
  };
  nome: string;
  whatsapp: string;
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
  utm_content: string;
  fbclid: string;
  sid: string;
  /** Texto exato que o site abre no WhatsApp: o backend casa a 1ª mensagem do cliente com este clique. */
  mensagem: string;
  /** true quando o site vai abrir o WhatsApp logo em seguida (o backend adia as boas-vindas ativas). */
  abre_whatsapp?: boolean;
  /** Escolhas do simulador rápido (opcional, só extensão do payload). */
  simulacao?: SimulacaoExtra;
  pagina: string;
  timestamp_iso: string;
}

const UTM_STORAGE_KEY = 'acelerav3_tracking_params';

/**
 * Identificador anônimo do visitante (cookie av3_vid, 16 caracteres [a-z0-9]).
 * Casa o clique no site com a conversa no WhatsApp e liga o lead à jornada no painel de Acessos.
 */
export function getSid(): string {
  return idDoVisitante();
}

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
    gtag?: (...args: unknown[]) => void;
  }
}

export function persistTrackingParams(): TrackingParams {
  const empty: TrackingParams = {
    utm_source: '',
    utm_medium: '',
    utm_campaign: '',
    utm_content: '',
    fbclid: '',
  };
  if (typeof window === 'undefined') return empty;

  let stored: TrackingParams = { ...empty };
  try {
    const raw = window.sessionStorage.getItem(UTM_STORAGE_KEY);
    if (raw) stored = { ...empty, ...JSON.parse(raw) };
  } catch {
    // ignore storage errors
  }

  const sp = new URLSearchParams(window.location.search);
  const merged: TrackingParams = {
    utm_source: sp.get('utm_source') || stored.utm_source || '',
    utm_medium: sp.get('utm_medium') || stored.utm_medium || '',
    utm_campaign: sp.get('utm_campaign') || stored.utm_campaign || '',
    utm_content: sp.get('utm_content') || stored.utm_content || '',
    fbclid: sp.get('fbclid') || stored.fbclid || '',
  };

  try {
    window.sessionStorage.setItem(UTM_STORAGE_KEY, JSON.stringify(merged));
  } catch {
    // ignore storage errors
  }

  return merged;
}

export function getStoredTrackingParams(): TrackingParams {
  return persistTrackingParams();
}

/**
 * Envia POST fire-and-forget para N8N_WEBHOOK_URL.
 * Falha do webhook NUNCA bloqueia a abertura do WhatsApp.
 */
export function sendLeadWebhook(input: {
  tipo: LeadTipo;
  ref: string;
  loja_sigla: LojaSigla | null;
  origem: LeadOrigem;
  veiculo?: {
    codigo?: string;
    modelo?: string;
    ano?: string;
    preco?: string;
  };
  nome?: string;
  whatsapp?: string;
  mensagem?: string;
  abre_whatsapp?: boolean;
  simulacao?: SimulacaoExtra;
}): WebhookLeadPayload {
  const utms = getStoredTrackingParams();
  const payload: WebhookLeadPayload = {
    campanha: 'acelerav3',
    tipo: input.tipo,
    ref: input.ref,
    loja_sigla: input.loja_sigla,
    origem: input.origem,
    veiculo: {
      codigo: input.veiculo?.codigo || '',
      modelo: input.veiculo?.modelo || '',
      ano: input.veiculo?.ano || '',
      preco: input.veiculo?.preco || '',
    },
    nome: input.nome || '',
    whatsapp: input.whatsapp || '',
    utm_source: utms.utm_source,
    utm_medium: utms.utm_medium,
    utm_campaign: utms.utm_campaign,
    utm_content: utms.utm_content,
    fbclid: utms.fbclid,
    sid: getSid(),
    mensagem: (input.mensagem || '').slice(0, 600),
    ...(input.abre_whatsapp ? { abre_whatsapp: true } : {}),
    ...(input.simulacao ? { simulacao: input.simulacao } : {}),
    pagina: typeof window !== 'undefined' ? window.location.href : '',
    timestamp_iso: new Date().toISOString(),
  };

  if (typeof window !== 'undefined') {
    try {
      // Backend próprio: cria o lead / registra o clique com atribuição (UTM, fbclid, sid)
      void fetch('/api/leads/capture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        keepalive: true,
      }).catch(() => {});
    } catch {
      // nunca bloqueia a UX
    }
  }

  if (typeof window !== 'undefined' && N8N_WEBHOOK_URL) {
    try {
      const body = JSON.stringify(payload);
      // Fire-and-forget: never await or throw
      void fetch(N8N_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive: true,
        mode: 'cors',
      }).catch(() => {
        // Fallback beacon if CORS/network rejects
        try {
          if (navigator.sendBeacon) {
            navigator.sendBeacon(
              N8N_WEBHOOK_URL,
              new Blob([body], { type: 'text/plain;charset=UTF-8' })
            );
          }
        } catch {
          // never block UX
        }
      });
    } catch {
      // never block UX
    }
  }

  return payload;
}

export function trackViewContent(veiculo: Veiculo): void {
  if (typeof window === 'undefined') return;
  try {
    window.fbq?.('track', 'ViewContent', {
      content_name: veiculo.titulo,
      content_ids: [veiculo.codigo],
      content_type: 'vehicle',
      value: veiculo.preco || 0,
      currency: 'BRL',
      loja: veiculo.lojaNome,
    });
    window.gtag?.('event', 'view_item', {
      currency: 'BRL',
      value: veiculo.preco || 0,
      items: [
        {
          item_id: veiculo.codigo,
          item_name: veiculo.titulo,
          item_brand: veiculo.marca,
          item_category: veiculo.categoria,
          affiliation: veiculo.lojaNome,
          price: veiculo.preco || 0,
        },
      ],
    });
  } catch {
    // ignore tracking errors
  }
}

export function trackLeadEvent(params: {
  tipo: LeadTipo;
  ref: string;
  loja_sigla: LojaSigla | null;
  origem: LeadOrigem;
  customEvent?: 'acelerav3_simulacao' | 'acelerav3_troca';
  extra?: Record<string, string | number | undefined>;
}): void {
  if (typeof window === 'undefined') return;
  try {
    window.fbq?.('track', 'Lead', {
      content_name: params.tipo,
      ref: params.ref,
      loja_sigla: params.loja_sigla || 'GERAL',
      origem: params.origem,
      ...params.extra,
    });
    window.gtag?.('event', 'generate_lead', {
      event_category: 'acelerav3',
      event_label: params.ref,
      lead_type: params.tipo,
      loja_sigla: params.loja_sigla || 'GERAL',
      origem: params.origem,
      ...params.extra,
    });

    if (params.customEvent) {
      window.fbq?.('trackCustom', params.customEvent, {
        ref: params.ref,
        origem: params.origem,
        ...params.extra,
      });
      window.gtag?.('event', params.customEvent, {
        ref: params.ref,
        origem: params.origem,
        ...params.extra,
      });
    }
  } catch {
    // ignore tracking errors
  }
}

export function trackContactEvent(params: {
  ref: string;
  loja_sigla: LojaSigla | null;
  origem: LeadOrigem;
  veiculo?: { codigo?: string; modelo?: string; ano?: string; preco?: string };
}): void {
  if (typeof window === 'undefined') return;
  try {
    window.fbq?.('track', 'Contact', {
      ref: params.ref,
      loja_sigla: params.loja_sigla || 'GERAL',
      origem: params.origem,
      veiculo_codigo: params.veiculo?.codigo || '',
      veiculo_modelo: params.veiculo?.modelo || '',
    });
    window.gtag?.('event', 'contact', {
      method: 'whatsapp',
      ref: params.ref,
      loja_sigla: params.loja_sigla || 'GERAL',
      origem: params.origem,
      veiculo_codigo: params.veiculo?.codigo || '',
      veiculo_modelo: params.veiculo?.modelo || '',
    });
  } catch {
    // ignore tracking errors
  }
}

/**
 * Helper unificado: dispara Webhook (fire-and-forget) + Tracking (Pixel/GA4) + abre WhatsApp.
 */
export function triggerWhatsappLead(params: {
  message: string;
  tipo: LeadTipo;
  ref: string;
  loja_sigla: LojaSigla | null;
  origem: LeadOrigem;
  veiculo?: {
    codigo?: string;
    modelo?: string;
    ano?: string;
    preco?: string;
  };
  nome?: string;
  whatsapp?: string;
  customEvent?: 'acelerav3_simulacao' | 'acelerav3_troca';
  isFormLead?: boolean;
  openWindow?: boolean;
  simulacao?: SimulacaoExtra;
}): string {
  sendLeadWebhook({
    simulacao: params.simulacao,
    abre_whatsapp: params.openWindow !== false,
    tipo: params.tipo,
    ref: params.ref,
    loja_sigla: params.loja_sigla,
    origem: params.origem,
    veiculo: params.veiculo,
    nome: params.nome,
    whatsapp: params.whatsapp,
    mensagem: params.message,
  });

  // Telemetria de acessos: o clique vira passo da jornada (e o simulador/avaliação de troca também)
  registrarAcao('whatsapp_click', {
    detalhe: `Clicou no WhatsApp (${params.tipo}) em "${params.origem}"`,
    veiculo_id: params.veiculo?.codigo || null,
    veiculo_nome: params.veiculo?.modelo || null,
  });
  if (params.tipo === 'simulacao') registrarAcao('simulacao', { detalhe: 'Enviou a simulação de financiamento' });
  if (params.tipo === 'troca') {
    registrarAcao('troca', { detalhe: params.veiculo?.modelo ? `Troca: ${params.veiculo.modelo}` : 'Enviou a avaliação do usado' });
  }

  if (params.isFormLead) {
    trackLeadEvent({
      tipo: params.tipo,
      ref: params.ref,
      loja_sigla: params.loja_sigla,
      origem: params.origem,
      customEvent: params.customEvent,
    });
  }

  trackContactEvent({
    ref: params.ref,
    loja_sigla: params.loja_sigla,
    origem: params.origem,
    veiculo: params.veiculo,
  });

  // quem já chamou no WhatsApp não recebe o pedido de saída
  try {
    window.localStorage.setItem('av3_converted', String(Date.now()));
  } catch {
    // ignora
  }
  // Mensagem limpa (sem códigos): a atribuição é feita no backend casando este texto com o clique registrado acima.
  const url = buildWhatsappUrl(params.message);
  if (params.openWindow !== false && typeof window !== 'undefined') {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
  return url;
}

// ───────────────────────── Contato salvo (pré-captura) ─────────────────────────

const CONTATO_KEY = 'av3_contato';

export interface ContatoSalvo {
  nome: string;
  whatsapp: string;
}

/** Quem já deixou nome e WhatsApp não precisa preencher de novo nos próximos cliques. */
export function lerContatoSalvo(): ContatoSalvo | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(CONTATO_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw) as Partial<ContatoSalvo>;
    if (c.nome && c.whatsapp && c.whatsapp.replace(/\D/g, '').length === 11) {
      return { nome: c.nome, whatsapp: c.whatsapp };
    }
  } catch {
    // ignora
  }
  return null;
}

export function salvarContato(c: ContatoSalvo): void {
  try {
    window.localStorage.setItem(CONTATO_KEY, JSON.stringify(c));
  } catch {
    // ignora
  }
}
