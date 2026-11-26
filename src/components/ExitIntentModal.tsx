'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { IMaskInput } from 'react-imask';
import { BellRing, CheckCircle2, X } from 'lucide-react';
import { toast } from 'sonner';
import { registrarAcao } from '@/lib/acessos/cliente';
import { sendLeadWebhook, trackLeadEvent } from '@/lib/tracking';

const SESSION_KEY = 'av3_exit_shown';
const DONE_KEY = 'av3_exit_done';
export const CONVERTED_KEY = 'av3_converted';
const SUPRIMIR_DIAS = 7;

const schema = z
  .object({
    nome: z.string().trim().min(2, 'Informe seu nome'),
    whatsapp: z.string().refine((v) => v.replace(/\D/g, '').length >= 10, 'Informe um WhatsApp válido com DDD'),
    quer: z.enum(['feirao', 'carro']),
    carro: z.string().trim().max(80).optional(),
  })
  .refine((d) => d.quer === 'feirao' || (d.carro ?? '').length >= 2, {
    path: ['carro'],
    message: 'Diga qual carro você procura',
  });

type Valores = z.infer<typeof schema>;

function suprimido(): boolean {
  try {
    if (sessionStorage.getItem(SESSION_KEY)) return true;
    if (localStorage.getItem(CONVERTED_KEY)) return true; // já chamou no WhatsApp
    const done = Number(localStorage.getItem(DONE_KEY) || 0);
    return done > 0 && Date.now() - done < SUPRIMIR_DIAS * 86400_000;
  } catch {
    return false;
  }
}

/**
 * Captura de saída: quando a pessoa vai embora, oferece aviso do feirão ou do carro procurado.
 * - Desktop: mouse sai pelo topo da janela.
 * - Celular: rolagem rápida para cima (sinal de "voltar") ou retorno à aba depois de sair.
 * Aparece no máximo uma vez por sessão e nunca para quem já chamou no WhatsApp ou já se cadastrou.
 */
