import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { sessaoDaRequest } from '@/lib/auth';
import { rodarMatchEspera } from '@/lib/espera/espera';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function segredoOk(req: NextRequest): boolean {
  const enviado = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || req.headers.get('x-sync-token') || '';
  if (!enviado) return false;
  return [process.env.CRON_SECRET, process.env.SYNC_SECRET].some((s) => {
    if (!s) return false;
    const a = Buffer.from(enviado);
    const b = Buffer.from(s);
    return a.length === b.length && timingSafeEqual(a, b);
  });
}

const schema = z
  .object({
    /** Cruza TODO o estoque atual (o anti-spam por veículo continua valendo). */
    todos: z.boolean().optional(),
    /** Cruza só estes veículos (ids do estoque). */
    veiculoIds: z.array(z.string().max(200)).max(500).optional(),
    /** Envia mesmo fora do horário comercial (8h–20h). */
    ignorarHorario: z.boolean().optional(),
  })
  .default({});

/**
 * Motor de match da lista de espera. Roda sozinho depois de cada sincronização do estoque e a cada
 * minuto no agendador; esta rota permite disparar por cron externo (Bearer CRON_SECRET/SYNC_SECRET)
 * ou pelo admin no painel.
 */
export async function POST(req: NextRequest) {
  const sessao = await sessaoDaRequest(req).catch(() => null);
  if (!segredoOk(req) && sessao?.papel !== 'admin') {
    return NextResponse.json({ erro: 'não autorizado' }, { status: 401 });
  }
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ erro: 'dados inválidos' }, { status: 400 });
  const d = parsed.data;
  const r = await rodarMatchEspera({ forcarTodos: d.todos, veiculoIds: d.veiculoIds, ignorarHorario: d.ignorarHorario });
  return NextResponse.json(r, { headers: { 'Cache-Control': 'no-store' } });
}
