import { NextRequest, NextResponse } from 'next/server';
import { getMensagens } from '@/lib/db/store';
import { escopoDe, exigirApi } from '@/lib/painel';
import { leadsVisiveis } from '@/lib/stats';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const a = await exigirApi(req);
  if ('erro' in a) return a.erro;

  const sp = req.nextUrl.searchParams;
  const status = sp.get('status');
  const filtro = sp.get('filtro'); // qualificados | humano | naolidas | quentes
  const loja = sp.get('loja');
  const q = (sp.get('q') || '').toLowerCase().trim();

  let leads = leadsVisiveis(escopoDe(a.sessao));
  if (a.sessao.papel === 'admin' && loja) leads = leads.filter((l) => (loja === 'sem-loja' ? !l.lojaSlug : l.lojaSlug === loja));
  if (status) leads = leads.filter((l) => l.status === status);
  if (filtro === 'qualificados') leads = leads.filter((l) => l.qualificadoEm);
  if (filtro === 'humano') leads = leads.filter((l) => l.humano);
  if (filtro === 'naolidas') leads = leads.filter((l) => l.naoLidas > 0);
  if (filtro === 'quentes') leads = leads.filter((l) => l.temperatura === 'quente');
  if (q) leads = leads.filter((l) => l.nome.toLowerCase().includes(q) || l.telefone.includes(q.replace(/\D/g, '') || '§'));

  leads.sort((x, y) => Date.parse(y.ultimaMensagemEm ?? y.criadoEm) - Date.parse(x.ultimaMensagemEm ?? x.criadoEm));

  return NextResponse.json(
    {
      atualizadoEm: new Date().toISOString(),
      total: leads.length,
      leads: leads.slice(0, 200).map((l) => {
        const msgs = getMensagens(l.id);
        const ultima = msgs[msgs.length - 1];
        return {
          id: l.id,
          nome: l.nome,
          telefone: l.telefone,
          status: l.status,
          score: l.score,
          temperatura: l.temperatura,
          lojaSlug: l.lojaSlug,
          humano: l.humano,
          naoLidas: l.naoLidas,
          qualificado: Boolean(l.qualificadoEm),
          resumo: l.resumo,
          canal: l.origem.canal,
          campanha: l.origem.utm_campaign,
          ultimaMensagem: ultima ? { autor: ultima.autor, texto: ultima.texto.slice(0, 120), ts: ultima.ts } : null,
          criadoEm: l.criadoEm,
        };
      }),
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
