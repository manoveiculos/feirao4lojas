'use client';

import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { IMaskInput } from 'react-imask';
import { RefreshCw } from 'lucide-react';
import { buildTradeInWhatsappMessage } from '@/lib/config';
import { useLeadCapture } from './lead/LeadCaptureProvider';
import { WhatsappIcon } from './WhatsappIcon';

const tradeInSchema = z.object({
  modelo: z.string().trim().min(2, 'Informe o modelo do seu carro'),
  ano: z
    .string()
    .trim()
    .regex(/^(19|20)\d{2}$/, 'Informe o ano com 4 dígitos (ex: 2021)'),
  km: z.string().trim().min(1, 'Informe a quilometragem aproximada'),
});

type TradeInFormValues = z.infer<typeof tradeInSchema>;

export function TradeInSection() {
  const { abrirCaptura } = useLeadCapture();
  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<TradeInFormValues>({
    resolver: zodResolver(tradeInSchema),
    defaultValues: {
      modelo: '',
      ano: '',
      km: '',
    },
  });

  const onSubmit = (data: TradeInFormValues) => {
    const message = buildTradeInWhatsappMessage({
      modelo: data.modelo,
      ano: data.ano,
    });

    abrirCaptura({
      titulo: 'Avaliar meu carro',
      descricao: `${data.modelo} ${data.ano}. Deixe seu contato e avaliamos seu usado na hora pelo WhatsApp.`,
      cta: 'Avaliar meu carro',
      message,
      tipo: 'troca',
      ref: 'AV3-TROCA',
      loja_sigla: null,
      origem: 'troca',
      veiculo: {
        codigo: '',
        modelo: `${data.modelo} (${data.km} km)`,
        ano: data.ano,
        preco: '',
      },
      customEvent: 'acelerav3_troca',
    });
  };

  return (
    <section
      id="troca"
      className="scroll-mt-20 py-10 sm:py-12"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="overflow-hidden rounded-3xl bg-gradient-to-r from-[#062835] via-[#0B3C4E] to-[#0E4D63] p-6 text-white shadow-xl sm:p-10">
          <div className="grid items-center gap-6 lg:grid-cols-12 lg:gap-8">
            <div className="lg:col-span-5">
              <div className="inline-flex items-center gap-1.5 rounded-full bg-orange-500/20 px-3 py-1 text-xs font-extrabold uppercase tracking-wider text-orange-300 ring-1 ring-orange-400/30">
                <RefreshCw className="h-3.5 w-3.5" />
                Troca Facilitada
              </div>
              <h2 className="mt-3 text-2xl font-black italic tracking-tight text-white sm:text-3xl">
                Seu usado vale mais
              </h2>
              <p className="mt-2.5 text-sm leading-relaxed text-slate-200 sm:text-base">
                Quer usar seu carro atual como parte do pagamento no ACELERA V3?
                Informe modelo, ano e quilometragem e avaliamos seu usado na hora
                pelo WhatsApp.
              </p>
            </div>

            <form
              onSubmit={handleSubmit(onSubmit)}
              className="rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur-md sm:p-5 lg:col-span-7"
              noValidate
            >
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-12">
                <div className="sm:col-span-6">
                  <label
                    htmlFor="troca-modelo"
                    className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-slate-200"
                  >
                    Modelo do seu carro
                  </label>
                  <input
                    id="troca-modelo"
                    type="text"
                    placeholder="Ex: Onix LT 1.0"
                    {...register('modelo')}
                    className="h-12 w-full rounded-xl border border-white/20 bg-slate-950/40 px-3.5 text-base text-white placeholder-slate-400 focus:border-orange-400 focus:outline-none sm:text-sm"
                  />
                  {errors.modelo && (
                    <p className="mt-1 text-xs font-semibold text-orange-300">
                      {errors.modelo.message}
                    </p>
                  )}
                </div>

                <div className="sm:col-span-3">
                  <label
                    htmlFor="troca-ano"
                    className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-slate-200"
                  >
                    Ano
                  </label>
                  <Controller
                    name="ano"
                    control={control}
                    render={({ field }) => (
                      <IMaskInput
                        id="troca-ano"
                        mask="0000"
                        inputMode="numeric"
                        placeholder="2021"
                        value={field.value}
                        onAccept={(val) => field.onChange(String(val))}
                        onBlur={field.onBlur}
                        className="h-12 w-full rounded-xl border border-white/20 bg-slate-950/40 px-3.5 text-base text-white placeholder-slate-400 focus:border-orange-400 focus:outline-none sm:text-sm"
                      />
                    )}
                  />
                  {errors.ano && (
                    <p className="mt-1 text-xs font-semibold text-orange-300">
                      {errors.ano.message}
                    </p>
                  )}
                </div>

                <div className="sm:col-span-3">
                  <label
                    htmlFor="troca-km"
                    className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-slate-200"
                  >
                    Km atual
                  </label>
                  <Controller
                    name="km"
                    control={control}
                    render={({ field }) => (
                      <IMaskInput
                        id="troca-km"
                        mask={Number}
                        thousandsSeparator="."
                        scale={0}
                        min={0}
                        max={999999}
                        inputMode="numeric"
                        placeholder="65.000"
                        value={field.value}
                        onAccept={(val) => field.onChange(String(val))}
                        onBlur={field.onBlur}
                        className="h-12 w-full rounded-xl border border-white/20 bg-slate-950/40 px-3.5 text-base text-white placeholder-slate-400 focus:border-orange-400 focus:outline-none sm:text-sm"
                      />
                    )}
                  />
                  {errors.km && (
                    <p className="mt-1 text-xs font-semibold text-orange-300">
                      {errors.km.message}
                    </p>
                  )}
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="mt-4 flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-orange-500 px-6 py-3.5 text-sm font-extrabold uppercase tracking-wide text-white shadow-lg shadow-orange-600/30 transition hover:bg-orange-600 active:scale-[0.98] disabled:opacity-60 cursor-pointer"
              >
                <WhatsappIcon className="h-5 w-5 shrink-0" />
                Avaliar meu carro
              </button>
            </form>
          </div>
        </div>
      </div>
    </section>
  );
}
