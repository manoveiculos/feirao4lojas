'use client';

import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { IMaskInput } from 'react-imask';
import { Calculator, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { CAMPAIGN_COPY } from '@/lib/campaign';
import { buildSimulatorWhatsappMessage } from '@/lib/config';
import { triggerWhatsappLead } from '@/lib/tracking';
import { WhatsappIcon } from './WhatsappIcon';

const PRAZOS = ['24x', '36x', '48x', '60x', 'A definir'] as const;
const BANCOS = [
  'C6 Bank',
  'Viacredi Alto Vale',
  'Qualquer banco parceiro',
] as const;

const simulatorSchema = z.object({
  entrada: z.string().trim().min(1, 'Informe o valor de entrada ou "A definir"'),
  prazo: z.enum(PRAZOS),
  banco: z.enum(BANCOS),
  nome: z.string().trim().min(2, 'Informe seu nome'),
  whatsapp: z
    .string()
    .refine(
      (val) => val.replace(/\D/g, '').length >= 10,
      'Informe um WhatsApp válido com DDD'
    ),
});

type SimulatorFormValues = z.infer<typeof simulatorSchema>;

export function SimulatorSection() {
  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SimulatorFormValues>({
    resolver: zodResolver(simulatorSchema),
    defaultValues: {
      entrada: '',
      prazo: '48x',
      banco: 'C6 Bank',
      nome: '',
      whatsapp: '',
    },
  });

  const onSubmit = (data: SimulatorFormValues) => {
    const entradaFormatada = data.entrada.startsWith('R$')
      ? data.entrada
      : `R$ ${data.entrada}`;

    const message = buildSimulatorWhatsappMessage({
      entrada: entradaFormatada,
      prazo: data.prazo,
      banco: data.banco,
    });

    toast.success('Abrindo WhatsApp com sua solicitação de simulação...');
    triggerWhatsappLead({
      message,
      tipo: 'simulacao',
      ref: 'AV3-SIM',
      loja_sigla: null,
      origem: 'simulador',
      nome: data.nome,
      whatsapp: data.whatsapp,
      isFormLead: true,
      customEvent: 'acelerav3_simulacao',
    });
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
              <Calculator className="h-3.5 w-3.5" />
              Simulação Personalizada
            </div>
            <h2 className="mt-3 text-2xl font-black italic tracking-tight text-white sm:text-4xl">
              Simule seu financiamento e saia rodando
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-200 sm:text-base">
              Informe os dados abaixo e nossa equipe consulta as condições reais
              junto ao <strong>C6 Bank</strong> e à{' '}
              <strong>Viacredi Alto Vale</strong> diretamente pelo WhatsApp — com
              a 1ª parcela só depois do Carnaval.
            </p>

            <div className="mt-5 flex items-start gap-2.5 rounded-xl border border-white/10 bg-white/[0.06] p-3.5 text-xs text-slate-300">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-orange-400" />
              <span>{CAMPAIGN_COPY.legal}</span>
            </div>
          </div>

          <div className="rounded-2xl border border-white/15 bg-white p-5 text-slate-900 shadow-2xl sm:p-7 lg:col-span-7">
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label
                    htmlFor="sim-entrada"
                    className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-600"
                  >
                    Valor de entrada
                  </label>
                  <Controller
                    name="entrada"
                    control={control}
                    render={({ field }) => (
                      <IMaskInput
                        id="sim-entrada"
                        mask="R$ num"
                        blocks={{
                          num: {
                            mask: Number,
                            thousandsSeparator: '.',
                            scale: 0,
                            min: 0,
                            max: 999999,
                          },
                        }}
                        inputMode="numeric"
                        placeholder="R$ 20.000"
                        value={field.value}
                        onAccept={(val) => field.onChange(String(val))}
                        onBlur={field.onBlur}
                        className="h-12 w-full rounded-xl border border-slate-300 bg-slate-50 px-3.5 text-base font-semibold text-slate-900 placeholder-slate-400 focus:border-[#0B3C4E] focus:bg-white focus:outline-none sm:text-sm"
                      />
                    )}
                  />
                  {errors.entrada && (
                    <p className="mt-1 text-xs font-semibold text-red-600">
                      {errors.entrada.message}
                    </p>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="sim-prazo"
                    className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-600"
                  >
                    Prazo desejado
                  </label>
                  <select
                    id="sim-prazo"
                    {...register('prazo')}
                    className="h-12 w-full rounded-xl border border-slate-300 bg-slate-50 px-3 text-base font-semibold text-slate-900 focus:border-[#0B3C4E] focus:bg-white focus:outline-none sm:text-sm"
                  >
                    {PRAZOS.map((p) => (
                      <option key={p} value={p}>
                        {p === 'A definir' ? 'A definir com consultor' : `${p} meses`}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="sim-banco"
                    className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-600"
                  >
                    Banco de preferência
                  </label>
                  <select
                    id="sim-banco"
                    {...register('banco')}
                    className="h-12 w-full rounded-xl border border-slate-300 bg-slate-50 px-3 text-base font-semibold text-slate-900 focus:border-[#0B3C4E] focus:bg-white focus:outline-none sm:text-sm"
                  >
                    {BANCOS.map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="sim-nome"
                    className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-600"
                  >
                    Seu nome
                  </label>
                  <input
                    id="sim-nome"
                    type="text"
                    autoComplete="name"
                    placeholder="Como prefere ser chamado"
                    {...register('nome')}
                    className="h-12 w-full rounded-xl border border-slate-300 bg-slate-50 px-3.5 text-base font-medium text-slate-900 placeholder-slate-400 focus:border-[#0B3C4E] focus:bg-white focus:outline-none sm:text-sm"
                  />
                  {errors.nome && (
                    <p className="mt-1 text-xs font-semibold text-red-600">
                      {errors.nome.message}
                    </p>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="sim-whatsapp"
                    className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-600"
                  >
                    Seu WhatsApp
                  </label>
                  <Controller
                    name="whatsapp"
                    control={control}
                    render={({ field }) => (
                      <IMaskInput
                        id="sim-whatsapp"
                        mask="(00) 00000-0000"
                        type="tel"
                        inputMode="tel"
                        autoComplete="tel"
                        placeholder="(47) 99999-9999"
                        value={field.value}
                        onAccept={(val) => field.onChange(String(val))}
                        onBlur={field.onBlur}
                        className="h-12 w-full rounded-xl border border-slate-300 bg-slate-50 px-3.5 text-base font-medium text-slate-900 placeholder-slate-400 focus:border-[#0B3C4E] focus:bg-white focus:outline-none sm:text-sm"
                      />
                    )}
                  />
                  {errors.whatsapp && (
                    <p className="mt-1 text-xs font-semibold text-red-600">
                      {errors.whatsapp.message}
                    </p>
                  )}
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="flex min-h-[52px] w-full items-center justify-center gap-2.5 rounded-xl bg-orange-500 px-6 py-3.5 text-base font-extrabold text-white shadow-lg shadow-orange-500/30 transition hover:bg-orange-600 active:scale-[0.98] disabled:opacity-60 cursor-pointer"
              >
                <WhatsappIcon className="h-5 w-5 shrink-0" />
                {CAMPAIGN_COPY.ctaPrincipal}
              </button>
            </form>
          </div>
        </div>
      </div>
    </section>
  );
}
