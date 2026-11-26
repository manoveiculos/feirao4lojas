'use client';

import { useState } from 'react';
import { Loader2, ShieldCheck, Zap } from 'lucide-react';
import { mascararTelefone, nomeValido, telefoneValido } from '@/lib/telefone';
import { lerContatoSalvo } from '@/lib/tracking';
import { WhatsappIcon } from '../WhatsappIcon';
import { ShimmerButton } from '../ui/ShimmerButton';

/** Nome + WhatsApp com máscara brasileira. Atrito mínimo: 2 campos e 1 botão. */
export function ContactFields({
  cta,
  enviando,
  onSubmit,
  idPrefix = 'lead',
}: {
  cta: string;
  enviando: boolean;
  onSubmit: (c: { nome: string; whatsapp: string }) => void;
  idPrefix?: string;
}) {
  const [salvo] = useState(() => lerContatoSalvo());
  const [nome, setNome] = useState(salvo?.nome ?? '');
  const [whatsapp, setWhatsapp] = useState(salvo?.whatsapp ?? '');
  const [tentou, setTentou] = useState(false);

  const erroNome = tentou && !nomeValido(nome);
  const erroTel = tentou && !telefoneValido(whatsapp);

  const enviar = (e: React.FormEvent) => {
    e.preventDefault();
    setTentou(true);
    if (enviando || !nomeValido(nome) || !telefoneValido(whatsapp)) return;
    onSubmit({ nome: nome.trim(), whatsapp });
  };

  const campo =
    'h-12 w-full rounded-xl border bg-slate-50 px-3.5 text-base font-medium text-slate-900 placeholder-slate-400 transition focus:bg-white focus:outline-none';

  return (
    <form onSubmit={enviar} noValidate className="space-y-3">
      <div>
        <label htmlFor={`${idPrefix}-nome`} className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-600">
          Seu nome
        </label>
        <input
          id={`${idPrefix}-nome`}
          type="text"
          autoComplete="given-name"
          placeholder="Como prefere ser chamado"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          aria-invalid={erroNome}
          className={`${campo} ${erroNome ? 'border-red-400' : 'border-slate-300 focus:border-[#0B3C4E]'}`}
        />
        {erroNome && <p className="mt-1 text-xs font-semibold text-red-600">Informe seu nome</p>}
      </div>

      <div>
        <label htmlFor={`${idPrefix}-tel`} className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-600">
          Seu WhatsApp
        </label>
        <input
          id={`${idPrefix}-tel`}
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          placeholder="(47) 99999-9999"
          value={whatsapp}
          onChange={(e) => setWhatsapp(mascararTelefone(e.target.value))}
          aria-invalid={erroTel}
          className={`${campo} ${erroTel ? 'border-red-400' : 'border-slate-300 focus:border-[#0B3C4E]'}`}
        />
        {erroTel && (
          <p className="mt-1 text-xs font-semibold text-red-600">Informe um celular válido com DDD</p>
        )}
        <p className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] font-medium text-slate-500">
          <Zap className="h-3.5 w-3.5 shrink-0 text-orange-500" />
          <span>Atendimento rápido no WhatsApp</span>
          <span aria-hidden="true">•</span>
          <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
          <span>Seus dados estão protegidos</span>
        </p>
      </div>

      <ShimmerButton
        type="submit"
        disabled={enviando}
        className="min-h-[54px] w-full px-5 py-3.5 text-base"
      >
        {enviando ? (
          <>
            <Loader2 className="h-5 w-5 animate-spin" />
            Abrindo o WhatsApp...
          </>
        ) : (
          <>
            <WhatsappIcon className="h-5 w-5 shrink-0" />
            {cta}
          </>
        )}
      </ShimmerButton>
    </form>
  );
}
