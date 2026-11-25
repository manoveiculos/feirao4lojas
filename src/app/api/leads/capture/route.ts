import { after, NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { boasVindasProativas } from '@/lib/agent/proativo';
import { obterOuCriarLead } from '@/lib/agent/inbound';
import { LOJAS } from '@/lib/config';
import { addEvento, normalizarTelefone, saveClique, updateLead } from '@/lib/db/store';
import { origemVazia, type Origem } from '@/lib/db/types';
import type { LojaSigla } from '@/lib/types';

export const runtime = 'nodejs';

const schema = z.object({
  tipo: z.string().max(40),
  ref: z.string().max(80).default(''),
  sid: z.string().regex(/^[a-z0-9]{6,16}$/i).optional().default(''),
  loja_sigla: z.enum(['MV', 'NA', 'RA', 'V3']).nullable().optional(),
  origem: z.string().max(40).default(''),
  veiculo: z
    .object({ codigo: z.string().default(''), modelo: z.string().default('') })
    .partial()
    .optional(),
  nome: z.string().max(120).optional().default(''),
  whatsapp: z.string().max(30).optional().default(''),
  utm_source: z.string().max(120).optional().default(''),
  utm_medium: z.string().max(120).optional().default(''),
  utm_campaign: z.string().max(200).optional().default(''),
  utm_content: z.string().max(200).optional().default(''),
  fbclid: z.string().max(400).optional().default(''),
  /** Texto aberto no WhatsApp (atribuição sem código visível na mensagem) */
  mensagem: z.string().max(600).optional().default(''),
});

// rate limit simples por IP (60 req / min)
const janela = new Map<string, { n: number; ate: number }>();
function permitido(ip: string): boolean {
  const agora = Date.now();
  const j = janela.get(ip);
  if (!j || j.ate < agora) {
    janela.set(ip, { n: 1, ate: agora + 60_000 });
    return true;
  }
  j.n += 1;
  return j.n <= 60;
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
  if (!permitido(ip)) return NextResponse.json({ ok: false }, { status: 429 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, erro: 'payload inválido' }, { status: 400 });
  const d = parsed.data;

  const origem: Origem = {
    ...origemVazia(),
    canal: d.tipo === 'saida' ? 'saida_site' : d.tipo === 'lista_vip' ? 'lista_vip' : 'site',
    ref: d.ref.toUpperCase(),
    sid: d.sid,
    utm_source: d.utm_source,
    utm_medium: d.utm_medium,
    utm_campaign: d.utm_campaign,
    utm_content: d.utm_content,
    fbclid: d.fbclid,
  };
  const loja = d.loja_sigla ? LOJAS.find((l) => l.sigla === (d.loja_sigla as LojaSigla)) : undefined;
  const telefone = normalizarTelefone(d.whatsapp);
  const temTelefone = telefone.length >= 12;

  // Clique no WhatsApp: guarda para casar com a mensagem quando ela chegar
  if (d.sid) {
    saveClique({ sid: d.sid, ref: origem.ref, lojaSigla: d.loja_sigla ?? null, origem, ts: new Date().toISOString(), usado: false, mensagem: d.mensagem });
  }

  addEvento({
    tipo: temTelefone ? 'site_form' : 'site_click_whatsapp',
    leadId: null,
    lojaSlug: loja?.slug ?? null,
    meta: {
      tipo: d.tipo,
      ref: origem.ref,
      origem: d.origem,
      utm_source: d.utm_source,
      utm_campaign: d.utm_campaign,
      utm_content: d.utm_content,
      veiculo: d.veiculo?.codigo ?? '',
    },
  });

  if (temTelefone) {
    const { lead, novo } = obterOuCriarLead(telefone, {
      nome: d.nome.trim(),
      origem,
      // pista para o Agente Roteador; a loja só recebe o lead depois da triagem do SDR
      lojaSugerida: loja?.slug ?? null,
    });
    if (!novo) {
      updateLead(lead.id, { ...(d.nome && !lead.nome ? { nome: d.nome.trim() } : {}) });
    } else {
      const interesse = d.veiculo?.modelo?.replace(/^Interesse:\s*/i, '') ?? '';
      after(async () => {
        await boasVindasProativas(lead.id, interesse);
      });
    }
    return NextResponse.json({ ok: true, lead: lead.id, novo });
  }

  return NextResponse.json({ ok: true });
}
