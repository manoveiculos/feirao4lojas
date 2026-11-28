'use client';

import Link from 'next/link';
import { useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { api, brl, Card, hora, Kpi, tempoRelativo, usePolling } from './ui';

interface Item {
  id: string; leadId: string; telefone: string; nome: string; leadNome: string; marca: string | null; modelo: string | null;
  categoria: string | null; anoMinimo: number | null; precoMaximo: number | null; cambio: string | null; temTroca: boolean | null;
  observacoes: string; status: string; createdAt: string; notifiedAt: string | null; lojaResponsavel: string | null;
  veiculosAvisados: string[];
  veiculo: { codigo: string; titulo?: string; ano?: string; preco?: string; loja?: string; ativo: boolean } | null;
}
interface Resp {
  total: number;
  contagem: Record<string, number>;
  modelos: string[];
  motor: { ultimaVerificacao: string | null; pendentes: number; veiculosConhecidos: number };
  itens: Item[];
}

const STATUS: Array<[string, string, string]> = [
  ['aguardando', 'Aguardando', 'bg-amber-100 text-amber-800'],
  ['notificado', 'Notificado', 'bg-sky-100 text-sky-800'],
  ['em_atendimento', 'Em atendimento', 'bg-emerald-100 text-emerald-800'],
  ['encerrado', 'Encerrado', 'bg-zinc-200 text-zinc-700'],
];
const COR = Object.fromEntries(STATUS.map(([v, , c]) => [v, c]));
const LABEL = Object.fromEntries(STATUS.map(([v, l]) => [v, l]));

export function ListaEspera({ admin = true }: { admin?: boolean } = {}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const status = sp.get('status') || '';
  const modelo = sp.get('q') || '';
  const [busca, setBusca] = useState(modelo);
  const [msg, setMsg] = useState('');
  const [rodando, setRodando] = useState(false);

  const qs = new URLSearchParams();
  if (status) qs.set('status', status);
  if (modelo) qs.set('q', modelo);
  const { data, recarregar } = usePolling<Resp>(`/api/painel/espera?${qs}`, 10000);

  function mudar(p: Record<string, string>) {
    const n = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(p)) (v ? n.set(k, v) : n.delete(k));
    router.replace(`${pathname}?${n}`, { scroll: false });
  }

  async function rodarMatch() {
    if (!window.confirm('Cruzar TODO o estoque atual com quem está aguardando? Clientes com carro compatível recebem a mensagem no WhatsApp agora (cada carro só é avisado uma vez por cliente).')) return;
    setRodando(true);
    setMsg('');
    let r = await api<{ status: string; notificados?: unknown[]; motivo?: string; erro?: string; veiculosAnalisados?: number }>('/api/estoque/match-espera', 'POST', { todos: true });
    if (r.ok && r.data.status === 'adiado' && r.data.motivo?.includes('horário') && window.confirm(`${r.data.motivo}

Enviar mesmo assim, agora?`)) {
      r = await api<{ status: string; notificados?: unknown[]; motivo?: string; erro?: string; veiculosAnalisados?: number }>('/api/estoque/match-espera', 'POST', { todos: true, ignorarHorario: true });
    }
    setRodando(false);
    setMsg(
      !r.ok ? `Erro: ${r.data.erro ?? 'falha'}`
        : r.data.status === 'adiado' ? `Adiado: ${r.data.motivo}`
        : `${r.data.notificados?.length ?? 0} cliente(s) avisado(s) — ${r.data.veiculosAnalisados ?? 0} carro(s) analisados.`
    );
    void recarregar();
  }

  async function mudarStatus(id: string, s: string) {
    await api(`/api/painel/espera/${id}`, 'PATCH', { status: s });
    void recarregar();
  }

  async function editar(e: Item) {
    const p = window.prompt('Teto de preço em R$ (apenas números; vazio = sem limite):', e.precoMaximo ? String(e.precoMaximo) : '');
    if (p === null) return;
    const a = window.prompt('Ano mínimo (vazio = qualquer):', e.anoMinimo ? String(e.anoMinimo) : '');
    if (a === null) return;
    const preco = p.replace(/\D/g, '');
    const ano = a.replace(/\D/g, '');
    const r = await api<{ erro?: string }>(`/api/painel/espera/${e.id}`, 'PATCH', {
      precoMaximo: preco ? Number(preco) : null,
      anoMinimo: ano ? Number(ano) : null,
    });
    setMsg(r.ok ? 'Pedido atualizado.' : `Erro: ${r.data.erro ?? 'falha ao salvar'}`);
    void recarregar();
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {STATUS.map(([v, l]) => (
          <button key={v} onClick={() => mudar({ status: status === v ? '' : v })} className="text-left cursor-pointer">
            <Kpi label={l} valor={data?.contagem[v] ?? '—'} destaque={status === v} />
          </button>
        ))}
      </div>

      <Card
        titulo="Lista de espera"
        acao={!admin ? undefined :
          <button onClick={rodarMatch} disabled={rodando} className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50 cursor-pointer">
            {rodando ? 'Cruzando…' : 'Cruzar com o estoque agora'}
          </button>
        }
      >
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <input value={busca} onChange={(e) => setBusca(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') mudar({ q: busca }); }}
            onBlur={() => busca !== modelo && mudar({ q: busca })} placeholder="Filtrar por modelo, marca, categoria, nome ou telefone"
            list="modelos-espera" className="h-9 min-w-64 flex-1 rounded-lg border border-slate-300 px-3 text-sm focus:border-orange-500 focus:outline-none" />
          <datalist id="modelos-espera">{data?.modelos.map((m) => <option key={m} value={m} />)}</datalist>
          <select value={status} onChange={(e) => mudar({ status: e.target.value })} className="h-9 rounded-lg border border-slate-300 px-2 text-sm">
            <option value="">Todos os status</option>
            {STATUS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          {(status || modelo) && <button onClick={() => { setBusca(''); mudar({ status: '', q: '' }); }} className="text-xs font-bold text-sky-700 cursor-pointer">Limpar</button>}
        </div>
        {msg && <p className="mb-2 text-sm font-semibold text-slate-700" role="status">{msg}</p>}
        <p className="mb-3 text-xs text-slate-500">
          Match automático a cada sincronização do estoque: modelo ou categoria + ano ≥ mínimo + preço ≤ máximo + 8%. Envio só entre 8h e 20h.
          {data?.motor.ultimaVerificacao && <> Última verificação: {hora(data.motor.ultimaVerificacao)}{data.motor.pendentes ? ` · ${data.motor.pendentes} carro(s) novo(s) aguardando o horário` : ''}.</>}
        </p>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[56rem] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-slate-500">
                <th className="py-2 pr-2">Cliente</th><th className="pr-2">Deseja</th><th className="pr-2">Ano mín.</th><th className="pr-2">Até</th>
                <th className="pr-2">Câmbio</th><th className="pr-2">Troca</th><th className="pr-2">Status</th><th className="pr-2">Match</th><th className="pr-2">Desde</th><th />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data?.itens.length === 0 && <tr><td colSpan={10} className="py-6 text-center text-slate-400">Ninguém na lista com esses filtros.</td></tr>}
              {data?.itens.map((e) => (
                <tr key={e.id} className="align-top">
                  <td className="py-2 pr-2">
                    {admin
                      ? <Link href={`/admin/conversas?lead=${e.leadId}`} className="font-bold text-slate-900 hover:underline">{e.leadNome || `+${e.telefone}`}</Link>
                      : <span className="font-bold text-slate-900">{e.leadNome || `+${e.telefone}`}</span>}
                    <div className="text-xs text-slate-500">+{e.telefone}</div>
                  </td>
                  <td className="pr-2">
                    <div className="font-semibold">{[e.marca, e.modelo].filter(Boolean).join(' ') || '—'}</div>
                    <div className="text-xs text-slate-500">{[e.categoria, e.observacoes].filter(Boolean).join(' · ')}</div>
                  </td>
                  <td className="pr-2">{e.anoMinimo ?? '—'}</td>
                  <td className="pr-2 whitespace-nowrap">{e.precoMaximo ? brl(e.precoMaximo) : '—'}</td>
                  <td className="pr-2">{e.cambio ?? '—'}</td>
                  <td className="pr-2">{e.temTroca === null ? '—' : e.temTroca ? 'Sim' : 'Não'}</td>
                  <td className="pr-2"><span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold ${COR[e.status] ?? ''}`}>{LABEL[e.status] ?? e.status}</span></td>
                  <td className="pr-2 text-xs">
                    {e.veiculo ? (
                      <>
                        <b>{e.veiculo.codigo}</b>{e.veiculo.titulo ? ` · ${e.veiculo.titulo} ${e.veiculo.ano}` : ''}
                        <div className="text-slate-500">{e.veiculo.ativo ? `${e.veiculo.preco} · ${e.veiculo.loja}` : 'saiu do estoque'}{e.notifiedAt ? ` · avisado ${tempoRelativo(e.notifiedAt)}` : ''}</div>
                      </>
                    ) : '—'}
                  </td>
                  <td className="pr-2 whitespace-nowrap text-xs text-slate-500">{tempoRelativo(e.createdAt)}</td>
                  <td className="whitespace-nowrap text-right">
                    {admin && <button onClick={() => void editar(e)} className="mr-1 h-8 rounded-lg border border-slate-300 px-2 text-xs font-bold cursor-pointer">Editar</button>}
                    {admin && <select value={e.status} onChange={(ev) => void mudarStatus(e.id, ev.target.value)} aria-label="Mudar status"
                      className="h-8 rounded-lg border border-slate-300 px-1 text-xs">
                      {STATUS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