export function ExitIntentModal({ encerrado }: { encerrado: boolean }) {
  const [aberto, setAberto] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const nomeRef = useRef<HTMLInputElement | null>(null);
  const cartaoRef = useRef<HTMLDivElement | null>(null);

  const {
    register,
    control,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<Valores>({
    resolver: zodResolver(schema),
    defaultValues: { nome: '', whatsapp: '', quer: 'feirao', carro: '' },
  });
  const quer = watch('quer');

  const abrir = useCallback(() => {
    if (suprimido()) return;
    try {
      sessionStorage.setItem(SESSION_KEY, '1');
    } catch {
      /* ignora */
    }
    setAberto(true);
    registrarAcao('popup_saida', { detalhe: 'Viu o pedido de contato ao sair' });
  }, []);

  const fechar = useCallback((registrarRecusa = true) => {
    setAberto(false);
    if (registrarRecusa) {
      try {
        localStorage.setItem(DONE_KEY, String(Date.now()));
      } catch {
        /* ignora */
      }
    }
  }, []);

  // Gatilhos de saída
  useEffect(() => {
    if (suprimido()) return;
    const inicio = Date.now();
    const maduro = () => Date.now() - inicio > 8000; // evita disparar logo na chegada

    const aoSairPeloTopo = (e: MouseEvent) => {
      if (e.clientY <= 0 && !e.relatedTarget && maduro()) abrir();
    };

    let ultimoY = window.scrollY;
    let ultimoT = Date.now();
    let maxY = 0;
    const aoRolar = () => {
      const y = window.scrollY;
      const t = Date.now();
      maxY = Math.max(maxY, y);
      const dy = ultimoY - y;
      const dt = t - ultimoT;
      // subida rápida e longa depois de ter lido a página: intenção de sair/voltar
      if (dy > 220 && dt < 350 && maxY > 900 && maduro() && window.matchMedia('(pointer: coarse)').matches) abrir();
      ultimoY = y;
      ultimoT = t;
    };

    let saiuEm = 0;
    const aoMudarVisibilidade = () => {
      if (document.visibilityState === 'hidden') saiuEm = Date.now();
      else if (saiuEm && Date.now() - saiuEm > 2500 && maduro() && window.matchMedia('(pointer: coarse)').matches) abrir();
    };

    document.addEventListener('mouseout', aoSairPeloTopo);
    window.addEventListener('scroll', aoRolar, { passive: true });
    document.addEventListener('visibilitychange', aoMudarVisibilidade);
    return () => {
      document.removeEventListener('mouseout', aoSairPeloTopo);
      window.removeEventListener('scroll', aoRolar);
      document.removeEventListener('visibilitychange', aoMudarVisibilidade);
    };
  }, [abrir]);

  // Foco, Esc e bloqueio de rolagem enquanto aberto
  useEffect(() => {
    if (!aberto) return;
    const anterior = document.activeElement as HTMLElement | null;
    const t = setTimeout(() => nomeRef.current?.focus(), 50);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') fechar();
      if (e.key === 'Tab' && cartaoRef.current) {
        const itens = cartaoRef.current.querySelectorAll<HTMLElement>('button, input, [href]');
        const primeiro = itens[0];
        const ultimo = itens[itens.length - 1];
        if (e.shiftKey && document.activeElement === primeiro) {
          e.preventDefault();
          ultimo.focus();
        } else if (!e.shiftKey && document.activeElement === ultimo) {
          e.preventDefault();
          primeiro.focus();
        }
      }
    };
    document.addEventListener('keydown', aoTeclar);
    return () => {
      clearTimeout(t);
      document.body.style.overflow = overflow;
      document.removeEventListener('keydown', aoTeclar);
      anterior?.focus?.();
    };
  }, [aberto, fechar]);

  const onSubmit = (d: Valores) => {
    const carro = d.quer === 'carro' ? (d.carro ?? '').trim() : '';
    sendLeadWebhook({
      tipo: 'saida',
      ref: 'AV3-SAIDA',
      loja_sigla: null,
      origem: 'saida',
      veiculo: { codigo: '', modelo: carro ? `Interesse: ${carro}` : '', ano: '', preco: '' },
      nome: d.nome,
      whatsapp: d.whatsapp,
    });
    registrarAcao('lead_formulario', { detalhe: carro ? `Deixou contato (procura: ${carro})` : 'Deixou contato para ser avisado do feirão' });
    trackLeadEvent({ tipo: 'saida', ref: 'AV3-SAIDA', loja_sigla: null, origem: 'saida', extra: { interesse: carro || 'feirao' } });
    try {
      localStorage.setItem(DONE_KEY, String(Date.now()));
    } catch {
      /* ignora */
    }
    setEnviado(true);
    toast.success('Pronto! Você vai receber uma mensagem no WhatsApp em instantes.');
  };

  if (!aberto) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-4" onClick={() => fechar()}>
      <div
        ref={cartaoRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="exit-titulo"
        onClick={(e) => e.stopPropagation()}
        className="relative max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-3xl border border-orange-400/30 bg-[#06232E] p-5 text-left text-white shadow-2xl sm:rounded-3xl sm:p-7"
      >
        <button
          type="button"
          onClick={() => fechar()}
          aria-label="Fechar"
          className="absolute right-3 top-3 rounded-full p-2 text-slate-300 transition hover:bg-white/10 hover:text-white cursor-pointer"
        >
          <X className="h-5 w-5" />
        </button>

        {enviado ? (
          <div className="py-4 text-center">
            <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-400" aria-hidden="true" />
            <h2 id="exit-titulo" className="mt-3 text-2xl font-extrabold">Tudo certo!</h2>
            <p className="mt-2 text-sm text-slate-300">
              Chamamos você no WhatsApp agora com as melhores opções. Pode continuar navegando.
            </p>
            <button
              type="button"
              onClick={() => fechar(false)}
              className="mt-5 h-12 w-full rounded-xl bg-orange-500 font-extrabold uppercase tracking-wide text-white transition hover:bg-orange-600 cursor-pointer"
            >
              Continuar no site
            </button>
          </div>
        ) : (
          <>
            <div className="inline-flex items-center gap-1.5 rounded-full bg-orange-500/20 px-3 py-1 text-[11px] font-extrabold uppercase tracking-wider text-orange-300 ring-1 ring-orange-400/30">
              <BellRing className="h-3.5 w-3.5" aria-hidden="true" />
              {encerrado ? 'Próximo feirão' : 'Antes de ir embora'}
            </div>
            <h2 id="exit-titulo" className="mt-3 text-2xl font-black italic leading-tight sm:text-3xl">
              {encerrado ? 'Avise-me do próximo feirão' : 'Não perca o feirão nem o seu carro'}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-300">
              Deixe seu nome e WhatsApp e receba o aviso do Acelera V3 ou do carro que você procura, com as melhores condições.
            </p>

            <form onSubmit={handleSubmit(onSubmit)} noValidate className="mt-4 space-y-3">
              <div>
                <label htmlFor="exit-nome" className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-slate-300">Seu nome</label>
                <input
                  id="exit-nome"
                  type="text"
                  autoComplete="name"
                  placeholder="Ex: Carlos Silva"
                  {...register('nome')}
                  ref={(el) => {
                    register('nome').ref(el);
                    nomeRef.current = el;
                  }}
                  className="h-12 w-full rounded-xl border border-white/15 bg-white/10 px-3.5 text-base text-white placeholder-slate-400 focus:border-orange-400 focus:outline-none"
                />
                {errors.nome && <p className="mt-1 text-xs font-semibold text-orange-300" role="alert">{errors.nome.message}</p>}
              </div>

              <div>
                <label htmlFor="exit-whatsapp" className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-slate-300">WhatsApp</label>
                <Controller
                  name="whatsapp"
                  control={control}
                  render={({ field }) => (
                    <IMaskInput
                      id="exit-whatsapp"
                      mask="(00) 00000-0000"
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel"
                      placeholder="(47) 99999-9999"
                      value={field.value}
                      onAccept={(v) => field.onChange(String(v))}
                      onBlur={field.onBlur}
                      className="h-12 w-full rounded-xl border border-white/15 bg-white/10 px-3.5 text-base text-white placeholder-slate-400 focus:border-orange-400 focus:outline-none"
                    />
                  )}
                />
                {errors.whatsapp && <p className="mt-1 text-xs font-semibold text-orange-300" role="alert">{errors.whatsapp.message}</p>}
              </div>

              <fieldset>
                <legend className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-300">Quero ser avisado sobre</legend>
                <Controller
                  name="quer"
                  control={control}
                  render={({ field }) => (
                    <div className="grid grid-cols-2 gap-2">
                      {([['feirao', 'O feirão'], ['carro', 'Um carro específico']] as const).map(([v, l]) => (
                        <button
                          key={v}
                          type="button"
                          aria-pressed={field.value === v}
                          onClick={() => field.onChange(v)}
                          className={`min-h-11 rounded-xl px-3 py-2 text-sm font-bold transition cursor-pointer ${
                            field.value === v ? 'bg-orange-500 text-white' : 'border border-white/15 bg-white/5 text-slate-200 hover:bg-white/15'
                          }`}
                        >
                          {l}
                        </button>
                      ))}
                    </div>
                  )}
                />
              </fieldset>

              {quer === 'carro' && (
                <div>
                  <label htmlFor="exit-carro" className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-slate-300">Qual carro você procura?</label>
                  <input
                    id="exit-carro"
                    type="text"
                    placeholder="Ex: SUV automático até 120 mil"
                    {...register('carro')}
                    className="h-12 w-full rounded-xl border border-white/15 bg-white/10 px-3.5 text-base text-white placeholder-slate-400 focus:border-orange-400 focus:outline-none"
                  />
                  {errors.carro && <p className="mt-1 text-xs font-semibold text-orange-300" role="alert">{errors.carro.message}</p>}
                </div>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                className="flex min-h-[52px] w-full items-center justify-center rounded-xl bg-orange-500 px-5 py-3 text-base font-extrabold uppercase tracking-wide text-white shadow-lg shadow-orange-600/30 transition hover:bg-orange-600 active:scale-[0.98] disabled:opacity-60 cursor-pointer"
              >
                Quero ser avisado
              </button>
              <button type="button" onClick={() => fechar()} className="w-full py-1 text-sm font-semibold text-slate-400 underline underline-offset-4 hover:text-slate-200 cursor-pointer">
                Não, obrigado
              </button>
              <p className="text-[11px] leading-relaxed text-slate-400">
                Ao enviar, você aceita receber mensagens no WhatsApp sobre o Acelera V3 e seus carros de interesse. Para sair, responda “parar”.{' '}
                <a href="/privacidade" target="_blank" className="underline underline-offset-2 hover:text-slate-200">Política de privacidade</a>.
              </p>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
