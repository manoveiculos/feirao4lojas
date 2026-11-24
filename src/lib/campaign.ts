import { TZDate } from '@date-fns/tz';
import { differenceInSeconds } from 'date-fns';
import type { CampaignMode } from './types';

export const CAMPAIGN_TIMEZONE = 'America/Sao_Paulo';

/**
 * Datas oficiais da campanha Acelera V3 no fuso America/Sao_Paulo (BRT / -03:00)
 */
export const CAMPAIGN_START_ISO = '2026-12-14T00:00:00-03:00';
export const CAMPAIGN_END_ISO = '2026-12-23T23:59:59-03:00';
export const LAST_CALL_HOURS = 72; // Últimos 3 dias

/**
 * Constante opcional para simular uma data específica em desenvolvimento.
 * Exemplo: '2026-12-15T10:00:00-03:00' | null para usar a data/hora real.
 * Também é possível simular via URL: ?modo=pre | ?modo=aberto | ?modo=ultimos_dias | ?modo=encerrado | ?data=2026-12-21T15:00
 */
export const SIMULATED_DATE_ISO: string | null = null;

/**
 * Regra de conteúdo: exibir "+100 carros" SOMENTE se o total ativo de carros for >= 100.
 * Caso contrário, exibir "Todo o estoque das 4 lojas".
 */
export const MIN_CARS_FOR_PLUS_100 = 100;

export const CAMPAIGN_COPY = {
  nome: 'ACELERA V3',
  cidade: 'Rio do Sul/SC',
  periodoCurto: '14 a 23 de dezembro',
  selo: 'Último feirão do ano na região',
  tituloPlus100: 'ACELERA V3: +100 carros a pronta entrega',
  tituloFallback: 'ACELERA V3: Todo o estoque das 4 lojas',
  subtitulo:
    'De 14 a 23 de dezembro. Saia rodando na hora, com a 1ª parcela só depois do Carnaval. Taxas especiais C6 Bank e Viacredi Alto Vale.',
  ctaPrincipal: 'Simular e sair rodando',
  ctaSecundario: 'Ver os carros',
  faixaConfianca: [
    'Pronta entrega',
    '1ª parcela depois do Carnaval',
    'Avaliamos seu usado na hora',
  ] as const,
  legal:
    'Condições válidas de 14 a 23/12/2026. Sujeito à análise e aprovação de crédito e à documentação do veículo. Taxas e prazos conforme política de cada instituição.',
  bancosTexto: 'Taxas especiais, sujeitas à análise de crédito',
  encerradoTitulo: 'O Acelera V3 terminou',
  encerradoSubtitulo:
    'Deixe seu contato para receber em primeira mão o aviso e as ofertas do próximo feirão das 4 lojas.',
};

export function getHeroTitle(activeCarsCount: number): string {
  return activeCarsCount >= MIN_CARS_FOR_PLUS_100
    ? CAMPAIGN_COPY.tituloPlus100
    : CAMPAIGN_COPY.tituloFallback;
}

export function getStockHeadlineLabel(activeCarsCount: number): string {
  return activeCarsCount >= MIN_CARS_FOR_PLUS_100
    ? '+100 carros'
    : 'Todo o estoque das 4 lojas';
}

export interface CampaignState {
  mode: CampaignMode;
  isLastCall: boolean;
  nowBrt: TZDate;
  targetDate: TZDate | null;
  secondsRemaining: number;
  days: number;
  hours: number;
  totalHours: number;
  minutes: number;
  seconds: number;
  isSimulated: boolean;
  simulationLabel: string | null;
}

const MODE_PRESET_DATES: Record<string, { iso: string; label: string }> = {
  pre: { iso: '2026-12-10T12:00:00-03:00', label: 'Pré-lançamento (10/12/2026)' },
  pre_lancamento: { iso: '2026-12-10T12:00:00-03:00', label: 'Pré-lançamento (10/12/2026)' },
  aberto: { iso: '2026-12-16T10:00:00-03:00', label: 'Feirão Aberto (16/12/2026)' },
  ultimos_dias: { iso: '2026-12-22T14:00:00-03:00', label: 'Última Chamada (22/12/2026)' },
  ultima_chamada: { iso: '2026-12-22T14:00:00-03:00', label: 'Última Chamada (22/12/2026)' },
  encerrado: { iso: '2026-12-24T10:00:00-03:00', label: 'Encerrado (24/12/2026)' },
};

