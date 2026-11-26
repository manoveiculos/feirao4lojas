'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { registrarAcao } from '@/lib/acessos/cliente';
import { buildQuickSimulatorMessage, PRECAPTURA_ATIVA } from '@/lib/config';
import {
  lerContatoSalvo,
  salvarContato,
  triggerWhatsappLead,
  type LeadOrigem,
  type LeadTipo,
  type SimulacaoExtra,
} from '@/lib/tracking';
import type { LojaSigla } from '@/lib/types';
import { ResponsiveSheet } from '../ui/ResponsiveSheet';
import { ContactFields } from './ContactFields';
import { QuickSimulator, type FormaNegocio, type ResultadoSimulador } from './QuickSimulator';

export interface Intencao {
  titulo: string;
  descricao?: string;
  cta?: string;
  /** Texto que abre no WhatsApp (o nome do cliente é acrescentado na abertura) */
  message: string;
  tipo: LeadTipo;
  ref: string;
  loja_sigla: LojaSigla | null;
  origem: LeadOrigem;
  veiculo?: { codigo?: string; modelo?: string; ano?: string; preco?: string };
  customEvent?: 'acelerav3_simulacao' | 'acelerav3_troca';
}

export interface ContextoSimulador {
  origem: LeadOrigem;
  loja_sigla?: LojaSigla | null;
  veiculo?: Intencao['veiculo'];
  formaInicial?: FormaNegocio;
}

type Modo = { tipo: 'contato'; intencao: Intencao } | { tipo: 'simulador'; ctx: ContextoSimulador };

interface Ctx {
  /** Pede nome + WhatsApp e abre o WhatsApp com a mensagem da intenção (direto, se o contato já foi salvo). */
  abrirCaptura: (i: Intencao) => void;
  /** Abre o simulador rápido de 3 passos em gaveta/modal. */
  abrirSimulador: (c: ContextoSimulador) => void;
  /** Envia o resultado do simulador (usado também pelo bloco inline da página). */
  enviarSimulacao: (r: ResultadoSimulador, c: ContextoSimulador) => void;
}

const LeadCaptureContext = createContext<Ctx | null>(null);

export function useLeadCapture(): Ctx {
  const ctx = useContext(LeadCaptureContext);
  if (!ctx) throw new Error('useLeadCapture precisa estar dentro de LeadCaptureProvider');
  return ctx;
}

function personalizar(message: string, nome: string): string {
  const primeiro = nome.trim().split(/\s+/)[0];
  if (!primeiro) return message;
  return /^Olá!\s*/.test(message)
    ? message.replace(/^Olá!\s*/, `Olá! Sou ${primeiro}. `)
    : `Olá! Sou ${primeiro}. ${message}`;
}

function enviarLead(
  i: Intencao,
  contato: { nome: string; whatsapp: string },
  opts: { formulario: boolean; simulacao?: SimulacaoExtra }
): void {
  if (contato.whatsapp) salvarContato(contato);
  toast.success('Abrindo o WhatsApp...');
  triggerWhatsappLead({
    message: personalizar(i.message, contato.nome),
    tipo: i.tipo,
    ref: i.ref,
    loja_sigla: i.loja_sigla,
    origem: i.origem,
    veiculo: i.veiculo,
    nome: contato.nome,
    whatsapp: contato.whatsapp,
    customEvent: i.customEvent,
    isFormLead: opts.formulario,
    simulacao: opts.simulacao,
  });
}

function intencaoDoSimulador(r: ResultadoSimulador, c: ContextoSimulador): { intencao: Intencao; sim: SimulacaoExtra } {
  const sim: SimulacaoExtra = { forma: r.forma, faixa: r.faixa, valor: r.valor };
  return {
    sim,
    intencao: {
      titulo: 'Simulação',
      message: buildQuickSimulatorMessage({ forma: r.forma, faixa: r.faixa }),
      tipo: r.forma === 'troca' ? 'troca' : 'simulacao',
      ref: r.forma === 'troca' ? 'AV3-TROCA' : 'AV3-SIM',
      loja_sigla: c.loja_sigla ?? null,
      origem: c.origem,
      veiculo: c.veiculo,
      customEvent: r.forma === 'troca' ? 'acelerav3_troca' : 'acelerav3_simulacao',
    },
  };
}

export function LeadCaptureProvider({ children }: { children: React.ReactNode }) {
  const [modo, setModo] = useState<Modo | null>(null);
  const [aberto, setAberto] = useState(false);
  const [enviando, setEnviando] = useState(false);

  const fechar = useCallback((open: boolean) => {
    setAberto(open);
    if (!open) {
      registrarAcao('lead_formulario', { detalhe: 'Fechou o formulário de contato sem enviar' });
      setEnviando(false);
    }
  }, []);

  const finalizar = useCallback(() => {
    // dá um instante para o botão mostrar "Abrindo o WhatsApp..." e fecha
    setTimeout(() => {
      setAberto(false);
      setEnviando(false);
    }, 700);
  }, []);

  const abrirCaptura = useCallback((i: Intencao) => {
    const salvo = lerContatoSalvo();
    if (!PRECAPTURA_ATIVA || salvo) {
      enviarLead(i, salvo ?? { nome: '', whatsapp: '' }, { formulario: false });
      return;
    }
    registrarAcao('lead_formulario', { detalhe: `Abriu o formulário de contato (${i.tipo}, ${i.origem})` });
    setModo({ tipo: 'contato', intencao: i });
    setEnviando(false);
    setAberto(true);
  }, []);

  const abrirSimulador = useCallback((c: ContextoSimulador) => {
    registrarAcao('simulacao', { detalhe: `Abriu o simulador (${c.origem})` });
    setModo({ tipo: 'simulador', ctx: c });
    setEnviando(false);
    setAberto(true);
  }, []);

  const enviarSimulacao = useCallback((r: ResultadoSimulador, c: ContextoSimulador) => {
    const { intencao, sim } = intencaoDoSimulador(r, c);
    enviarLead(intencao, { nome: r.nome, whatsapp: r.whatsapp }, { formulario: true, simulacao: sim });
  }, []);

  const valor = useMemo(
    () => ({ abrirCaptura, abrirSimulador, enviarSimulacao }),
    [abrirCaptura, abrirSimulador, enviarSimulacao]
  );

  return (
    <LeadCaptureContext.Provider value={valor}>
      {children}
      <ResponsiveSheet
        open={aberto}
        onOpenChange={fechar}
        title={
          modo?.tipo === 'simulador'
            ? 'Simular condição'
            : (modo?.intencao.titulo ?? 'Fale com a gente')
        }
        description={
          modo?.tipo === 'simulador'
            ? 'Responda em 2 toques e receba a condição no WhatsApp.'
            : modo?.intencao.descricao
        }
      >
        {modo?.tipo === 'contato' && (
          <div className="pb-2">
            <ContactFields
              idPrefix="cap"
              cta={modo.intencao.cta ?? 'Continuar no WhatsApp'}
              enviando={enviando}
              onSubmit={(c) => {
                setEnviando(true);
                enviarLead(modo.intencao, c, { formulario: true });
                finalizar();
              }}
            />
          </div>
        )}
        {modo?.tipo === 'simulador' && (
          <div className="pb-2">
            <QuickSimulator
              enviando={enviando}
              formaInicial={modo.ctx.formaInicial}
              onFinish={(r) => {
                setEnviando(true);
                enviarSimulacao(r, modo.ctx);
                finalizar();
              }}
            />
          </div>
        )}
      </ResponsiveSheet>
    </LeadCaptureContext.Provider>
  );
}
