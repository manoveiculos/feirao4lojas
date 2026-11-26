'use client';

import { useState } from 'react';
import { AnimatePresence, LazyMotion, domAnimation, m } from 'motion/react';
import { ArrowLeft, Banknote, CarFront, Landmark } from 'lucide-react';
import { registrarAcao } from '@/lib/acessos/cliente';
import { ContactFields } from './ContactFields';

export type FormaNegocio = 'financiamento' | 'avista' | 'troca';

export interface ResultadoSimulador {
  forma: FormaNegocio;
  faixa: string;
  valor: number | null;
  nome: string;
  whatsapp: string;
}

const FORMAS: { id: FormaNegocio; titulo: string; sub: string; Icone: typeof Landmark }[] = [
  { id: 'financiamento', titulo: 'Financiamento', sub: 'Parcelas que cabem no bolso', Icone: Landmark },
  { id: 'avista', titulo: 'À vista', sub: 'Pagamento direto, sem juros', Icone: Banknote },
  { id: 'troca', titulo: 'Dar carro na troca', sub: 'Avaliamos seu usado na hora', Icone: CarFront },
];

const FAIXAS: Record<FormaNegocio, { pergunta: string; opcoes: { label: string; valor: number | null }[] }> = {
  financiamento: {
    pergunta: 'Qual faixa de entrada você pensa em dar?',
    opcoes: [
      { label: 'Sem entrada', valor: 0 },
      { label: 'Até R$ 10 mil', valor: 10000 },
      { label: 'R$ 10 a 30 mil', valor: 20000 },
      { label: 'Acima de R$ 30 mil', valor: 30000 },
    ],
  },
  avista: {
    pergunta: 'Qual faixa de valor você pretende investir?',
    opcoes: [
      { label: 'Até R$ 50 mil', valor: 50000 },
      { label: 'R$ 50 a 80 mil', valor: 65000 },
      { label: 'R$ 80 a 120 mil', valor: 100000 },
      { label: 'Acima de R$ 120 mil', valor: 120000 },
    ],
  },
  troca: {
    pergunta: 'Qual é o seu objetivo com a troca?',
    opcoes: [
      { label: 'Troca + financiar a diferença', valor: null },
      { label: 'Troca + pagar a diferença à vista', valor: null },
      { label: 'Só avaliar meu carro', valor: null },
      { label: 'Ainda não sei', valor: null },
    ],
  },
};

/**
 * Simulador rápido em 3 passos: forma de negociar → faixa → nome e WhatsApp.
 * Passos 1 e 2 são só toques; a digitação fica para o final.
 */
export function QuickSimulator({
  onFinish,
  enviando,
  formaInicial,
  tema = 'claro',
}: {
  onFinish: (r: ResultadoSimulador) => void;
  enviando: boolean;
  formaInicial?: FormaNegocio;
  tema?: 'claro' | 'escuro';
}) {
  const [passo, setPasso] = useState<1 | 2 | 3>(formaInicial ? 2 : 1);
  const [forma, setForma] = useState<FormaNegocio | null>(formaInicial ?? null);
  const [faixa, setFaixa] = useState<{ label: string; valor: number | null } | null>(null);

  const escuro = tema === 'escuro';
  const botao = escuro
    ? 'border-white/15 bg-white/10 text-white hover:bg-white/20'
    : 'border-slate-200 bg-slate-50 text-slate-900 hover:border-orange-400 hover:bg-orange-50';
  const titulo = escuro ? 'text-white' : 'text-slate-950';
  const apoio = escuro ? 'text-slate-300' : 'text-slate-500';

  const escolherForma = (f: FormaNegocio) => {
    setForma(f);
    setPasso(2);
    registrarAcao('simulacao', { detalhe: `Simulador: passo 1 (${f})` });
  };
  const escolherFaixa = (f: { label: string; valor: number | null }) => {
    setFaixa(f);
    setPasso(3);
    registrarAcao('simulacao', { detalhe: `Simulador: passo 2 (${f.label})` });
  };
  const voltar = () => {
    if (passo === 3) setPasso(2);
    else if (passo === 2) {
      setPasso(1);
      setForma(null);
    }
  };

  return (
    <LazyMotion features={domAnimation}>
      <div>
        <div className="mb-3 flex items-center gap-2">
          {passo > 1 && !(passo === 2 && formaInicial) && (
            <button
              type="button"
              onClick={voltar}
              aria-label="Voltar"
              className={`flex h-8 w-8 items-center justify-center rounded-full transition active:scale-95 cursor-pointer ${escuro ? 'bg-white/10 text-white' : 'bg-slate-100 text-slate-700'}`}
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
          )}
          <div className="flex flex-1 gap-1.5" aria-label={`Passo ${passo} de 3`}>
            {[1, 2, 3].map((n) => (
              <span
                key={n}
                className={`h-1.5 flex-1 rounded-full transition-colors duration-300 ${n <= passo ? 'bg-orange-500' : escuro ? 'bg-white/20' : 'bg-slate-200'}`}
              />
            ))}
          </div>
          <span className={`text-xs font-bold ${apoio}`}>{passo}/3</span>
        </div>

        <AnimatePresence mode="wait" initial={false}>
          <m.div
            key={passo}
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
          >
            {passo === 1 && (
              <>
                <h3 className={`text-base font-extrabold ${titulo}`}>Como pretende negociar?</h3>
                <div className="mt-3 grid gap-2.5">
                  {FORMAS.map(({ id, titulo: t, sub, Icone }) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => escolherForma(id)}
                      className={`flex min-h-[64px] items-center gap-3 rounded-xl border px-4 py-3 text-left transition active:scale-[0.98] cursor-pointer ${botao}`}
                    >
                      <Icone className="h-6 w-6 shrink-0 text-orange-500" />
                      <span>
                        <span className="block text-base font-extrabold">{t}</span>
                        <span className={`block text-xs font-medium ${apoio}`}>{sub}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </>
            )}

            {passo === 2 && forma && (
              <>
                <h3 className={`text-base font-extrabold ${titulo}`}>{FAIXAS[forma].pergunta}</h3>
                <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
                  {FAIXAS[forma].opcoes.map((o) => (
                    <button
                      key={o.label}
                      type="button"
                      onClick={() => escolherFaixa(o)}
                      className={`flex min-h-[56px] items-center rounded-xl border px-4 py-3 text-left text-sm font-extrabold transition active:scale-[0.98] cursor-pointer ${botao}`}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              </>
            )}

            {passo === 3 && forma && faixa && (
              <>
                <h3 className={`text-base font-extrabold ${titulo}`}>Tudo pronto!</h3>
                <p className={`mb-3 mt-1 text-sm ${apoio}`}>
                  Informe seu nome e WhatsApp para receber a condição agora.
                </p>
                <div className={escuro ? 'rounded-2xl bg-white p-4' : ''}>
                  <ContactFields
                    idPrefix={escuro ? 'sim-inline' : 'sim'}
                    cta="Receber minha condição"
                    enviando={enviando}
                    onSubmit={(c) =>
                      onFinish({ forma, faixa: faixa.label, valor: faixa.valor, nome: c.nome, whatsapp: c.whatsapp })
                    }
                  />
                </div>
              </>
            )}
          </m.div>
        </AnimatePresence>
      </div>
    </LazyMotion>
  );
}
