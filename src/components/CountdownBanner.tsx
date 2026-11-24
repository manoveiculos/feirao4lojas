'use client';

import { Clock, Flame, Sparkles } from 'lucide-react';
import type { CampaignState } from '@/lib/campaign';

function pad(n: number): string {
  return String(Math.max(0, Math.floor(n))).padStart(2, '0');
}

export function CountdownBanner({ state }: { state: CampaignState }) {
  if (state.mode === 'encerrado') {
    return (
      <div className="border-b border-white/10 bg-[#051F29] px-4 py-2 text-center text-xs font-semibold text-slate-200">
        <span>O Acelera V3 terminou. Cadastre-se abaixo para ser avisado do próximo feirão.</span>
        {state.isSimulated && state.simulationLabel && (
          <SimBadge label={state.simulationLabel} />
        )}
      </div>
    );
  }

  if (state.mode === 'pre_lancamento') {
    return (
      <div className="border-b border-orange-400/30 bg-gradient-to-r from-[#072B38] via-[#0B3C4E] to-[#072B38] px-3 py-2 text-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-3 gap-y-1 text-center text-xs sm:text-sm">
          <span className="inline-flex items-center gap-1.5 font-extrabold uppercase italic tracking-wide text-orange-400">
            <Sparkles className="h-3.5 w-3.5" />
            Pré-lançamento ACELERA V3
          </span>
          <span className="text-slate-200">Começa em:</span>
          <div className="inline-flex items-center gap-1 font-mono text-xs font-extrabold sm:text-sm">
            <TimeBox value={`${state.days}d`} />
            <span className="text-orange-400">:</span>
            <TimeBox value={`${pad(state.hours)}h`} />
            <span className="text-orange-400">:</span>
            <TimeBox value={`${pad(state.minutes)}m`} />
            <span className="text-orange-400">:</span>
            <TimeBox value={`${pad(state.seconds)}s`} />
          </div>
          <a
            href="#lista-vip"
            className="rounded-full bg-orange-500 px-3 py-0.5 text-[11px] font-extrabold text-white transition hover:bg-orange-600"
          >
            Entrar na lista VIP
          </a>
          {state.isSimulated && state.simulationLabel && (
            <SimBadge label={state.simulationLabel} />
          )}
        </div>
      </div>
    );
  }

  // Modo ABERTO (normal ou últimos 3 dias = Última chamada em horas)
  if (state.isLastCall) {
    return (
      <div className="border-b border-orange-300/40 bg-gradient-to-r from-orange-600 via-orange-500 to-amber-500 px-3 py-2 text-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-3 gap-y-1 text-center text-xs sm:text-sm">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-950/25 px-2.5 py-0.5 font-extrabold uppercase italic tracking-wide">
            <Flame className="h-3.5 w-3.5" />
            Última chamada
          </span>
          <span className="font-bold">
            O Acelera V3 encerra em:
          </span>
          <div className="inline-flex items-center gap-1 font-mono text-xs font-extrabold sm:text-sm">
            <TimeBox dark value={`${pad(state.totalHours)}h`} />
            <span>:</span>
            <TimeBox dark value={`${pad(state.minutes)}m`} />
            <span>:</span>
            <TimeBox dark value={`${pad(state.seconds)}s`} />
          </div>
          {state.isSimulated && state.simulationLabel && (
            <SimBadge label={state.simulationLabel} />
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="border-b border-teal-400/20 bg-[#05232E] px-3 py-2 text-white">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-3 gap-y-1 text-center text-xs sm:text-sm">
        <span className="inline-flex items-center gap-1.5 font-extrabold uppercase italic tracking-wide text-orange-400">
          <Clock className="h-3.5 w-3.5" />
          ACELERA V3 AO VIVO
        </span>
        <span className="text-slate-200">Ofertas válidas até 23/12 — restam:</span>
        <div className="inline-flex items-center gap-1 font-mono text-xs font-extrabold sm:text-sm">
          <TimeBox value={`${state.days}d`} />
          <span className="text-orange-400">:</span>
          <TimeBox value={`${pad(state.hours)}h`} />
          <span className="text-orange-400">:</span>
          <TimeBox value={`${pad(state.minutes)}m`} />
          <span className="text-orange-400">:</span>
          <TimeBox value={`${pad(state.seconds)}s`} />
        </div>
        {state.isSimulated && state.simulationLabel && (
          <SimBadge label={state.simulationLabel} />
        )}
      </div>
    </div>
  );
}

function TimeBox({ value, dark = false }: { value: string; dark?: boolean }) {
  return (
    <span
      className={`rounded-md px-1.5 py-0.5 ${
        dark ? 'bg-slate-950/35 text-white' : 'bg-white/10 text-white'
      }`}
    >
      {value}
    </span>
  );
}

function SimBadge({ label }: { label: string }) {
  return (
    <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-black/40 px-2 py-0.5 text-[10px] font-semibold text-amber-200">
      [{label}]
    </span>
  );
}
