'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Bot,
  Check,
  Code2,
  Copy,
  Play,
  RefreshCw,
  Terminal,
} from 'lucide-react';

interface EndpointDoc {
  method: 'GET' | 'POST';
  path: string;
  title: string;
  description: string;
  exampleQuery: string;
}

const ENDPOINTS: EndpointDoc[] = [
  {
    method: 'GET',
    path: '/api/chatbot/resumo',
    title: 'Resumo Geral + Catálogo Compacto (Todos os Carros)',
    description:
      'Retorna o total de carros, contagem por loja, marcas, categorias, faixa de preços, resumo em texto natural e a lista enxuta de TODOS os veículos das 4 lojas. Perfeito para o chatbot saber tudo o que existe no feirão.',
    exampleQuery: '/api/chatbot/resumo',
  },
  {
    method: 'GET',
    path: '/api/chatbot/buscar',
    title: 'Busca Inteligente para Chatbot de WhatsApp',
    description:
      'Busca por palavra-chave (q), código (codigo), orçamento máximo (orcamento), marca, categoria, câmbio, combustível ou loja. Já devolve os veículos com fotos + uma mensagem pronta formatada para WhatsApp (mensagemProntaWhatsapp).',
    exampleQuery: '/api/chatbot/buscar?categoria=suv&orcamento=150000&limit=5',
  },
  {
    method: 'GET',
    path: '/api/veiculos',
    title: 'Listagem Completa com Filtros e Paginação',
    description:
      'Lista todos os veículos com filtros combinados (q, loja, marca, modelo, categoria, cambio, combustivel, precoMin, precoMax, anoMin, anoMax, kmMax, ordenar, page, limit). Use ?formato=compacto para payloads menores.',
    exampleQuery: '/api/veiculos?formato=compacto&limit=10',
  },
  {
    method: 'GET',
    path: '/api/veiculos/[codigo-ou-id]',
    title: 'Ficha 100% Completa de um Carro Específico',
    description:
      'Aceita o código curto que vai na mensagem do WhatsApp (ex: NA-001, V3-001, MV-001, RA-001) ou o ID completo. Retorna todas as fotos, todos os opcionais, descrição, dados da loja e texto formatado para WhatsApp.',
    exampleQuery: '/api/veiculos/NA-001',
  },
  {
    method: 'GET',
    path: '/api/lojas',
    title: 'Dados das 4 Lojas Participantes',
    description:
      'Retorna nome, endereço, cidade, logo e quantidade atual de veículos de cada uma das 4 lojas do feirão.',
    exampleQuery: '/api/lojas',
  },
  {
    method: 'POST',
    path: '/api/sync',
    title: 'Atualizar / Re-extrair Estoque das 4 Lojas',
    description:
      'Dispara o extrator em tempo real nos 4 sites e atualiza a base do feirão. Pode ser agendado via cron (ex: a cada 1 hora) enviando Authorization: Bearer <SYNC_SECRET>.',
    exampleQuery: '/api/sync',
  },
];

