import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { updateLead } from '@/lib/db/store';
import { exigirApi, leadAcessivel } from '@/lib/painel';
import { sincronizarLead } from '@/lib/db/sync';
import { enviarTexto } from '@/lib/whatsapp/outbound';

export const runtime = 'nodejs';

const schema = z.object({ texto: z.string().trim().min(1).max(3000) });

/** A loja responde ao cliente pelo painel: o agente fica pausado até ser devolvido. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const a = await exigirApi(req);
  if ('erro' in a) return a.erro;
  const { id } = await params;
  await sincronizarLead(id); // versão mais recente, mesmo se outra instância mexeu
  const lead = leadAcessivel(a.sessao, id);
  if (!lead) return NextResponse.json({ erro: 'não encontrado' }, { status: 404 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ erro: 'mensagem inválida' }, { status: 400 });
  if (lead.status === 'optout') {
    return NextResponse.json({ erro: 'Este cliente pediu para não receber mensagens.' }, { status: 409 });
  }

  const r = await enviarTexto(lead, parsed.data.texto, { autor: 'humano' });
  if (!r.ok) return NextResponse.json({ erro: r.erro || 'falha no envio' }, { status: 502 });

  updateLead(id, {
    humano: true,
    humanoMotivo: a.sessao.papel === 'admin' ? 'Admin respondeu pelo painel' : 'Loja respondeu pelo painel',
    proximoFollowupEm: null,
    naoLidas: 0,
  });
  return NextResponse.json({ ok: true });
}
