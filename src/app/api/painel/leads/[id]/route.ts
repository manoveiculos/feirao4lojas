import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { marcarProximoFollowup } from '@/lib/whatsapp/outbound';
import { addEvento, getMensagens, updateLead } from '@/lib/db/store';
import { exigirApi, leadAcessivel } from '@/lib/painel';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Ctx) {
  const a = await exigirApi(req);
  if ('erro' in a) return a.erro;
  const { id } = await params;
  const lead = leadAcessivel(a.sessao, id);
  if (!lead) return NextResponse.json({ erro: 'não encontrado' }, { status: 404 });

  if (req.nextUrl.searchParams.get('ler') === '1' && lead.naoLidas > 0) updateLead(id, { naoLidas: 0 });

  return NextResponse.json(
    { lead: { ...lead, naoLidas: req.nextUrl.searchParams.get('ler') === '1' ? 0 : lead.naoLidas }, mensagens: getMensagens(id) },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}

const patchSchema = z.object({
  status: z.enum(['novo', 'em_atendimento', 'qualificado', 'visita_agendada', 'visitou', 'comprou', 'perdido', 'optout']).optional(),
  notas: z.string().max(4000).optional(),
  nome: z.string().max(120).optional(),
  humano: z.boolean().optional(),
  agenteAtivo: z.boolean().optional(),
  lojaSlug: z.enum(['nenem-autos', 'rosa-automoveis', 'v3-automoveis', 'manos-veiculos']).nullable().optional(),
});

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const a = await exigirApi(req);
  if ('erro' in a) return a.erro;
  const { id } = await params;
  const lead = leadAcessivel(a.sessao, id);
  if (!lead) return NextResponse.json({ erro: 'não encontrado' }, { status: 404 });

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ erro: 'dados inválidos' }, { status: 400 });
  const d = parsed.data;

  // só o admin redistribui entre lojas
  if (d.lojaSlug !== undefined && a.sessao.papel !== 'admin') {
    return NextResponse.json({ erro: 'apenas o admin pode trocar a loja' }, { status: 403 });
  }

  const patch: Record<string, unknown> = { ...d };
  if (d.humano === false) patch.humanoMotivo = '';
  if (d.humano === true) patch.proximoFollowupEm = null;
  if (d.status === 'optout') {
    patch.optoutEm = new Date().toISOString();
    patch.proximoFollowupEm = null;
  }
  if (d.status && ['comprou', 'perdido'].includes(d.status)) patch.proximoFollowupEm = null;

  const novo = updateLead(id, patch)!;
  if (d.status && d.status !== lead.status) {
    addEvento({ tipo: 'lead_status', leadId: id, lojaSlug: novo.lojaSlug, meta: { de: lead.status, para: d.status, por: a.sessao.papel === 'admin' ? 'admin' : (a.sessao.loja ?? '') } });
  }
  if (d.humano === false) marcarProximoFollowup(novo);
  return NextResponse.json({ ok: true, lead: novo });
}