export default function ApiDocsPage() {
  const [testUrl, setTestUrl] = useState(
    '/api/chatbot/buscar?categoria=suv&orcamento=160000&limit=3'
  );
  const [loading, setLoading] = useState(false);
  const [responseJson, setResponseJson] = useState<string>('');
  const [waPreview, setWaPreview] = useState<string>('');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const runTest = async (urlToRun?: string) => {
    const target = urlToRun || testUrl;
    if (urlToRun) setTestUrl(urlToRun);
    setLoading(true);
    try {
      const res = await fetch(target);
      const data = await res.json();
      setResponseJson(JSON.stringify(data, null, 2));
      setWaPreview(
        data.mensagemProntaWhatsapp ||
          data.textoWhatsapp ||
          data.resumoTexto ||
          ''
      );
    } catch (err) {
      setResponseJson(`Erro ao testar endpoint: ${String(err)}`);
      setWaPreview('');
    } finally {
      setLoading(false);
    }
  };

  const copyText = (key: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1800);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-white/10 bg-slate-950/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-500/30">
              <Bot className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-base font-extrabold text-white sm:text-lg">
                API do Chatbot — Feirão 4 Lojas
              </h1>
              <p className="text-xs text-slate-400">
                Endpoints REST JSON prontos para WhatsApp (n8n, Typebot, IA,
                Manychat, Evolution API)
              </p>
            </div>
          </div>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 bg-white/5 px-3.5 py-2 text-xs font-bold text-white transition hover:bg-white/10"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar ao Feirão
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-8 px-4 py-8 sm:px-6">
        {/* Live API Tester */}
        <section className="rounded-2xl border border-emerald-500/25 bg-slate-900 p-5 sm:p-6">
          <div className="flex items-center gap-2 text-emerald-400">
            <Terminal className="h-5 w-5" />
            <h2 className="text-base font-extrabold text-white">
              Testar API ao Vivo
            </h2>
          </div>
          <p className="mt-1 text-xs text-slate-400">
            Experimente consultar o estoque real das 4 lojas exatamente como o
            seu chatbot do WhatsApp vai fazer.
          </p>

          <div className="mt-4 flex flex-col gap-2.5 sm:flex-row">
            <input
              type="text"
              value={testUrl}
              onChange={(e) => setTestUrl(e.target.value)}
              className="h-11 flex-1 rounded-xl border border-white/15 bg-slate-950 px-4 font-mono text-xs text-emerald-300 focus:border-emerald-400 focus:outline-none sm:text-sm"
            />
            <button
              type="button"
              onClick={() => runTest()}
              disabled={loading}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-emerald-500 px-5 text-xs font-extrabold text-slate-950 transition hover:bg-emerald-400 disabled:opacity-50 cursor-pointer"
            >
              {loading ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <Play className="h-4 w-4" />
              )}
              Executar GET
            </button>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {[
              { label: 'Resumo de Todos os Carros', url: '/api/chatbot/resumo' },
              {
                label: 'Buscar SUVs até R$ 160 mil',
                url: '/api/chatbot/buscar?categoria=suv&orcamento=160000&limit=3',
              },
              {
                label: 'Buscar Elétricos',
                url: '/api/chatbot/buscar?combustivel=eletrico',
              },
              {
                label: 'Ficha do Cód NA-001',
                url: '/api/veiculos/NA-001',
              },
              {
                label: 'Listar 4 Lojas',
                url: '/api/lojas',
              },
            ].map((q) => (
              <button
                key={q.url}
                type="button"
                onClick={() => runTest(q.url)}
                className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-semibold text-slate-300 transition hover:border-emerald-400/50 hover:text-white cursor-pointer"
              >
                {q.label}
              </button>
            ))}
          </div>

          {(responseJson || waPreview) && (
            <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-12">
              {waPreview && (
                <div className="rounded-xl border border-emerald-500/30 bg-[#0b141a] p-4 lg:col-span-5">
                  <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-emerald-400">
                    Prévia da Mensagem Pronta p/ WhatsApp
                  </p>
                  <div className="rounded-xl bg-[#005c4b] p-3.5 text-xs leading-relaxed whitespace-pre-line text-white shadow">
                    {waPreview}
                  </div>
                </div>
              )}

              <div
                className={`rounded-xl border border-white/10 bg-slate-950 p-4 ${
                  waPreview ? 'lg:col-span-7' : 'lg:col-span-12'
                }`}
              >
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    Resposta JSON
                  </p>
                  <button
                    type="button"
                    onClick={() => copyText('json', responseJson)}
                    className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-white cursor-pointer"
                  >
                    {copiedKey === 'json' ? (
                      <Check className="h-3.5 w-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                    Copiar
                  </button>
                </div>
                <pre className="thin-scrollbar max-h-96 overflow-auto font-mono text-[11px] text-slate-300">
                  {responseJson}
                </pre>
              </div>
            </div>
          )}
        </section>

        {/* Endpoints Reference */}
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <Code2 className="h-5 w-5 text-amber-400" />
            <h2 className="text-lg font-extrabold text-white">
              Referência dos Endpoints
            </h2>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {ENDPOINTS.map((ep) => (
              <div
                key={ep.path}
                className="flex flex-col justify-between rounded-2xl border border-white/10 bg-slate-900 p-5"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-md px-2 py-0.5 font-mono text-[11px] font-extrabold ${
                        ep.method === 'GET'
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : 'bg-amber-500/20 text-amber-300'
                      }`}
                    >
                      {ep.method}
                    </span>
                    <code className="font-mono text-xs font-bold text-white">
                      {ep.path}
                    </code>
                  </div>
                  <h3 className="mt-2.5 text-sm font-extrabold text-white">
                    {ep.title}
                  </h3>
                  <p className="mt-1.5 text-xs leading-relaxed text-slate-400">
                    {ep.description}
                  </p>
                </div>

                {ep.method === 'GET' && (
                  <div className="mt-4 flex items-center justify-between gap-2 border-t border-white/10 pt-3">
                    <code className="truncate font-mono text-[11px] text-emerald-300">
                      {ep.exampleQuery}
                    </code>
                    <button
                      type="button"
                      onClick={() => runTest(ep.exampleQuery)}
                      className="shrink-0 rounded-lg bg-white/10 px-3 py-1 text-[11px] font-bold text-white transition hover:bg-emerald-500 hover:text-slate-950 cursor-pointer"
                    >
                      Testar
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* Chatbot Integration Tip */}
        <section className="rounded-2xl border border-white/10 bg-slate-900 p-5 sm:p-6">
          <h2 className="text-base font-extrabold text-white">
            Como o Chatbot identifica o carro automaticamente
          </h2>
          <p className="mt-2 text-xs leading-relaxed text-slate-300 sm:text-sm">
            Cada botão de WhatsApp da página do Feirão envia automaticamente o{' '}
            <strong className="text-amber-300">código único do veículo</strong>{' '}
            na mensagem inicial do cliente, por exemplo:{' '}
            <code className="rounded bg-white/10 px-1.5 py-0.5 text-emerald-300">
              [Cód: V3-001]
            </code>
            . No seu fluxo do chatbot (n8n, Typebot ou Agente de IA), basta
            extrair esse código (regex{' '}
            <code className="rounded bg-white/10 px-1.5 py-0.5 text-amber-300">
              {'/[A-Z0-9]{2}-\\d{3}/'}
            </code>
            ) e fazer um <code className="text-emerald-300">GET /api/veiculos/V3-001</code>{' '}
            para obter na hora todas as fotos, opcionais, preço, loja e resposta
            pronta para enviar ao cliente!
          </p>
        </section>
      </main>
    </div>
  );
}