export function resolveEffectiveDate(
  urlSearchParams?: URLSearchParams | null,
  elapsedMs = 0
): { nowBrt: TZDate; isSimulated: boolean; simulationLabel: string | null } {
  const modoParam = urlSearchParams?.get('modo')?.toLowerCase().trim() || '';
  const dataParam = urlSearchParams?.get('data')?.trim() || '';

  if (modoParam && MODE_PRESET_DATES[modoParam]) {
    const preset = MODE_PRESET_DATES[modoParam];
    const base = new TZDate(preset.iso, CAMPAIGN_TIMEZONE);
    return {
      nowBrt: new TZDate(base.getTime() + elapsedMs, CAMPAIGN_TIMEZONE),
      isSimulated: true,
      simulationLabel: preset.label,
    };
  }

  if (dataParam) {
    const normalized = dataParam.includes('T')
      ? dataParam.match(/[+-]\d{2}:\d{2}|Z$/i)
        ? dataParam
        : `${dataParam}-03:00`
      : `${dataParam}T12:00:00-03:00`;
    const parsed = new TZDate(normalized, CAMPAIGN_TIMEZONE);
    if (!Number.isNaN(parsed.getTime())) {
      return {
        nowBrt: new TZDate(parsed.getTime() + elapsedMs, CAMPAIGN_TIMEZONE),
        isSimulated: true,
        simulationLabel: `Data simulada (${dataParam})`,
      };
    }
  }

  if (SIMULATED_DATE_ISO) {
    const base = new TZDate(SIMULATED_DATE_ISO, CAMPAIGN_TIMEZONE);
    return {
      nowBrt: new TZDate(base.getTime() + elapsedMs, CAMPAIGN_TIMEZONE),
      isSimulated: true,
      simulationLabel: `Constante simulada (${SIMULATED_DATE_ISO})`,
    };
  }

  return {
    nowBrt: new TZDate(new Date(), CAMPAIGN_TIMEZONE),
    isSimulated: false,
    simulationLabel: null,
  };
}

export function getCampaignState(
  nowBrt: TZDate,
  isSimulated = false,
  simulationLabel: string | null = null
): CampaignState {
  const start = new TZDate(CAMPAIGN_START_ISO, CAMPAIGN_TIMEZONE);
  const end = new TZDate(CAMPAIGN_END_ISO, CAMPAIGN_TIMEZONE);

  let mode: CampaignMode;
  let targetDate: TZDate | null = null;
  let isLastCall = false;

  if (nowBrt.getTime() < start.getTime()) {
    mode = 'pre_lancamento';
    targetDate = start;
  } else if (nowBrt.getTime() <= end.getTime()) {
    mode = 'aberto';
    targetDate = end;
    const secsToEnd = Math.max(0, differenceInSeconds(end, nowBrt));
    isLastCall = secsToEnd <= LAST_CALL_HOURS * 3600;
  } else {
    mode = 'encerrado';
    targetDate = null;
  }

  const secondsRemaining = targetDate
    ? Math.max(0, differenceInSeconds(targetDate, nowBrt))
    : 0;

  const days = Math.floor(secondsRemaining / 86400);
  const hours = Math.floor((secondsRemaining % 86400) / 3600);
  const totalHours = Math.floor(secondsRemaining / 3600);
  const minutes = Math.floor((secondsRemaining % 3600) / 60);
  const seconds = secondsRemaining % 60;

  return {
    mode,
    isLastCall,
    nowBrt,
    targetDate,
    secondsRemaining,
    days,
    hours,
    totalHours,
    minutes,
    seconds,
    isSimulated,
    simulationLabel,
  };
}
