// Tipos e regras compartilhados entre a coleta (navegador), o servidor e o painel /admin/acessos.
// Portado do módulo "Tráfego" do site de compra da Manos e adaptado ao Acelera V3.

export type Canal = 'meta_ads' | 'google_ads' | 'tiktok_ads' | 'organico' | 'direto';
export const CANAIS: Canal[] = ['meta_ads', 'google_ads', 'tiktok_ads', 'organico', 'direto'];
export const CANAL_LABEL: Record<Canal, string> = {
  meta_ads: 'Facebook / Instagram Ads',
  google_ads: 'Google Ads',
  tiktok_ads: 'TikTok Ads',
  organico: 'Orgânico / Redes',
  direto: 'Direto',
};

export type Acao =
  | 'page_view'
  | 'view_vehicle'
  | 'filter_stock'
  | 'simulacao'
  | 'troca'
  | 'whatsapp_click'
  | 'popup_saida'
  | 'lead_formulario';

export const ACOES: Acao[] = [
  'page_view',
  'view_vehicle',
  'filter_stock',
  'simulacao',
  'troca',
  'whatsapp_click',
  'popup_saida',
  'lead_formulario',
];

export const ACAO_LABEL: Record<Acao, string> = {
  page_view: 'Viu a página',
  view_vehicle: 'Abriu um carro',
  filter_stock: 'Filtrou o estoque',
  simulacao: 'Usou o simulador',
  troca: 'Avaliou o usado na troca',
  whatsapp_click: 'Clicou no WhatsApp',
  popup_saida: 'Viu o pedido de contato ao sair',
  lead_formulario: 'Deixou nome e telefone',
};

export interface EventoAcesso {
  id: string;
  criado_em: string;
  atualizado_em: string;
  visitor_id: string;
  session_id: string;
  canal: Canal;
  sub_origem: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
  gclid: string | null;
  fbclid: string | null;
  ttclid: string | null;
  referrer: string | null;
  campanha_id: string | null;
  conjunto_id: string | null;
  anuncio_id: string | null;
  acao: Acao;
  pagina: string | null;
  veiculo_id: string | null;
  veiculo_nome: string | null;
  valor_veiculo: number | null;
  detalhe: string | null;
  dispositivo: 'Mobile' | 'Desktop' | null;
  dispositivo_detalhe: string | null;
  navegador: string | null;
  cidade: string | null;
  uf: string | null;
  pais: string | null;
  /** Tempo ATIVO (aba visível + interação nos últimos 90 s). */
  tempo_segundos: number;
  fotos_vistas: number;
  abriu_galeria: boolean;
  scroll_max: number;
  interacoes: Record<string, number>;
}

export type Periodo = 'hoje' | '24h' | '7d' | '30d';
export const PERIODOS: Array<[Periodo, string]> = [
  ['hoje', 'Hoje'],
  ['24h', '24 horas'],
  ['7d', '7 dias'],
  ['30d', '30 dias'],
];

// ───────────────────────── Formatação ─────────────────────────

/** 102 → "1m 42s" · 45 → "45s" · 3900 → "1h 05m". */
export function formatarDuracao(segundos: number | null | undefined): string {
  const s = Math.max(0, Math.round(Number(segundos) || 0));
  if (s < 60) return `${s}s`;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  return `${m}m ${String(s % 60).padStart(2, '0')}s`;
}

// ───────────────────────── Temperatura do visitante ─────────────────────────

export type NivelTemperatura = 'frio' | 'morno' | 'quente' | 'muito_quente';

export interface Temperatura {
  nivel: NivelTemperatura;
  score: number;
  motivos: string[];
}

export const TEMPERATURA_LABEL: Record<NivelTemperatura, string> = {
  frio: 'Frio',
  morno: 'Morno',
  quente: 'Quente',
  muito_quente: 'Muito quente',
};

const ehVeiculo = (p: EventoAcesso) => p.acao === 'view_vehicle';

/**
 * Pontua a visita de uma pessoa. Pesos pensados para que:
 *  - mais de 60 s no MESMO carro já empurre para "Quente" junto de qualquer outro sinal;
 *  - clicar no WhatsApp ou deixar contato seja sempre "Muito quente";
 *  - só navegar e filtrar nunca passe de "Morno".
 */
