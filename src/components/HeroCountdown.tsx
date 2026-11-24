'use client';

import { Flame, Timer } from 'lucide-react';
import type { CampaignState } from '@/lib/campaign';

const pad = (n: number) => String(Math.max(0, Math.floor(n))).padStart(2, '0');

/**
 * Contagem regressiva em tela grande: é o elemento central do hero.
 * Antes de 14/12 conta até a abertura; durante o feirão, até o encerramento (urgência real).
 */
export function HeroCountdown({ state }: { state: CampaignState }) {
  if (state.mode === 'encerrado') return null;

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
    <div className="mx-auto mt-7 w-full max-w-3xl" role="timer" aria-label={`${titulo} ${state.days} dias e ${state.hours} horas`}>
      <p
        className={`mb-3 inline-flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.18em] sm:text-sm ${
          ultima ? 'text-amber-300' : 'text-orange-300'
        }`}
      >
        {ultima ? <Flame className="h-4 w-4" aria-hidden="true" /> : <Timer className="h-4 w-4" aria-hidden="true" />}
        {titulo}
      </p>

      <div className="flex items-stretch justify-center gap-2 sm:gap-4" aria-hidden="true">
        {unidades.map(([valor, rotulo], i) => (
          <div key={rotulo} className="flex items-center gap-2 sm:gap-4">
            <div
              className={`flex min-w-[4.2rem] flex-col items-center rounded-2xl border px-2 py-3 shadow-2xl backdrop-blur-md sm:min-w-[7.5rem] sm:px-4 sm:py-5 ${
                ultima
                  ? 'border-amber-300/40 bg-gradient-to-b from-orange-600/90 to-orange-700/90'
                  : 'border-white/15 bg-gradient-to-b from-white/15 to-white/5'
              }`}
            >
              <span className="font-mono text-[2.6rem] font-black leading-none tabular-nums text-white sm:text-7xl lg:text-8xl">
                {valor}
              </span>
              <span className="mt-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-200 sm:text-xs">{rotulo}</span>
            </div>
            {i < unidades.length - 1 && (
              <span className="text-3xl font-black text-orange-400 sm:text-5xl">:</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
