'use client';

import { Flame, Timer } from 'lucide-react';
import type { CampaignState } from '@/lib/campaign';

const pad = (n: number) => String(Math.max(0, Math.floor(n))).padStart(2, '0');

/**
 * Contagem regressiva em tela grande: é o elemento central do hero.
 * Antes de 14/12 conta até a abertura; durante o feirão, até o encerramento (urgência real).
 */
export function HeroCountdown({ state, compacto = false }: { state: CampaignState; compacto?: boolean }) {
  if (state.mode === 'encerrado') return null;

  // Versão discreta de uma linha: o contador gigante só entra nos últimos 3 dias, quando a urgência é real
  if (compacto && !state.isLastCall) {
    const rotulo = state.mode === 'pre_lancamento' ? 'Abre em' : 'Termina em';
    const partes = `${state.days}d ${pad(state.hours)}h ${pad(state.minutes)}m ${pad(state.seconds)}s`;
    return (
      <p
        role="timer"
        aria-label={`${rotulo} ${state.days} dias e ${state.hours} horas`}
        className="mt-3 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3.5 py-1.5 text-xs font-bold text-slate-100 backdrop-blur-md sm:text-sm"
      >
        <Timer className="h-4 w-4 text-orange-300" aria-hidden="true" />
        {rotulo}
        <span className="font-mono tabular-nums text-white" aria-hidden="true">{partes}</span>
      </p>
    );
  }

  const antes = state.mode === 'pre_lancamento';
  const ultima = state.isLastCall;
  const titulo = antes
    ? 'O feirão começa em'
    : ultima
      ? 'Última chamada: o feirão encerra em'
      : 'O feirão está aberto e termina em';

  const unidades: Array<[string, string]> = ultima
    ? [
        [pad(state.totalHours), 'horas'],
        [pad(state.minutes), 'minutos'],
        [pad(state.seconds), 'segundos'],
      ]
    : [
        [pad(state.days), 'dias'],
        [pad(state.hours), 'horas'],
        [pad(state.minutes), 'minutos'],
        [pad(state.seconds), 'segundos'],
      ];

  return (
    <div className="mx-auto mt-4 w-full max-w-3xl sm:mt-7" role="timer" aria-label={`${titulo} ${state.days} dias e ${state.hours} horas`}>
      <p
        className={`mb-2 inline-flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-[0.14em] sm:mb-3 sm:gap-2 sm:text-sm sm:tracking-[0.18em] ${
          ultima ? 'text-amber-300' : 'text-orange-300'
        }`}
      >
        {ultima ? <Flame className="h-4 w-4" aria-hidden="true" /> : <Timer className="h-4 w-4" aria-hidden="true" />}
        {titulo}
      </p>

      <div className="flex items-stretch justify-center gap-1 sm:gap-4" aria-hidden="true">
        {unidades.map(([valor, rotulo], i) => (
          <div key={rotulo} className="flex items-center gap-1 sm:gap-4">
            <div
              className={`flex min-w-[3.4rem] flex-col items-center rounded-xl border px-1.5 py-2 sm:rounded-2xl shadow-2xl backdrop-blur-md sm:min-w-[7.5rem] sm:px-4 sm:py-5 ${
                ultima
                  ? 'border-amber-300/40 bg-gradient-to-b from-orange-600/90 to-orange-700/90'
                  : 'border-white/15 bg-gradient-to-b from-white/15 to-white/5'
              }`}
            >
              <span className="font-mono text-[1.9rem] font-black leading-none tabular-nums text-white sm:text-7xl lg:text-8xl">
                {valor}
              </span>
              <span className="mt-1 text-[9px] font-bold uppercase tracking-wider text-slate-200 sm:text-xs">{rotulo}</span>
            </div>
            {i < unidades.length - 1 && (
              <span className="text-xl font-black text-orange-400 sm:text-5xl">:</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
