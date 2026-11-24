import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSettings, normalizarTelefone, saveSettings } from '@/lib/db/store';
import { exigirApi } from '@/lib/painel';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const a = await exigirApi(req, 'admin');
  if ('erro' in a) return a.erro;
  return NextResponse.json(getSettings());
}

const tel = z.string().max(20).transform((v) => (v.trim() ? normalizarTelefone(v) : ''));

const schema = z.object({
  agenteLigado: z.boolean(),
  boasVindasProativas: z.boolean(),
  followupsAtivos: z.boolean(),
  maxFollowups: z.number().int().min(0).max(5),
  followupHoras: z.array(z.number().min(0.5).max(240)).max(5),
  modelo: z.string().min(3).max(80),
  instrucoesExtras: z.string().max(4000),
  gerenteTelefone: tel,
  lojaTelefones: z.object({
    'nenem-autos': tel.optional(),
    'rosa-automoveis': tel.optional(),
    'v3-automoveis': tel.optional(),
    'manos-veiculos': tel.optional(),
  }),
  scoreQualificado: z.number().int().min(20).max(95),
});

export async function PUT(req: NextRequest) {
  const a = await exigirApi(req, 'admin');
  if ('erro' in a) return a.erro;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ erro: 'Configuração inválida', detalhes: parsed.error.issues.map((i) => i.path.join('.')) }, { status: 400 });
  }
  return NextResponse.json(saveSettings(parsed.data));
}
