'use client';

import { useState } from 'react';
import { ShieldCheck, Sparkles } from 'lucide-react';
import { CAMPAIGN_COPY } from '@/lib/campaign';
import { QuickSimulator, type ResultadoSimulador } from './QuickSimulator';
import { useLeadCapture } from './LeadCaptureProvider';

/** Bloco #simulador da página: o mesmo simulador de 3 passos, sem abrir gaveta. */
export function InlineSimulatorSection() {
  const { enviarSimulacao } = useLeadCapture();
  const [enviando, setEnviando] = useState(false);

  const finalizar = (r: ResultadoSimulador) => {
    setEnviando(true);
    enviarSimulacao(r, { origem: 'simulador' });
    setTimeout(() => setEnviando(false), 1500);
  };

  return (
    <section
      id="simulador"
      className="scroll-mt-20 bg-gradient-to-br from-[#062835] via-[#0B3C4E] to-[#062430] py-10 text-white sm:py-14"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="grid items-center gap-8 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-orange-500/20 px-3 py-1 text-xs font-extrabold uppercase tracking-wider text-orange-300 ring-1 ring-orange-400/30">
              <Sparkles className="h-3.5 w-3.5" />
              Simulação em 3 passos
            </div>
            <h2 className="mt-3 text-2xl font-black italic tracking-tight text-white sm:text-4xl">
              Simule sua condição e saia rodando
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-200 sm:text-base">
              Dois toques e seu contato: nossa equipe consulta as condições reais junto ao{' '}
              <strong>C6 Bank</strong> e à <strong>Viacredi Alto Vale</strong> direto pelo WhatsApp,
              com a 1ª parcela só depois do Carnaval.
            </p>
            <div className="mt-5 flex items-start gap-2.5 rounded-xl border border-white/10 bg-white/[0.06] p-3.5 text-xs text-slate-300">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-orange-400" />
              <span>{CAMPAIGN_COPY.legal}</span>
            </div>
          </div>

          <div className="rounded-2xl border border-white/15 bg-white/[0.07] p-5 shadow-2xl backdrop-blur-sm sm:p-7 lg:col-span-7">
            <QuickSimulator tema="escuro" enviando={enviando} onFinish={finalizar} />
          </div>
        </div>
      </div>
    </section>
  );
}
