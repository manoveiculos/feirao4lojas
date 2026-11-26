import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { configCustos } from '@/lib/custos/medidor';
import { montarCustos, PERIODOS_CUSTOS, type PeriodoCustos } from '@/lib/custos/resumo';
import { saveSettings } from '@/lib/db/store';
import { exigirApi } from '@/lib/painel';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Custo das APIs do sistema (somente admin). */
export async function GET(req: NextRequest) {
  const a = await exigirApi(req, 'admin');
  if ('erro' in a) return a.erro;
  const p = req.nextUrl.searchParams.get('periodo') as PeriodoCustos;
  const periodo: PeriodoCustos = PERIODOS_CUSTOS.some(([v]) => v === p) ? p : '30d';
  return NextResponse.json(await montarCustos(periodo), { headers: { 'Cache-Control': 'no-store' } });
}

const preco = z.object({
  entrada: z.number().min(0).max(10_000),
  saida: z.number().min(0).max(10_000),
  cacheEscrita: z.number().min(0).max(10_000),
  cacheLeitura: z.number().min(0).max(10_000),
});
const schema = z.object({
  cotacaoUsdBrl: z.number().min(1).max(50),
  precos: z.record(z.string().min(2).max(80), preco).refine((r) => Object.keys(r).length <= 30, 'muitos modelos'),
  fixos: z.array(z.object({ nome: z.string().trim().min(1).max(60), valorMensalBrl: z.number().min(0).max(1_000_000) })).max(30),
});

/** Salva preços, cotação e custos fixos (o histórico é recalculado com os novos preços). */
export async function PUT(req: NextRequest) {
  const a = await exigirApi(req, 'admin');
  if ('erro' in a) return a.erro;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ erro: 'Configuração inválida', detalhes: parsed.error.issues.map((i) => i.path.join('.')) }, { status: 400 });
  }
  saveSettings({ custos: parsed.data });
  return NextResponse.json({ ok: true, config: configCustos() });
}
