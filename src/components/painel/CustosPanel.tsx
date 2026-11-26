'use client';

import { useEffect, useState } from 'react';
import { api, brl, Card, Kpi, usePolling } from './ui';

interface Preco { entrada: number; saida: number; cacheEscrita: number; cacheLeitura: number }
interface Config { cotacaoUsdBrl: number; precos: Record<string, Preco>; fixos: Array<{ nome: string; valorMensalBrl: number }> }
interface Resp {
  periodo: string; desde: string; config: Config;
  totais: { apisBrl: number; apisUsd: number; anthropicBrl: number; openaiBrl: number; chamadas: number; mesBrl: number; projecaoMesBrl: number; fixosMensalBrl: number; sistemaMensalEstimadoBrl: number };
  porModelo: Array<{ servico: string; modelo: string; chamadas: number; entrada: number; saida: number; cacheEscrita: number; cacheLeitura: number; usd: number; brl: number; precoCadastrado: boolean }>;
  porDia: Array<{ dia: string; anthropic: number; openai: number }>;
  porLead: { leads: number; conversaram: number; qualificados: number; brlPorConversa: number | null; brlPorQualificado: number | null };
  anuncios: { configurado: boolean; gastoBrl: number | null; erro?: string; nota?: string };
  semPrecoCadastrado: string[];
  primeiroRegistro: string | null;
}

const PERIODOS: Array<[string, string]> = [['hoje', 'Hoje'], ['7d', '7 dias'], ['30d', '30 dias'], ['mes', 'Este mês']];
const NOME: Record<string, string> = { anthropic: 'Claude (Val)', openai: 'OpenAI (áudio)' };
const nf = (n: number) => new Intl.NumberFormat('pt-BR').format(n);
const brl2 = (n: number | null | undefined) => (n === null || n === undefined ? '—' : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 }).format(n));

