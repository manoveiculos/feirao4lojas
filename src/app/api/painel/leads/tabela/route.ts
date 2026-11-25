import { NextRequest, NextResponse } from 'next/server';
import { LOJAS_BY_SLUG } from '@/lib/config';
import type { Lead } from '@/lib/db/types';
import { escopoDe, exigirApi } from '@/lib/painel';
import { leadsVisiveis } from '@/lib/stats';
import type { LojaSlug } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Data AAAA-MM-DD interpretada em Brasília (UTC-3). */
function inicioDia(d: string | null): number | null {
  if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
  const t = Date.parse(`${d}T00:00:00-03:00`);
  return Number.isNaN(t) ? null : t;
}

function interesseDe(l: Lead): string {
  const p = l.perfil;
  return [p.veiculosInteresse.join(', '), p.marca_modelo, p.categoria].filter(Boolean).join(' · ');
}

function linha(l: Lead) {
  const p = l.perfil;
  return {
    id: l.id,
    nome: l.nome,
    telefone: l.telefone,
    lojaSlug: l.lojaSlug,
    lojaNome: l.lojaSlug ? LOJAS_BY_SLUG[l.lojaSlug as LojaSlug]?.nome ?? l.lojaSlug : '',
    status: l.status,
    temperatura: l.temperatura,
    score: l.score,
    qualificado: Boolean(l.qualificadoEm),
    humano: l.humano,
    naoLidas: l.naoLidas,
    interesse: interesseDe(l),
    orcamento: p.orcamento,
    entrada: p.entrada,
    troca: p.temTroca === null ? '' : p.temTroca ? [p.trocaModelo, p.trocaAno].filter(Boolean).join(' ') || 'Sim' : 'Não',
    prazo: p.prazoCompra ?? '',
    visita: l.visita.quando ?? '',
    canal: l.origem.canal,
    campanha: l.origem.utm_campaign || (l.origem.ad_id ? `ad ${l.origem.ad_id}` : ''),
    origemUtm: l.origem.utm_source,
    resumo: l.resumo,
    mensagens: l.totalMensagensLead,
    criadoEm: l.criadoEm,
    ultimaMensagemEm: l.ultimaMensagemEm,
    qualificadoEm: l.qualificadoEm,
  };
}

const ORDEM: Record<string, (l: Lead) => number | string> = {
  criado: (l) => Date.parse(l.criadoEm),
  ultima: (l) => Date.parse(l.ultimaMensagemEm ?? l.criadoEm),
  score: (l) => l.score,
  nome: (l) => (l.nome || l.telefone).toLowerCase(),
  orcamento: (l) => l.perfil.orcamento ?? -1,
};

const csv = (v: unknown) => {
  const s = String(v ?? '').replace(/\r?\n/g, ' ');
  return /[";]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export async function GET(req: NextRequest) {
  const a = await exigirApi(req);
  if ('erro' in a) return a.erro;
  const sp = req.nextUrl.searchParams;
  const admin = a.sessao.papel === 'admin';

  const base = leadsVisiveis(escopoDe(a.sessao));

  // Opções dos filtros (calculadas sobre tudo o que o usuário pode ver)
  const canais = [...new Set(base.map((l) => l.origem.canal))].sort();
  const campanhas = [...new Set(base.map((l) => l.origem.utm_campaign).filter(Boolean))].sort();

  let leads = base;
  const q = (sp.get('q') || '').toLowerCase().trim();
  const status = sp.get('status');
  const temp = sp.get('temp');
  const canal = sp.get('canal');
  const campanha = sp.get('campanha');
  const loja = sp.get('loja');
  const de = inicioDia(sp.get('de'));
  const ate = inicioDia(sp.get('ate'));
  const scoreMin = Number(sp.get('scoreMin') || 0);

  if (q) {
    const digitos = q.replace(/\D/g, '');
    leads = leads.filter(
      (l) =>
        l.nome.toLowerCase().includes(q) ||
        (digitos.length >= 3 && l.telefone.includes(digitos)) ||
        interesseDe(l).toLowerCase().includes(q)
    );
  }
  if (status) leads = leads.filter((l) => l.status === status);
  if (temp) leads = leads.filter((l) => l.temperatura === temp);
  if (canal) leads = leads.filter((l) => l.origem.canal === canal);
  if (campanha) leads = leads.filter((l) => l.origem.utm_campaign === campanha);
  if (admin && loja) leads = leads.filter((l) => (loja === 'sem-loja' ? !l.lojaSlug : l.lojaSlug === loja));
  if (de !== null) leads = leads.filter((l) => Date.parse(l.criadoEm) >= de);
  if (ate !== null) leads = leads.filter((l) => Date.parse(l.criadoEm) < ate + 86400_000);
  if (scoreMin > 0) leads = leads.filter((l) => l.score >= scoreMin);
  if (sp.get('qualificado') === '1') leads = leads.filter((l) => l.qualificadoEm);
  if (sp.get('humano') === '1') leads = leads.filter((l) => l.humano);
  if (sp.get('troca') === '1') leads = leads.filter((l) => l.perfil.temTroca === true);
  if (sp.get('visita') === '1') leads = leads.filter((l) => l.visita.quando);
  if (sp.get('semResposta') === '1') leads = leads.filter((l) => l.totalMensagensLead === 0);

  const chave = ORDEM[sp.get('ordenar') || 'criado'] ?? ORDEM.criado;
  const dir = sp.get('dir') === 'asc' ? 1 : -1;
  leads = [...leads].sort((x, y) => {
    const a1 = chave(x);
    const b1 = chave(y);
    return (a1 < b1 ? -1 : a1 > b1 ? 1 : 0) * dir;
  });

  if (sp.get('formato') === 'csv') {
    const cab = ['Nome', 'Telefone', 'Loja', 'Status', 'Temperatura', 'Score', 'Qualificado', 'Interesse', 'Orçamento', 'Entrada', 'Troca', 'Prazo', 'Visita', 'Origem', 'Campanha', 'Resumo', 'Criado em'];
    const linhas = leads.map(linha).map((r) =>
      [r.nome, `+${r.telefone}`, r.lojaNome, r.status, r.temperatura, r.score, r.qualificado ? 'sim' : 'não', r.interesse, r.orcamento ?? '', r.entrada ?? '', r.troca, r.prazo, r.visita, r.canal, r.campanha, r.resumo, r.criadoEm].map(csv).join(';')
    );
    return new NextResponse('﻿' + [cab.join(';'), ...linhas].join('\r\n'), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="leads-acelera-v3-${new Date().toISOString().slice(0, 10)}.csv"`,
        'Cache-Control': 'no-store',
      },
    });
  }

  const tamanho = Math.min(100, Math.max(10, Number(sp.get('tamanho') || 25)));
  const total = leads.length;
  const paginas = Math.max(1, Math.ceil(total / tamanho));
  const pagina = Math.min(paginas, Math.max(1, Number(sp.get('pagina') || 1)));
  const fatia = leads.slice((pagina - 1) * tamanho, pagina * tamanho);

  return NextResponse.json(
    {
      total,
      pagina,
      paginas,
      tamanho,
      resumo: {
        qualificados: leads.filter((l) => l.qualificadoEm).length,
        quentes: leads.filter((l) => l.temperatura === 'quente').length,
        comVisita: leads.filter((l) => l.visita.quando).length,
      },
      opcoes: { canais, campanhas },
      leads: fatia.map(linha),
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
