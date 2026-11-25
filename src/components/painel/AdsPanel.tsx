'use client';

import { useState } from 'react';
import { Card, Kpi, brl, usePolling } from './ui';

interface Ads {
  configurado: boolean; erro?: string; periodo: string; atualizadoEm: string;
  campanhas: Array<{
    campanhaId: string; campanha: string; gasto: number; impressoes: number; cliques: number; ctr: number; cpc: number;
    conversasMeta: number; leads: number; qualificados: number; visitas: number; cpl: number | null; cpq: number | null;
    anuncios: Array<{ adId: string; nome: string; gasto: number; leads: number; qualificados: number }>;
  }>;
  totais: { gasto: number; leads: number; qualificados: number; visitas: number; cpl: number | null; cpq: number | null };
  semAtribuicao: { leads: number; qualificados: number };
}
interface Status { urls: { feedMeta: string; feedMetaVeiculos: string; feedMetaCsv: string; webhookEvolution: string; webhookMeta: string } }

const PERIODOS: Array<[string, string]> = [
  ['today', 'Hoje'], ['yesterday', 'Ontem'], ['last_7d', '7 dias'], ['last_14d', '14 dias'], ['last_30d', '30 dias'], ['maximum', 'Tudo'],
];

export function AdsPanel() {
  const [periodo, setPeriodo] = useState('last_7d');
  const { data: a, erro } = usePolling<Ads>(`/api/admin/ads?periodo=${periodo}`, 30000);
  const { data: st } = usePolling<Status>('/api/admin/status', 600000);
  const [aberta, setAberta] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {PERIODOS.map(([v, l]) => (
          <button key={v} onClick={() => setPeriodo(v)}
            className={`rounded-full px-3 py-1.5 text-xs font-bold cursor-pointer ${periodo === v ? 'bg-orange-500 text-white' : 'bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100'}`}>{l}</button>
        ))}
        <span className="ml-auto text-xs text-slate-500">Atualiza a cada 30 s</span>
      </div>

      {a && !a.configurado && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <b>Meta Ads não conectado.</b> Defina <code>META_ADS_TOKEN</code> e <code>META_AD_ACCOUNT_ID</code> no ambiente para ver gasto,
          cliques e custo por lead qualificado aqui. Enquanto isso, os leads já aparecem por UTM/anúncio.
        </div>
      )}
      {a?.erro && <div className="rounded-2xl border border-rose-300 bg-rose-50 p-4 text-sm text-rose-800">Erro na Meta: {a.erro}</div>}
      {erro && <p className="text-sm text-rose-600">Falha ao carregar: {erro}</p>}

      {a && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <Kpi label="Investido" valor={brl(a.totais.gasto)} />
            <Kpi label="Leads" valor={a.totais.leads} sub={`CPL ${brl(a.totais.cpl)}`} />
            <Kpi label="Qualificados" valor={a.totais.qualificados} sub={`CPQ ${brl(a.totais.cpq)}`} destaque />
            <Kpi label="Visitas" valor={a.totais.visitas} />
            <Kpi label="Sem atribuição" valor={a.semAtribuicao.leads} sub="leads sem campanha/anúncio" />
          </div>

          <Card titulo="Campanhas">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="text-left text-[11px] uppercase text-slate-500">
                  <tr><th className="py-1">Campanha</th><th>Gasto</th><th>Cliques</th><th>CTR</th><th>Conversas</th><th>Leads</th><th>Qualif.</th><th>CPL</th><th>CPQ</th></tr>
                </thead>
                <tbody>
                  {a.campanhas.length === 0 && <tr><td colSpan={9} className="py-4 text-slate-400">Nenhum dado no período.</td></tr>}
                  {a.campanhas.map((c) => (
                    <>
                      <tr key={c.campanhaId} onClick={() => setAberta(aberta === c.campanhaId ? null : c.campanhaId)} className="cursor-pointer border-t border-slate-100 hover:bg-slate-50">
                        <td className="max-w-[18rem] truncate py-2 font-semibold" title={c.campanha}>{aberta === c.campanhaId ? '▾' : '▸'} {c.campanha}</td>
                        <td className="tabular-nums">{brl(c.gasto)}</td>
                        <td className="tabular-nums">{c.cliques}</td>
                        <td className="tabular-nums">{c.ctr.toFixed(2)}%</td>
                        <td className="tabular-nums">{c.conversasMeta}</td>
                        <td className="tabular-nums">{c.leads}</td>
                        <td className="tabular-nums font-bold text-emerald-700">{c.qualificados}</td>
                        <td className="tabular-nums">{brl(c.cpl)}</td>
                        <td className="tabular-nums font-bold">{brl(c.cpq)}</td>
                      </tr>
                      {aberta === c.campanhaId && c.anuncios.map((ad) => (
                        <tr key={ad.adId} className="bg-slate-50 text-xs text-slate-600">
                          <td className="max-w-[18rem] truncate py-1.5 pl-6" title={ad.nome}>{ad.nome}</td>
                          <td className="tabular-nums">{brl(ad.gasto)}</td><td colSpan={3} />
                          <td className="tabular-nums">{ad.leads}</td><td className="tabular-nums">{ad.qualificados}</td>
                          <td className="tabular-nums">{ad.leads ? brl(ad.gasto / ad.leads) : '—'}</td>
                          <td className="tabular-nums">{ad.qualificados ? brl(ad.gasto / ad.qualificados) : '—'}</td>
                        </tr>
                      ))}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs text-slate-500">
              <b>CPL</b> = gasto ÷ leads reais no nosso CRM. <b>CPQ</b> = gasto ÷ leads qualificados pelo agente. Leads são ligados à campanha
              pelo anúncio click-to-WhatsApp ou pelo <code>utm_campaign</code> (use o ID ou o nome exato da campanha).
            </p>
          </Card>
        </>
      )}

      <Card titulo="Estoque integrado ao catálogo da Meta">
        <p className="text-sm text-slate-600">
          Feed com todos os carros (foto, preço, km, loja) que atualiza sozinho a cada hora. Cadastre no Gerenciador de Comércio → Catálogo →
          Fontes de dados → <i>Feed agendado</i> (XML, a cada hora). Os grupos <code>custom_label_0..4</code> já separam por loja,
          categoria, faixa de preço, pronta entrega e ano — prontos para conjuntos de produtos.
        </p>
        {([
          ['XML — catálogo de comércio (padrão)', st?.urls.feedMeta],
          ['XML — catálogo de veículos (anúncios automotivos)', st?.urls.feedMetaVeiculos],
          ['CSV (alternativo)', st?.urls.feedMetaCsv],
        ] as const).map(([rotulo, url]) => (
          <label key={rotulo} className="mt-3 block text-[11px] font-bold uppercase text-slate-500">{rotulo}
            <input readOnly value={url ?? ''} onFocus={(e) => e.target.select()}
              className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 font-mono text-xs normal-case" />
          </label>
        ))}
        <p className="mt-2 text-xs text-slate-500">
          Cada anúncio leva para <code>/?carro=CÓDIGO</code> (abre a ficha do carro) com UTMs do catálogo. Para campanhas click-to-WhatsApp,
          o agente recebe o ID do anúncio automaticamente.
        </p>
      </Card>
    </div>
  );
}
