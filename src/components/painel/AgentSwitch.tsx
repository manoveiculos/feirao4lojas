'use client';

import { useState } from 'react';
import { api, usePolling } from './ui';

interface Estado { ligado: boolean; atualizadoEm: string }

/**
 * Interruptor geral do agente, fixo no topo do admin.
 * Desligar pede confirmação; ligar é imediato. Atualiza sozinho se outra pessoa mudar.
 */
export function AgentSwitch() {
  const { data, recarregar } = usePolling<Estado>('/api/admin/agente/estado', 15000);
  const [mudando, setMudando] = useState(false);
  const [erro, setErro] = useState('');

  if (!data) return null;
  const ligado = data.ligado;

  async function alternar() {
    if (ligado && !window.confirm(
      'Desligar o agente de WhatsApp?\n\n' +
      '• Ele para de responder clientes, de mandar boas-vindas e follow-ups.\n' +
      '• As mensagens continuam chegando e aparecem em Conversas para a equipe responder.\n' +
      '• Mensagens recebidas enquanto ele estiver desligado não são respondidas automaticamente depois.'
    )) return;
    setMudando(true);
    setErro('');
    const r = await api<{ erro?: string }>('/api/admin/agente/estado', 'POST', { ligado: !ligado });
    setMudando(false);
    if (!r.ok) setErro(r.data.erro || 'Falha ao alterar');
    await recarregar();
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        role="switch"
        aria-checked={ligado}
        aria-label={ligado ? 'Agente ligado. Clique para desligar' : 'Agente desligado. Clique para ligar'}
        onClick={alternar}
        disabled={mudando}
        className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-extrabold uppercase tracking-wide transition disabled:opacity-60 cursor-pointer ${
          ligado ? 'bg-emerald-500/20 text-emerald-200 ring-1 ring-emerald-400/50 hover:bg-emerald-500/30' : 'bg-rose-600 text-white ring-1 ring-rose-300 hover:bg-rose-500'
        }`}
      >
        <span className={`relative inline-flex h-4 w-7 shrink-0 items-center rounded-full ${ligado ? 'bg-emerald-400' : 'bg-white/40'}`}>
          <span className={`absolute h-3 w-3 rounded-full bg-white shadow transition-all ${ligado ? 'left-3.5' : 'left-0.5'}`} />
        </span>
        {mudando ? 'Alterando…' : ligado ? '🤖 Agente ligado' : '⏸ Agente DESLIGADO'}
      </button>
      {erro && <span className="text-xs font-semibold text-rose-300" role="alert">{erro}</span>}
    </div>
  );
}
