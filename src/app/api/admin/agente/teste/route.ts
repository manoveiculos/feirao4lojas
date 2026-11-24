import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { responderLead } from '@/lib/agent/engine';
import { addMensagem, createLead, deleteLeadTeste, findLeadByTelefone, getLead, getMensagens, updateLead } from '@/lib/db/store';
import { exigirApi } from '@/lib/painel';

export const runtime = 'nodejs';
export const maxDuration = 120;

const TEL_TESTE = '5500000000000';

function leadTeste() {
  const existente = findLeadByTelefone(TEL_TESTE);
  if (existente) return existente;
  return createLead({ telefone: TEL_TESTE, nome: 'Teste Admin', teste: true });
}

/** Estado da conversa de teste. */
export async function GET(req: NextRequest) {
  const a = await exigirApi(req, 'admin');
  if ('erro' in a) return a.erro;
  const lead = leadTeste();
  return NextResponse.json({ lead, mensagens: getMensagens(lead.id) });
}

const schema = z.object({ texto: z.string().trim().min(1).max(2000) });

/** Conversa com o agente sem enviar nada ao WhatsApp. */
export async function POST(req: NextRequest) {
  const a = await exigirApi(req, 'admin');
  if ('erro' in a) return a.erro;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ erro: 'mensagem inválida' }, { status: 400 });

  const lead = leadTeste();
  updateLead(lead.id, { humano: false });
  addMensagem({ leadId: lead.id, autor: 'lead', texto: parsed.data.texto, midias: [], waId: '' });
  const r = await responderLead(lead.id, true);
  return NextResponse.json({ ...r, lead: getLead(lead.id), mensagens: getMensagens(lead.id) });
}

/** Reinicia a conversa de teste. */
export async function DELETE(req: NextRequest) {
  const a = await exigirApi(req, 'admin');
  if ('erro' in a) return a.erro;
  deleteLeadTeste(leadTeste().id);
  return NextResponse.json({ ok: true });
}