export function CustosPanel() {
  const [periodo, setPeriodo] = useState('30d');
  const { data, recarregar } = usePolling<Resp>(`/api/admin/custos?periodo=${periodo}`, 20000);
  const [cfg, setCfg] = useState<Config | null>(null);
  const [msg, setMsg] = useState('');

  // carrega a configuração uma vez (depois o formulário é do usuário)
  useEffect(() => { if (data && !cfg) setCfg(structuredClone(data.config)); }, [data, cfg]);

  async function salvar() {
    if (!cfg) return;
    const r = await api<{ erro?: string; detalhes?: string[] }>('/api/admin/custos', 'PUT', cfg);
    setMsg(r.ok ? 'Salvo ✔ (histórico recalculado)' : `Erro: ${r.data.detalhes?.join(', ') || r.data.erro}`);
    setTimeout(() => setMsg(''), 5000);
    if (r.ok) void recarregar();
  }

  const maxDia = Math.max(0.01, ...(data?.porDia.map((d) => d.anthropic + d.openai) ?? [0]));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {PERIODOS.map(([v, l]) => (
          <button key={v} onClick={() => setPeriodo(v)}
            className={`rounded-full px-3 py-1.5 text-xs font-bold cursor-pointer ${periodo === v ? 'bg-orange-500 text-white' : 'bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100'}`}>{l}</button>
        ))}
        <span className="ml-auto text-xs text-slate-500">Atualiza a cada 20 s</span>
      </div>

      {data && data.semPrecoCadastrado.length > 0 && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900" role="alert">
          <b>Modelo sem preço cadastrado:</b> {data.semPrecoCadastrado.join(', ')}. O cálculo usou um preço padrão; cadastre o preço real abaixo.
        </div>
      )}

      {data && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi label="APIs no período" valor={brl2(data.totais.apisBrl)} sub={`US$ ${data.totais.apisUsd.toFixed(2)} · ${nf(data.totais.chamadas)} chamadas`} destaque />
            <Kpi label="Claude (Val)" valor={brl2(data.totais.anthropicBrl)} sub="atendimento no WhatsApp" />
            <Kpi label="OpenAI (áudio)" valor={brl2(data.totais.openaiBrl)} sub="transcrição de áudios" />
            <Kpi label="Anúncios Meta" valor={data.anuncios.gastoBrl === null ? '—' : brl2(data.anuncios.gastoBrl)} sub={data.anuncios.configurado ? (data.anuncios.nota ?? 'gasto exato da Meta') : 'Meta Ads não conectado'} />
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi label="Gasto de APIs no mês" valor={brl2(data.totais.mesBrl)} sub="1º dia do mês até agora" />
            <Kpi label="Projeção do mês (APIs)" valor={brl2(data.totais.projecaoMesBrl)} sub="média diária × dias do mês" />
            <Kpi label="Custos fixos / mês" valor={brl2(data.totais.fixosMensalBrl)} sub={cfg?.fixos.length ? `${cfg.fixos.length} item(ns) cadastrado(s)` : 'cadastre abaixo'} />
            <Kpi label="Sistema por mês (estimado)" valor={brl2(data.totais.sistemaMensalEstimadoBrl)} sub="projeção de APIs + fixos (sem anúncios)" destaque />
          </div>

          <Card titulo="Custo por atendimento (no período)">
            <p className="text-sm text-slate-700">
              {nf(data.porLead.leads)} leads novos · {nf(data.porLead.conversaram)} conversaram · {nf(data.porLead.qualificados)} qualificados.{' '}
              Cada conversa custou <b>{brl2(data.porLead.brlPorConversa)}</b> em APIs; cada lead qualificado, <b>{brl2(data.porLead.brlPorQualificado)}</b>.
            </p>
          </Card>

          <Card titulo="Por modelo">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="text-left text-[11px] uppercase text-slate-500">
                  <tr><th className="py-1.5">Serviço / modelo</th><th>Chamadas</th><th>Entrada</th><th>Saída</th><th>Cache (escrita / leitura)</th><th className="text-right">Custo</th></tr>
                </thead>
                <tbody>
                  {data.porModelo.length === 0 && <tr><td colSpan={6} className="py-5 text-center text-slate-400">Ainda sem consumo registrado neste período.</td></tr>}
                  {data.porModelo.map((m) => (
                    <tr key={m.servico + m.modelo} className="border-t border-slate-100">
                      <td className="py-1.5"><b>{NOME[m.servico] ?? m.servico}</b> <span className="text-xs text-slate-500">{m.modelo}</span></td>
                      <td className="tabular-nums">{nf(m.chamadas)}</td>
                      <td className="tabular-nums">{nf(m.entrada)}</td>
                      <td className="tabular-nums">{nf(m.saida)}</td>
                      <td className="tabular-nums">{nf(m.cacheEscrita)} / {nf(m.cacheLeitura)}</td>
                      <td className="text-right font-bold tabular-nums">{brl2(m.brl)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Tokens são os números exatos devolvidos pelas APIs a cada chamada.
              {data.primeiroRegistro ? ` Registro desde ${new Date(data.primeiroRegistro).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}; o consumo anterior não foi medido.` : ' O registro começa a partir da primeira chamada depois desta atualização.'}
            </p>
          </Card>

          <Card titulo="Por dia (R$)">
            <div className="flex h-32 items-end gap-1">
              {data.porDia.map((d) => (
                <div key={d.dia} className="flex min-w-0 flex-1 flex-col items-center gap-1" title={`${d.dia}: Claude ${brl2(d.anthropic)} · OpenAI ${brl2(d.openai)}`}>
                  <div className="flex w-full flex-1 flex-col justify-end">
                    <div className="w-full bg-violet-400" style={{ height: `${(d.openai / maxDia) * 100}%` }} />
                    <div className="w-full rounded-t bg-sky-500" style={{ height: `${(d.anthropic / maxDia) * 100}%`, minHeight: d.anthropic ? 2 : 0 }} />
                  </div>
                  <span className="text-[9px] text-slate-500">{d.dia.slice(8)}</span>
                </div>
              ))}
            </div>
            <p className="mt-1 text-[11px] text-slate-500"><span className="text-sky-600">■</span> Claude · <span className="text-violet-500">■</span> OpenAI</p>
          </Card>
        </>
      )}

      {cfg && (
        <Card titulo="Preços e custos fixos (você controla)">
          <p className="mb-3 text-xs text-slate-600">
            Os <b>preços iniciais são um ponto de partida</b>: confirme no console da Anthropic e da OpenAI e corrija aqui — todo o histórico é recalculado.
            Valores em <b>dólar por 1 milhão de tokens</b>. Anúncios da Meta vêm direto da conta de anúncios (valor exato).
          </p>
          <label className="mb-3 block text-xs font-bold uppercase text-slate-500">Cotação do dólar (R$)
            <input type="number" step="0.01" min={1} value={cfg.cotacaoUsdBrl} onChange={(e) => setCfg({ ...cfg, cotacaoUsdBrl: Number(e.target.value) })}
              className="mt-1 h-9 w-32 rounded-lg border border-slate-300 px-2 text-sm" />
          </label>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="text-left text-[11px] uppercase text-slate-500">
                <tr><th className="py-1.5">Modelo</th><th>Entrada</th><th>Saída</th><th>Cache escrita</th><th>Cache leitura</th><th /></tr>
              </thead>
              <tbody>
                {Object.entries(cfg.precos).map(([modelo, p]) => (
                  <tr key={modelo} className="border-t border-slate-100">
                    <td className="py-1.5 pr-2 font-mono text-xs">{modelo}</td>
                    {(['entrada', 'saida', 'cacheEscrita', 'cacheLeitura'] as const).map((k) => (
                      <td key={k} className="pr-2">
                        <input type="number" step="0.01" min={0} value={p[k]}
                          onChange={(e) => setCfg({ ...cfg, precos: { ...cfg.precos, [modelo]: { ...p, [k]: Number(e.target.value) } } })}
                          className="h-8 w-24 rounded-lg border border-slate-300 px-2 text-sm" />
                      </td>
                    ))}
                    <td><button onClick={() => { const { [modelo]: _, ...resto } = cfg.precos; setCfg({ ...cfg, precos: resto }); }} className="text-xs font-bold text-rose-700 cursor-pointer">remover</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button onClick={() => { const nome = window.prompt('Nome exato do modelo (como aparece na tabela acima):'); if (nome && nome.trim().length > 1) setCfg({ ...cfg, precos: { ...cfg.precos, [nome.trim()]: { entrada: 0, saida: 0, cacheEscrita: 0, cacheLeitura: 0 } } }); }}
            className="mt-2 text-xs font-bold text-sky-700 cursor-pointer">+ Adicionar modelo</button>

          <h3 className="mb-1 mt-5 text-xs font-extrabold uppercase tracking-wide text-slate-600">Custos fixos mensais (R$)</h3>
          <p className="mb-2 text-xs text-slate-500">Ex.: hospedagem (Hostinger), servidor da Evolution API, plano do Supabase, domínio, ferramentas.</p>
          <div className="space-y-2">
            {cfg.fixos.map((f, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2">
                <input value={f.nome} maxLength={60} placeholder="Nome" onChange={(e) => setCfg({ ...cfg, fixos: cfg.fixos.map((x, j) => (j === i ? { ...x, nome: e.target.value } : x)) })}
                  className="h-9 min-w-48 flex-1 rounded-lg border border-slate-300 px-2 text-sm" />
                <input type="number" min={0} step="0.01" value={f.valorMensalBrl} onChange={(e) => setCfg({ ...cfg, fixos: cfg.fixos.map((x, j) => (j === i ? { ...x, valorMensalBrl: Number(e.target.value) } : x)) })}
                  className="h-9 w-32 rounded-lg border border-slate-300 px-2 text-sm" aria-label="Valor mensal" />
                <button onClick={() => setCfg({ ...cfg, fixos: cfg.fixos.filter((_, j) => j !== i) })} className="text-xs font-bold text-rose-700 cursor-pointer">remover</button>
              </div>
            ))}
          </div>
          <button onClick={() => setCfg({ ...cfg, fixos: [...cfg.fixos, { nome: '', valorMensalBrl: 0 }] })} className="mt-2 text-xs font-bold text-sky-700 cursor-pointer">+ Adicionar custo fixo</button>

          <div className="mt-4 flex items-center gap-3">
            <button onClick={salvar} className="rounded-lg bg-orange-500 px-5 py-2 text-sm font-extrabold text-white cursor-pointer">Salvar</button>
            <span className="text-sm font-semibold text-slate-600" role="status">{msg}</span>
          </div>
        </Card>
      )}
    </div>
  );
}
