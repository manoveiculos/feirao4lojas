import { NextRequest, NextResponse } from 'next/server';
import { getEsperaControle, getLead, listEspera } from '@/lib/db/store';
import type { EsperaStatus } from '@/lib/db/types';
import { loadEstoque } from '@/lib/estoque';
import { exigirApi } from '@/lib/painel';
import { normalizeSearch } from '@/lib/filters';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const STATUS: EsperaStatus[] = ['aguardando', 'notificado', 'em_atendimento', 'encerrado'];

/** Lista de espera (somente Admin Geral). Filtros: q (modelo/marca/categoria/nome/telefone) e status. */
export async function GET(req: NextRequest) {
  // admin e lojas consultam; alterar status continua só com o admin (espera/[id])
  const a = await exigirApi(req);
  if ('erro' in a) return a.erro;
  const sp = req.nextUrl.searchParams;
  const q = normalizeSearch(sp.get('q') || '');
  const status = sp.get('status') as EsperaStatus | null;

  const estoque = new Map(loadEstoque().veiculos.map((v) => [v.id, v]));
  const todos = listEspera().filter((e) => !e.teste);
  let itens = todos;
  if (status && STATUS.includes(status)) itens = itens.filter((e) => e.status === status);
  if (q) {
    const dig = q.replace(/\D/g, '');
    itens = itens.filter(
      (e) =>
        normalizeSearch([e.marca, e.modelo, e.categoria, e.nome, e.observacoes].filter(Boolean).join(' ')).includes(q) ||
        (dig.length >= 3 && e.telefone.includes(dig))
    );
  }
  itens = [...itens].sort((x, y) => y.createdAt.localeCompare(x.createdAt));

  const contagem = Object.fromEntries(STATUS.map((s) => [s, todos.filter((e) => e.status === s).length]));
  const modelos = [...new Set(todos.map((e) => e.modelo || e.categoria || '').filter(Boolean))].sort();
  const controle = getEsperaControle();

  return NextResponse.json(
    {
      total: itens.length,
      contagem,
      modelos,
      motor: { ultimaVerificacao: controle.ultimaVerificacao, pendentes: controle.pendentes.length, veiculosConhecidos: controle.conhecidos.length },
      itens: itens.slice(0, 500).map((e) => {
        const v = e.matchedVehicleId ? estoque.get(e.matchedVehicleId) : undefined;
        const lead = getLead(e.leadId);
        return {
          ...e,
          leadNome: lead?.nome || e.nome,
          leadStatus: lead?.status ?? null,
          lojaResponsavel: lead?.lojaSlug ?? null,
          veiculo: v ? { codigo: v.codigo, titulo: v.titulo, ano: v.anoTexto, preco: v.precoFormatado, loja: v.lojaNome, ativo: true } : e.matchedCodigo ? { codigo: e.matchedCodigo, ativo: false } : null,
        };
      }),
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
