import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSettings, saveSettings } from '@/lib/db/store';
import { exigirApi } from '@/lib/painel';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Estado do interruptor geral do agente. */
export async function GET(req: NextRequest) {
  const a = await exigirApi(req, 'admin');
  if ('erro' in a) return a.erro;
  const s = getSettings();
  return NextResponse.json({ ligado: s.agenteLigado, atualizadoEm: s.atualizadoEm }, { headers: { 'Cache-Control': 'no-store' } });
}

const schema = z.object({ ligado: z.boolean() });

/**
 * Liga/desliga o agente na hora (sem passar pelo formulário de configurações).
 * Desligado: não responde, não manda boas-vindas nem follow-ups. As mensagens continuam chegando no painel.
 */
export async function POST(req: NextRequest) {
  const a = await exigirApi(req, 'admin');
  if ('erro' in a) return a.erro;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ erro: 'dados inválidos' }, { status: 400 });
  const s = saveSettings({ agenteLigado: parsed.data.ligado });
  console.log(`[agente] ${s.agenteLigado ? 'LIGADO' : 'DESLIGADO'} pelo admin em ${s.atualizadoEm}`);
  return NextResponse.json({ ligado: s.agenteLigado, atualizadoEm: s.atualizadoEm });
}
