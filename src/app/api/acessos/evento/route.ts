import { after, NextRequest, NextResponse } from 'next/server';
import { COOKIE, lerToken } from '@/lib/auth';
import { classificarOrigem } from '@/lib/acessos/origem';
import { EH_ROBO, parseUserAgent, resolverGeo, ipDoRequest, type GeoInfo } from '@/lib/acessos/geo';
import { registrarEvento } from '@/lib/acessos/store';
import { ACOES, type Acao, type EventoAcesso } from '@/lib/acessos/tipos';

export const runtime = 'nodejs';

const g = globalThis as unknown as { __av3GeoVisitante?: Map<string, GeoInfo>; __av3LimiteAcessos?: Map<string, { n: number; ate: number }> };
const geoPorVisitante = (g.__av3GeoVisitante ??= new Map<string, GeoInfo>());
const janelas = (g.__av3LimiteAcessos ??= new Map<string, { n: number; ate: number }>());

/** Limite por minuto: protege contra laços e abuso sem atrapalhar navegação normal. */
function permitido(chave: string, max: number): boolean {
  const agora = Date.now();
  const j = janelas.get(chave);
  if (!j || j.ate < agora) {
    if (janelas.size > 20000) janelas.clear();
    janelas.set(chave, { n: 1, ate: agora + 60_000 });
    return true;
  }
  j.n += 1;
  return j.n <= max;
}

const txt = (v: unknown, max: number): string | null => {
  if (typeof v !== 'string') return null;
  const t = v.trim().slice(0, max);
  return t || null;
};
const num = (v: unknown, min: number, max: number): number => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : 0;
};
const semQuery = (p: string) => p.split('?')[0].split('#')[0];
const ID_OK = /^[A-Za-z0-9_.:-]{6,120}$/;

/**
 * Recebe a telemetria do site (sendBeacon). Responde 204 na hora e processa depois:
 * a consulta de cidade pode levar até 2,5 s e o visitante não precisa esperar.
 */
export async function POST(req: NextRequest) {
  const ua = req.headers.get('user-agent') || '';
  const ip = ipDoRequest(req.headers) || 'sem-ip';

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const visitorId = typeof body?.visitor_id === 'string' ? body.visitor_id : '';

  const ignorar =
    !body ||
    EH_ROBO.test(ua) ||
    !/^[A-Za-z0-9_-]{8,64}$/.test(visitorId) ||
    !permitido(`v:${visitorId}`, 90) ||
    !permitido(`ip:${ip}`, 600);
  if (ignorar) return new NextResponse(null, { status: 204 });

  // quem está logado no painel (equipe) não conta como visitante
  const sessao = await lerToken(req.cookies.get(COOKIE)?.value).catch(() => null);
  if (sessao) return new NextResponse(null, { status: 204 });

  after(async () => {
    try {
      const b = body!;
      const acao: Acao = (ACOES as string[]).includes(String(b.acao)) ? (b.acao as Acao) : 'page_view';
      const pagina = semQuery(txt(b.pagina, 240) || '/');
      if (/^\/(admin|loja|login|api)(\/|$)/.test(pagina)) return;

      const at = (b.atribuicao && typeof b.atribuicao === 'object' ? b.atribuicao : {}) as Record<string, unknown>;
      const sinais = {
        utm_source: txt(at.utm_source, 120),
        utm_medium: txt(at.utm_medium, 120),
        utm_campaign: txt(at.utm_campaign, 160),
        utm_content: txt(at.utm_content, 160),
        utm_term: txt(at.utm_term, 160),
        gclid: txt(at.gclid, 200),
        fbclid: txt(at.fbclid, 200),
        ttclid: txt(at.ttclid, 200),
        referrer: txt(at.referrer, 300),
      };
      const origem = classificarOrigem(sinais);

      let geo = geoPorVisitante.get(visitorId);
      if (!geo || (!geo.cidade && !geo.uf)) {
        geo = await resolverGeo(req.headers);
        if (geoPorVisitante.size > 5000) geoPorVisitante.delete(geoPorVisitante.keys().next().value as string);
        geoPorVisitante.set(visitorId, geo);
      }
      const ap = parseUserAgent(ua);

      const interacoes: Record<string, number> = {};
      if (b.interacoes && typeof b.interacoes === 'object') {
        for (const [k, v] of Object.entries(b.interacoes as Record<string, unknown>).slice(0, 12)) {
          const n = num(v, 0, 9999);
          if (n > 0) interacoes[k.slice(0, 24)] = n;
        }
      }

      const valor = Number(b.valor_veiculo);
      const agora = new Date().toISOString();
      const evento: EventoAcesso = {
        id: typeof b.event_id === 'string' && ID_OK.test(b.event_id) ? b.event_id : `ac_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        criado_em: agora,
        atualizado_em: agora,
        visitor_id: visitorId,
        session_id: txt(b.session_id, 80) || visitorId,
        canal: origem.canal,
        sub_origem: origem.sub_origem,
        ...sinais,
        campanha_id: txt(at.campaign_id, 60),
        conjunto_id: txt(at.adset_id, 60),
        anuncio_id: txt(at.ad_id, 60),
        acao,
        pagina,
        veiculo_id: txt(b.veiculo_id, 80),
        veiculo_nome: txt(b.veiculo_nome, 160),
        valor_veiculo: Number.isFinite(valor) && valor > 0 ? valor : null,
        detalhe: txt(b.detalhe, 240),
        dispositivo: ap.dispositivo,
        dispositivo_detalhe: ap.dispositivo_detalhe,
        navegador: ap.navegador,
        cidade: geo.cidade,
        uf: geo.uf,
        pais: geo.pais,
        tempo_segundos: num(b.tempo_segundos, 0, 4 * 3600),
        fotos_vistas: num(b.fotos_vistas, 0, 500),
        abriu_galeria: Boolean(b.abriu_galeria),
        scroll_max: num(b.scroll_max, 0, 100),
        interacoes,
      };
      registrarEvento(evento);
    } catch (e) {
      console.error('[acessos] erro ao registrar evento:', e instanceof Error ? e.message : e);
    }
  });

  return new NextResponse(null, { status: 204 });
}
