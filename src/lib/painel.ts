import { NextRequest, NextResponse } from 'next/server';
import { sessaoDaRequest, type Sessao } from './auth';
import { getLead } from './db/store';
import type { Lead } from './db/types';
import type { LojaSlug } from './types';

export async function exigirApi(
  req: NextRequest,
  papel?: 'admin'
): Promise<{ sessao: Sessao } | { erro: NextResponse }> {
  const sessao = await sessaoDaRequest(req).catch(() => null);
  if (!sessao) return { erro: NextResponse.json({ erro: 'não autenticado' }, { status: 401 }) };
  if (papel && sessao.papel !== papel) {
    return { erro: NextResponse.json({ erro: 'sem permissão' }, { status: 403 }) };
  }
  return { sessao };
}

export function escopoDe(sessao: Sessao): LojaSlug | null {
  return sessao.papel === 'loja' ? sessao.loja : null;
}

/** Lead acessível ao usuário? Loja só enxerga os próprios. */
export function leadAcessivel(sessao: Sessao, id: string): Lead | null {
  const lead = getLead(id);
  if (!lead) return null;
  if (sessao.papel === 'admin') return lead;
  return lead.lojaSlug === sessao.loja ? lead : null;
}
