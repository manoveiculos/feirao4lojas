'use client';

import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { IMaskInput } from 'react-imask';
import { BellRing, CheckCircle2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { sendLeadWebhook, trackLeadEvent } from '@/lib/tracking';

const INTERESSES = ['SUV', 'Hatch', 'Sedan', 'Elétrico', 'Troca'] as const;

const vipSchema = z.object({
  nome: z.string().trim().min(2, 'Informe seu nome'),
  whatsapp: z
    .string()
    .refine((val) => val.replace(/\D/g, '').length >= 10, 'Informe um WhatsApp válido com DDD'),
  interesse: z.enum(INTERESSES),
});

type VipFormValues = z.infer<typeof vipSchema>;

export function VipListForm({
  variant = 'pre_lancamento',
}: {
  variant?: 'pre_lancamento' | 'encerrado';
}) {
  const [submitted, setSubmitted] = useState(false);

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<VipFormValues>({
    resolver: zodResolver(vipSchema),
    defaultValues: {
      nome: '',
      whatsapp: '',
      interesse: 'SUV',
    },
  });

  const onSubmit = (data: VipFormValues) => {
    const ref = variant === 'encerrado' ? 'AV3-PROXIMO' : 'AV3-VIP';
    sendLeadWebhook({
      tipo: 'lista_vip',
      ref,
      loja_sigla: null,
      origem: 'hero',
      veiculo: {
        codigo: '',
        modelo: `Interesse: ${data.interesse}`,
        ano: '',
        preco: '',
      },
      nome: data.nome,
      whatsapp: data.whatsapp,
    });

    trackLeadEvent({
      tipo: 'lista_vip',
      ref,
      loja_sigla: null,
      origem: 'hero',
      extra: { interesse: data.interesse },
    });

    setSubmitted(true);
    toast.success(
      variant === 'encerrado'
        ? 'Cadastro confirmado! Avisaremos você sobre o próximo feirão.'
        : 'Você entrou na Lista VIP do ACELERA V3! Fique de olho no seu WhatsApp.'
    );
    reset();
  };

  const isClosed = variant === 'encerrado';

  return (
    <div
      id="lista-vip"
      className="scroll-mt-24 rounded-2xl border border-orange-400/30 bg-[#06232E]/95 p-5 text-left text-white shadow-2xl backdrop-blur-md sm:p-6"
    >
      <div className="inline-flex items-center gap-1.5 rounded-full bg-orange-500/20 px-3 py-1 text-[11px] font-extrabold uppercase tracking-wider text-orange-300 ring-1 ring-orange-400/30">
        {isClosed ? (
          <>
            <BellRing className="h-3.5 w-3.5" />
            Próximo Feirão
          </>
        ) : (
          <>
            <Sparkles className="h-3.5 w-3.5" />
            Acesso Antecipado
          </>
        )}
      </div>

      <h2 className="mt-3 text-xl font-extrabold italic tracking-tight text-white sm:text-2xl">
        {isClosed
          ? 'Avise-me do próximo feirão'
          : 'Entrar na lista VIP'}
      </h2>
      <p className="mt-1 text-xs leading-relaxed text-slate-300 sm:text-sm">
        {isClosed
          ? 'Cadastre seu WhatsApp para receber em primeira mão a data e os carros da próxima edição.'
          : 'Receba aviso assim que o ACELERA V3 abrir em 14/12 com prioridade no atendimento.'}
      </p>

      {submitted ? (
        <div className="mt-4 rounded-xl border border-emerald-400/30 bg-emerald-500/15 p-4 text-sm text-emerald-100">
          <div className="flex items-center gap-2 font-bold text-emerald-300">
            <CheckCircle2 className="h-5 w-5 shrink-0" />
            Cadastro realizado com sucesso!
          </div>
          <p className="mt-1 text-xs text-slate-200">
            Seus dados foram registrados. Você pode continuar navegando pelo estoque abaixo.
          </p>
          <button
            type="button"
            onClick={() => setSubmitted(false)}
            className="mt-3 text-xs font-bold text-orange-300 underline underline-offset-4 hover:text-orange-200 cursor-pointer"
          >
            Cadastrar outro contato
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} className="mt-4 space-y-3" noValidate>
          <div>
            <label
              htmlFor="vip-nome"
              className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-slate-300"
            >
              Seu nome
            </label>
            <input
              id="vip-nome"
              type="text"
              autoComplete="name"
              placeholder="Ex: Carlos Silva"
              {...register('nome')}
              className="h-11 w-full rounded-xl border border-white/15 bg-white/10 px-3.5 text-base text-white placeholder-slate-400 focus:border-orange-400 focus:bg-white/15 focus:outline-none sm:text-sm"
            />
            {errors.nome && (
              <p className="mt-1 text-xs font-semibold text-orange-300">
                {errors.nome.message}
              </p>
            )}
          </div>

          <div>
            <label
              htmlFor="vip-whatsapp"
              className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-slate-300"
            >
              WhatsApp
            </label>
            <Controller
              name="whatsapp"
              control={control}
              render={({ field }) => (
                <IMaskInput
                  id="vip-whatsapp"
                  mask="(00) 00000-0000"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="(47) 99999-9999"
                  value={field.value}
                  onAccept={(val) => field.onChange(String(val))}
                  onBlur={field.onBlur}
                  className="h-11 w-full rounded-xl border border-white/15 bg-white/10 px-3.5 text-base text-white placeholder-slate-400 focus:border-orange-400 focus:bg-white/15 focus:outline-none sm:text-sm"
                />
              )}
            />
            {errors.whatsapp && (
              <p className="mt-1 text-xs font-semibold text-orange-300">
                {errors.whatsapp.message}
              </p>
            )}
          </div>

          <div>
            <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-slate-300">
              Seu interesse principal
            </span>
            <Controller
              name="interesse"
              control={control}
              render={({ field }) => (
                <div className="flex flex-wrap gap-1.5">
                  {INTERESSES.map((item) => {
                    const active = field.value === item;
                    return (
                      <button
                        key={item}
                        type="button"
                        onClick={() => field.onChange(item)}
                        className={`rounded-full px-3 py-1.5 text-xs font-bold transition cursor-pointer ${
                          active
                            ? 'bg-orange-500 text-white shadow-sm'
                            : 'border border-white/15 bg-white/5 text-slate-200 hover:bg-white/15'
                        }`}
                      >
                        {item}
                      </button>
                    );
                  })}
                </div>
              )}
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="mt-1 flex min-h-[46px] w-full items-center justify-center gap-2 rounded-xl bg-orange-500 px-5 py-3 text-sm font-extrabold uppercase tracking-wide text-white shadow-lg shadow-orange-600/30 transition hover:bg-orange-600 active:scale-[0.98] disabled:opacity-60 cursor-pointer"
          >
            {isClosed ? 'Quero ser avisado' : 'Entrar na lista VIP'}
          </button>
        </form>
      )}
    </div>
  );
}
