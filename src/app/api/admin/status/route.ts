import { NextRequest, NextResponse } from 'next/server';
import { capiConfigurado } from '@/lib/ads/capi';
import { FEIRAO_CONFIG, WHATSAPP_NUMBER } from '@/lib/config';
import { getSettings } from '@/lib/db/store';
import { loadEstoque } from '@/lib/estoque';
import { exigirApi } from '@/lib/painel';
import { providerNome } from '@/lib/whatsapp/provider';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Checklist de integrações: o que falta configurar para o sistema rodar 100%. */
export async function GET(req: NextRequest) {
  const a = await exigirApi(req, 'admin');
  if ('erro' in a) return a.erro;
  const s = getSettings();
  const provider = providerNome();
  const db = loadEstoque();
  const site = FEIRAO_CONFIG.siteUrl;
  const feedKey = process.env.FEED_KEY || '';

  const itens = [
    { id: 'anthropic', nome: 'Agente de IA (Claude)', ok: Boolean(process.env.ANTHROPIC_API_KEY), dica: 'Defina ANTHROPIC_API_KEY' },
    {
      id: 'whatsapp',
      nome: `WhatsApp (${provider})`,
      ok: provider === 'evolution' ? Boolean(process.env.EVOLUTION_API_URL && process.env.EVOLUTION_API_KEY && process.env.EVOLUTION_INSTANCE) : provider === 'meta' ? Boolean(process.env.META_WA_TOKEN && process.env.META_WA_PHONE_ID) : false,
      dica: 'Defina WHATSAPP_PROVIDER=evolution|meta e as credenciais do provedor',
    },
    { id: 'webhook', nome: 'Segredo do webhook', ok: Boolean(process.env.WEBHOOK_SECRET || process.env.META_APP_SECRET), dica: 'Defina WEBHOOK_SECRET (Evolution) ou META_APP_SECRET (Meta)' },
    { id: 'numero', nome: 'Número do WhatsApp do site', ok: Boolean(WHATSAPP_NUMBER), dica: 'Defina NEXT_PUBLIC_WHATSAPP_NUMBER (somente dígitos)' },
    { id: 'auth', nome: 'Segredo de sessão (AUTH_SECRET)', ok: Boolean(process.env.AUTH_SECRET && process.env.AUTH_SECRET.length >= 16), dica: 'Defina AUTH_SECRET com 16+ caracteres' },
    { id: 'cron', nome: 'Agendador de follow-ups', ok: true, dica: 'Roda embutido (instrumentation). Opcional: chame /api/cron/tick por cron externo.' },
    { id: 'lojas', nome: 'Telefones de aviso das lojas', ok: Object.values(s.lojaTelefones).some(Boolean) || Boolean(s.gerenteTelefone), dica: 'Cadastre em Agente → Notificações' },
    { id: 'metaads', nome: 'Meta Ads (insights em tempo real)', ok: Boolean(process.env.META_ADS_TOKEN && process.env.META_AD_ACCOUNT_ID), dica: 'Defina META_ADS_TOKEN e META_AD_ACCOUNT_ID' },
    { id: 'capi', nome: 'Meta Conversions API (lead qualificado)', ok: capiConfigurado(), dica: 'Defina META_PIXEL_ID e META_CAPI_TOKEN' },
    { id: 'feed', nome: 'Feed de estoque para catálogo', ok: Boolean(feedKey), dica: 'Defina FEED_KEY para proteger a URL do feed' },
    { id: 'horario', nome: 'Horário do feirão', ok: Boolean(process.env.NEXT_PUBLIC_HORARIO_FEIRAO), dica: 'Defina NEXT_PUBLIC_HORARIO_FEIRAO' },
  ];

  return NextResponse.json({
    itens,
    estoque: { total: db.metadata.totalVeiculos, atualizadoEm: db.metadata.atualizadoEm, porLoja: db.metadata.porLoja },
    urls: {
      webhookEvolution: `${site}/api/whatsapp/webhook?secret=SEU_WEBHOOK_SECRET`,
      webhookMeta: `${site}/api/whatsapp/webhook`,
      feedMeta: `${site}/api/feed/meta${feedKey ? `?key=${feedKey}` : ''}`,
      estoqueJson: `${site}/api/veiculos`,
    },
  });
}
