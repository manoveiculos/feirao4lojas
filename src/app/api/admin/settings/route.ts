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
/** WhatsApp da loja: número ou JID de grupo (ex.: 120363000000000000@g.us). */
const telOuGrupo = z
  .string()
  .max(60)
  .transform((v) => (/@g\.us$/i.test(v.trim()) ? v.trim().toLowerCase() : v.trim() ? normalizarTelefone(v) : ''))
  .refine((v) => v === '' || /^[0-9]{10,15}$/.test(v) || /^[0-9-]{10,40}@g\.us$/.test(v), 'número ou grupo inválido');

const schema = z.object({
  boasVindasProativas: z.boolean(),
  followupsAtivos: z.boolean(),
  maxFollowups: z.number().int().min(0).max(5),
  followupHoras: z.array(z.number().min(0.5).max(240)).max(5),
  modelo: z.string().min(3).max(80),
  nomeAgente: z.string().trim().min(2).max(30).default('Val'),
  instrucoesExtras: z.string().max(4000),
  gerenteTelefone: tel,
  lojaTelefones: z.object({
    'nenem-autos': telOuGrupo.optional(),
    'rosa-automoveis': telOuGrupo.optional(),
    'v3-automoveis': telOuGrupo.optional(),
    'manos-veiculos': telOuGrupo.optional(),
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
