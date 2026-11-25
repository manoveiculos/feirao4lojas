import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getEspera, updateEspera } from '@/lib/db/store';
import { exigirApi } from '@/lib/painel';

export const runtime = 'nodejs';

const schema = z.object({
  status: z.enum(['aguardando', 'notificado', 'em_atendimento', 'encerrado']).optional(),
  observacoes: z.string().max(500).optional(),
});

/** Admin muda o status de um registro (ex.: encerrar, ou voltar para "aguardando"). */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const a = await exigirApi(req, 'admin');
  if ('erro' in a) return a.erro;
  const { id } = await params;
  if (!getEspera(id)) return NextResponse.json({ erro: 'não encontrado' }, { status: 404 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ erro: 'dados inválidos' }, { status: 400 });
  return NextResponse.json({ ok: true, item: updateEspera(id, parsed.data) });
}
