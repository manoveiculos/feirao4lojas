'use client';

import { useEffect, useRef, useState } from 'react';
import { api, Card, hora, usePolling } from './ui';

interface Settings {
  agenteLigado: boolean; boasVindasProativas: boolean; followupsAtivos: boolean; maxFollowups: number; followupHoras: number[];
  modelo: string; nomeAgente: string; instrucoesExtras: string; gerenteTelefone: string; scoreQualificado: number;
  lojaTelefones: Partial<Record<string, string>>;
}
interface Status {
  itens: Array<{ id: string; nome: string; ok: boolean; dica: string }>;
  estoque: { total: number; atualizadoEm: string };
  urls: { webhookEvolution: string; webhookMeta: string };
}
interface Msg { id: string; autor: string; texto: string; midias: string[]; ts: string }

const LOJAS: Array<[string, string]> = [
  ['nenem-autos', 'Neném Autos'], ['rosa-automoveis', 'Rosa Automóveis'], ['v3-automoveis', 'V3 Automóveis'], ['manos-veiculos', 'Manos Veículos'],
];

export function AgentPanel() {
  const { data: status, recarregar: recStatus } = usePolling<Status>('/api/admin/status', 30000);
  const [cfg, setCfg] = useState<Settings | null>(null);
  const [salvo, setSalvo] = useState('');
  const [sync, setSync] = useState('');

  useEffect(() => {
    void fetch('/api/admin/settings').then((r) => r.json()).then(setCfg);
  }, []);

  async function salvar() {
    if (!cfg) return;
    const r = await api<{ erro?: string; detalhes?: string[] }>('/api/admin/settings', 'PUT', cfg);
    setSalvo(r.ok ? 'Salvo ✔' : `Erro: ${r.data.detalhes?.join(', ') || r.data.erro}`);
    setTimeout(() => setSalvo(''), 4000);
  }

  async function sincronizar() {
    setSync('Sincronizando as 4 lojas… (pode levar 1–2 min)');
    const r = await api<{ status: string; total?: number; motivo?: string }>('/api/admin/sync', 'POST');
    setSync(r.data.status === 'sincronizado' ? `Estoque atualizado: ${r.data.total} veículos.` : `Ignorado: ${r.data.motivo ?? 'erro'}`);
    void recStatus();
  }

  if (!cfg) return <p className="text-sm text-slate-500">Carregando…</p>;
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setCfg({ ...cfg, [k]: v });

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <div className="space-y-4">
        <Card titulo="Checklist de integrações">
          <ul className="space-y-2 text-sm">
            {status?.itens.map((i) => (
              <li key={i.id} className="flex items-start gap-2">
                <span className={i.ok ? 'text-emerald-600' : 'text-amber-600'}>{i.ok ? '●' : '○'}</span>
                <span>
                  <b>{i.nome}</b>
                  {!i.ok && <span className="block text-xs text-slate-500">{i.dica}</span>}
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-3 space-y-1 border-t border-slate-100 pt-3 text-xs text-slate-500">
            <div>Webhook (Evolution): <code className="break-all">{status?.urls.webhookEvolution}</code></div>
            <div>Webhook (Meta Cloud): <code className="break-all">{status?.urls.webhookMeta}</code></div>
          </div>
        </Card>

        <Card titulo="Estoque">
          <p className="text-sm text-slate-600">{status?.estoque.total ?? '—'} veículos · atualizado {status ? hora(status.estoque.atualizadoEm) : ''}. Sincroniza sozinho a cada hora.</p>
          <button onClick={sincronizar} className="mt-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white cursor-pointer">Sincronizar agora</button>
          {sync && <p className="mt-2 text-xs text-slate-600">{sync}</p>}
        </Card>

        <Card titulo="Comportamento do agente">
          <div className="space-y-2 text-sm">
            <p className="rounded-lg bg-slate-50 p-2 text-xs text-slate-600">Para <b>ligar ou desligar o agente</b>, use o botão no topo da página (vale na hora, para todas as lojas).</p>
            <Toggle v={cfg.boasVindasProativas} on={(v) => set('boasVindasProativas', v)} l="Mandar boas-vindas + convite a quem se cadastra no site" />
            <Toggle v={cfg.followupsAtivos} on={(v) => set('followupsAtivos', v)} l="Follow-ups automáticos (8h–20h)" />
            <label className="block text-xs font-bold uppercase text-slate-500">Horas até cada follow-up (separadas por vírgula)
              <input value={cfg.followupHoras.join(', ')} onChange={(e) => set('followupHoras', e.target.value.split(',').map((x) => Number(x.trim())).filter((n) => n > 0))}
                className="mt-1 h-9 w-full rounded-lg border border-slate-300 px-2 text-sm normal-case" />
            </label>
            <label className="block text-xs font-bold uppercase text-slate-500">Máx. follow-ups
              <input type="number" min={0} max={5} value={cfg.maxFollowups} onChange={(e) => set('maxFollowups', Number(e.target.value))} className="mt-1 h-9 w-24 rounded-lg border border-slate-300 px-2 text-sm" />
            </label>
            <label className="block text-xs font-bold uppercase text-slate-500">Score mínimo para “qualificado” (0–100)
              <input type="number" min={20} max={95} value={cfg.scoreQualificado} onChange={(e) => set('scoreQualificado', Number(e.target.value))} className="mt-1 h-9 w-24 rounded-lg border border-slate-300 px-2 text-sm" />
            </label>
            <label className="block text-xs font-bold uppercase text-slate-500">Nome da consultora virtual
              <input value={cfg.nomeAgente ?? 'Val'} maxLength={30} onChange={(e) => set('nomeAgente', e.target.value)}
                className="mt-1 h-9 w-full rounded-lg border border-slate-300 px-2 text-sm normal-case" />
            </label>
            <label className="block text-xs font-bold uppercase text-slate-500">Modelo de IA
              <input value={cfg.modelo} onChange={(e) => set('modelo', e.target.value)} className="mt-1 h-9 w-full rounded-lg border border-slate-300 px-2 text-sm normal-case" />
            </label>
            <label className="block text-xs font-bold uppercase text-slate-500">Instruções extras (promoções, regras da semana)
              <textarea value={cfg.instrucoesExtras} rows={4} onChange={(e) => set('instrucoesExtras', e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm normal-case" placeholder="Ex.: Hoje o Corolla 2022 está com condição especial; priorize SUVs automáticos." />
            </label>
          </div>
        </Card>

        <Card titulo="WhatsApp de notificação das lojas">
          <p className="mb-2 text-xs text-slate-500">
            Recebe o aviso do <b>Agente Roteador</b> quando um lead passa pela triagem e é atribuído à loja (nunca antes).
            Use número com DDD (ex.: 47 99999-9999) ou o ID de um grupo do WhatsApp (ex.: 120363000000000000@g.us).
          </p>
          <div className="space-y-2">
            <label className="block text-xs font-bold uppercase text-slate-500">Admin / gerente geral (recebe todos os leads e TODO pedido de atendimento humano)
              <input value={cfg.gerenteTelefone} onChange={(e) => set('gerenteTelefone', e.target.value)} className="mt-1 h-9 w-full rounded-lg border border-slate-300 px-2 text-sm" />
            </label>
            {LOJAS.map(([slug, nome]) => (
              <label key={slug} className="block text-xs font-bold uppercase text-slate-500">{nome}
                <input value={cfg.lojaTelefones[slug] ?? ''} onChange={(e) => set('lojaTelefones', { ...cfg.lojaTelefones, [slug]: e.target.value })}
                  className="mt-1 h-9 w-full rounded-lg border border-slate-300 px-2 text-sm" />
              </label>
            ))}
          </div>
          <div className="mt-4 flex items-center gap-3">
            <button onClick={salvar} className="rounded-lg bg-orange-500 px-5 py-2 text-sm font-extrabold text-white cursor-pointer">Salvar configurações</button>
            <span className="text-sm font-semibold text-slate-600">{salvo}</span>
          </div>
        </Card>
      </div>

      <Simulador />
    </div>
  );
}

function Toggle({ v, on, l }: { v: boolean; on: (v: boolean) => void; l: string }) {
  return (
    <label className="flex cursor-pointer items-center gap-2">
      <input type="checkbox" checked={v} onChange={(e) => on(e.target.checked)} className="h-4 w-4 accent-orange-500" />
      <span>{l}</span>
    </label>
  );
}

/** Conversa de teste com o agente, sem enviar nada ao WhatsApp. */
function Simulador() {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [texto, setTexto] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');
  const fim = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void fetch('/api/admin/agente/teste').then((r) => r.json()).then((j) => setMsgs(j.mensagens ?? []));
  }, []);
  useEffect(() => { fim.current?.scrollIntoView({ block: 'end' }); }, [msgs.length]);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!texto.trim()) return;
    const t = texto;
    setTexto('');
    setCarregando(true);
    setErro('');
    setMsgs((m) => [...m, { id: `tmp-${Date.now()}`, autor: 'lead', texto: t, midias: [], ts: new Date().toISOString() }]);
    const r = await api<{ mensagens?: Msg[]; erro?: string }>('/api/admin/agente/teste', 'POST', { texto: t });
    setCarregando(false);
    if (r.data.mensagens) setMsgs(r.data.mensagens);
    if (!r.ok || r.data.erro) setErro(r.data.erro || 'Falha ao rodar o agente.');
  }

  async function reiniciar() {
    await api('/api/admin/agente/teste', 'DELETE');
    setMsgs([]);
  }

  return (
    <Card titulo="Testar o agente (nada é enviado ao WhatsApp)" acao={<button onClick={reiniciar} className="text-xs font-bold text-sky-700 cursor-pointer">Reiniciar</button>}>
      <div className="h-[28rem] space-y-2 overflow-y-auto rounded-xl bg-slate-50 p-3">
        {msgs.length === 0 && <p className="text-sm text-slate-400">Escreva como se fosse um cliente. Ex.: “Oi, vi o anúncio de SUV até 120 mil”.</p>}
        {msgs.map((m) => (
          <div key={m.id} className={`flex ${m.autor === 'lead' ? 'justify-start' : 'justify-end'}`}>
            <div className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm ${m.autor === 'lead' ? 'bg-white shadow-sm' : m.autor === 'sistema' ? 'bg-amber-100 text-amber-900' : 'bg-sky-600 text-white'}`}>
              {m.midias.length > 0 && <div className="mb-1 text-xs opacity-80">📸 foto enviada</div>}
              {m.texto}
            </div>
          </div>
        ))}
        {carregando && <p className="text-xs text-slate-400">Agente digitando…</p>}
        <div ref={fim} />
      </div>
      {erro && <p className="mt-2 text-xs font-semibold text-rose-600" role="alert">{erro}</p>}
      <form onSubmit={enviar} className="mt-2 flex gap-2">
        <input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Mensagem do cliente…" disabled={carregando}
          className="h-11 flex-1 rounded-xl border border-slate-300 px-3 text-base focus:border-orange-500 focus:outline-none sm:text-sm" />
        <button disabled={carregando || !texto.trim()} className="rounded-xl bg-orange-500 px-4 font-extrabold text-white disabled:opacity-50 cursor-pointer">Enviar</button>
      </form>
    </Card>
  );
}