export function calcularTemperatura(passos: EventoAcesso[]): Temperatura {
  const motivos: string[] = [];
  let score = 0;

  const porVeiculo = new Map<string, { views: number; tempo: number }>();
  for (const p of passos) {
    if (!ehVeiculo(p)) continue;
    const chave = p.veiculo_id || p.veiculo_nome;
    if (!chave) continue;
    const atual = porVeiculo.get(chave) || { views: 0, tempo: 0 };
    atual.views += 1;
    atual.tempo += p.tempo_segundos || 0;
    porVeiculo.set(chave, atual);
  }

  const maiorTempo = Math.max(0, ...[...porVeiculo.values()].map((v) => v.tempo));
  if (maiorTempo >= 180) {
    score += 45;
    motivos.push(`${formatarDuracao(maiorTempo)} no mesmo carro`);
  } else if (maiorTempo >= 120) {
    score += 38;
    motivos.push(`${formatarDuracao(maiorTempo)} no mesmo carro`);
  } else if (maiorTempo > 60) {
    score += 30;
    motivos.push('Mais de 60s no mesmo carro');
  } else if (maiorTempo >= 20) {
    score += 12;
  }

  if ([...porVeiculo.values()].some((v) => v.views >= 2)) {
    score += 20;
    motivos.push('Voltou ao mesmo carro');
  }
  if (porVeiculo.size >= 3) {
    score += 8;
    motivos.push(`Comparou ${porVeiculo.size} carros`);
  }

  const maxFotos = Math.max(0, ...passos.map((p) => p.fotos_vistas || 0));
  if (passos.some((p) => p.abriu_galeria)) {
    score += 8;
    motivos.push('Abriu a galeria de fotos');
  }
  if (maxFotos >= 5) {
    score += 8;
    motivos.push(`${maxFotos} fotos vistas`);
  }
  if (passos.some((p) => (p.scroll_max || 0) >= 75)) score += 4;
  if (passos.some((p) => p.acao === 'page_view' && p.tempo_segundos >= 120)) {
    score += 10;
    motivos.push('Mais de 2 min na página');
  }

  if (passos.some((p) => p.acao === 'simulacao')) {
    score += 22;
    motivos.push('Usou o simulador');
  }
  if (passos.some((p) => p.acao === 'troca')) {
    score += 14;
    motivos.push('Avaliou carro na troca');
  }
  if (passos.some((p) => p.acao === 'lead_formulario')) {
    score += 40;
    motivos.push('Deixou nome e telefone');
  }

  const converteu = passos.some((p) => p.acao === 'whatsapp_click' || p.acao === 'lead_formulario');
  if (passos.some((p) => p.acao === 'whatsapp_click')) {
    score += 45;
    motivos.push('Clicou no WhatsApp');
  }

  score = Math.min(100, score);
  let nivel: NivelTemperatura = 'frio';
  if (converteu || score >= 75) nivel = 'muito_quente';
  else if (score >= 45) nivel = 'quente';
  else if (score >= 20) nivel = 'morno';
  return { nivel, score, motivos };
}

// ───────────────────────── Agregações por visitante ─────────────────────────

export interface CarroVisto {
  chave: string;
  veiculo_id: string | null;
  nome: string;
  valor: number | null;
  visitas: number;
  tempo_segundos: number;
  fotos_vistas: number;
  abriu_galeria: boolean;
}

export function agruparCarrosVistos(passos: EventoAcesso[]): CarroVisto[] {
  const mapa = new Map<string, CarroVisto>();
  for (const p of passos) {
    if (!ehVeiculo(p)) continue;
    const nome = (p.veiculo_nome || '').trim();
    const chave = p.veiculo_id || nome;
    if (!chave) continue;
    const item = mapa.get(chave) || {
      chave,
      veiculo_id: p.veiculo_id,
      nome: nome || `Carro ${p.veiculo_id}`,
      valor: p.valor_veiculo,
      visitas: 0,
      tempo_segundos: 0,
      fotos_vistas: 0,
      abriu_galeria: false,
    };
    item.visitas += 1;
    item.tempo_segundos += p.tempo_segundos || 0;
    item.fotos_vistas = Math.max(item.fotos_vistas, p.fotos_vistas || 0);
    item.abriu_galeria = item.abriu_galeria || p.abriu_galeria;
    if (!item.valor && p.valor_veiculo) item.valor = p.valor_veiculo;
    mapa.set(chave, item);
  }
  return [...mapa.values()].sort((a, b) => b.tempo_segundos - a.tempo_segundos);
}

/** Tempo total no site: o maior entre a janela da visita e a soma do tempo ativo. */
export function tempoTotalSessaoSeg(passos: EventoAcesso[]): number {
  if (!passos.length) return 0;
  const ts = passos.flatMap((p) => [Date.parse(p.criado_em), Date.parse(p.atualizado_em)]).filter((t) => Number.isFinite(t) && t > 0);
  const janela = ts.length ? (Math.max(...ts) - Math.min(...ts)) / 1000 : 0;
  // página e carro são contados ao mesmo tempo (o carro abre por cima da página): não somar os dois
  const soma = (acao: Acao) => passos.filter((p) => p.acao === acao).reduce((acc, p) => acc + (p.tempo_segundos || 0), 0);
  const ativo = Math.max(soma('page_view'), soma('view_vehicle'));
  return Math.min(6 * 3600, Math.round(Math.max(Math.min(janela, ativo * 3 + 60), ativo)));
}
