// Telemetria de acessos no navegador.
//
// Portado do módulo de jornada do site de compra da Manos. Dois trabalhos:
//  1. Transporte (`enviar`): sendBeacon, que sobrevive à troca de página e ao fechamento da aba.
//  2. Tempo ATIVO por página e por carro: aba visível E alguma interação (toque, scroll, clique, tecla,
//     mouse) nos últimos 90 s. Uma aba aberta e esquecida não infla o número.
//
// Uma "visão" (página ou carro) é UM evento com id estável que vai sendo atualizado: envio imediato ao
// abrir (para existir mesmo se a pessoa sair em 3 s), pings a cada 20 s e envio final ao sair. O servidor
// guarda o MAIOR tempo recebido, então beacons repetidos ou fora de ordem não corrompem nada.
//
// Privacidade: respeita "Do Not Track" e o opt-out do aparelho (?notrack=1). Não envia nome nem telefone.

const COOKIE = 'av3_vid';
const VALIDADE_S = 63072000; // 2 anos
const SESSION_KEY = 'av3_session_v1';
const ATTR_KEY = 'av3_attr_v1';
const OPTOUT_KEY = 'av3_notrack';
const HEARTBEAT_MS = 20_000;
const TICK_MS = 2_000;
const OCIOSO_APOS_MS = 90_000;
const LIMITE_VISAO_MS = 30 * 60_000;
const ENDPOINT = '/api/acessos/evento';

type Json = Record<string, unknown>;

// ───────────────────────── Identidade ─────────────────────────

function lerCookie(nome: string): string | null {
  try {
    const m = document.cookie.match(new RegExp(`(?:^|;\\s*)${nome}=([^;]*)`));
    return m ? decodeURIComponent(m[1]) : null;
  } catch {
    return null;
  }
}

function novoId(): string {
  // 16 caracteres [a-z0-9]: é o mesmo formato aceito como `sid` na captura de leads
  try {
    const b = new Uint8Array(16);
    crypto.getRandomValues(b);
    return Array.from(b, (x) => (x % 36).toString(36)).join('');
  } catch {
    return (Math.random().toString(36).slice(2) + Date.now().toString(36) + 'xxxxxxxxxxxxxxxx').slice(0, 16);
  }
}

/** Id anônimo do visitante (cookie de 2 anos). É também o `sid` que liga o clique do site ao lead. */
export function idDoVisitante(): string {
  if (typeof document === 'undefined') return '';
  const existente = lerCookie(COOKIE);
  if (existente && /^[a-z0-9]{6,16}$/i.test(existente)) return existente;
  const id = novoId();
  try {
    const seguro = location.protocol === 'https:' ? ';Secure' : '';
    document.cookie = `${COOKIE}=${encodeURIComponent(id)};Max-Age=${VALIDADE_S};Path=/;SameSite=Lax${seguro}`;
  } catch {
    /* sem cookie o id vira efêmero, o que ainda é melhor que nenhum */
  }
  return id;
}

export function idDaSessao(): string {
  try {
    const e = sessionStorage.getItem(SESSION_KEY);
    if (e) return e;
    const n = `s${Date.now().toString(36)}${novoId().slice(0, 6)}`;
    sessionStorage.setItem(SESSION_KEY, n);
    return n;
  } catch {
    return `s${Date.now().toString(36)}`;
  }
}

// ───────────────────────── Consentimento / opt-out ─────────────────────────

let desativado: boolean | null = null;

/** Equipe: abra o site com ?notrack=1 neste aparelho para não contar as suas visitas (?notrack=0 volta ao normal). */
export function telemetriaDesativada(): boolean {
  if (typeof window === 'undefined') return true;
  if (desativado !== null) return desativado;
  try {
    const q = new URLSearchParams(location.search).get('notrack');
    if (q === '1') localStorage.setItem(OPTOUT_KEY, '1');
    if (q === '0') localStorage.removeItem(OPTOUT_KEY);
    const dnt = navigator.doNotTrack === '1' || (window as unknown as { doNotTrack?: string }).doNotTrack === '1';
    desativado = dnt || localStorage.getItem(OPTOUT_KEY) === '1';
  } catch {
    desativado = false;
  }
  return desativado;
}

const rotaIgnorada = (p: string) => /^\/(admin|loja|login|api)(\/|$)/.test(p);

// ───────────────────────── Atribuição (de onde a pessoa veio) ─────────────────────────

const PARAMS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'gclid', 'fbclid', 'ttclid'] as const;

/** Atribuição desta visita: parâmetros da URL de entrada + site de origem. Fixada no primeiro carregamento da sessão. */
function atribuicao(): Json {
  try {
    const salvo = sessionStorage.getItem(ATTR_KEY);
    if (salvo) return JSON.parse(salvo) as Json;
  } catch {
    /* segue */
  }
  const sp = new URLSearchParams(location.search);
  const a: Json = {};
  for (const k of PARAMS) {
    const v = sp.get(k);
    if (v) a[k] = v.slice(0, 200);
  }
  for (const [de, para] of [['campaign_id', 'campaign_id'], ['adset_id', 'adset_id'], ['ad_id', 'ad_id']] as const) {
    const v = sp.get(de);
    if (v) a[para] = v.slice(0, 60);
  }
  try {
    const ref = document.referrer;
    if (ref && new URL(ref).hostname !== location.hostname) a.referrer = ref.slice(0, 300);
  } catch {
    /* ignora */
  }
  try {
    sessionStorage.setItem(ATTR_KEY, JSON.stringify(a));
  } catch {
    /* modo privado */
  }
  return a;
}

// ───────────────────────── Transporte ─────────────────────────

export function enviar(corpo: Json): void {
  try {
    if (typeof window === 'undefined' || telemetriaDesativada()) return;
    const pagina = String(corpo.pagina || location.pathname);
    if (rotaIgnorada(pagina)) return;
    const json = JSON.stringify({ visitor_id: idDoVisitante(), session_id: idDaSessao(), atribuicao: atribuicao(), ...corpo, pagina });
    if (navigator.sendBeacon?.(ENDPOINT, new Blob([json], { type: 'application/json' }))) return;
    void fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: json, keepalive: true }).catch(() => {});
  } catch {
    /* telemetria nunca pode quebrar a página */
  }
}

export type AcaoCliente = 'filter_stock' | 'simulacao' | 'troca' | 'whatsapp_click' | 'popup_saida' | 'lead_formulario';

/** Evento pontual (clique, envio de formulário…). */
export function registrarAcao(
  acao: AcaoCliente,
  dados: { detalhe?: string | null; veiculo_id?: string | null; veiculo_nome?: string | null; valor_veiculo?: number | null } = {}
): void {
  enviar({
    event_id: `ac_${idDaSessao()}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    acao,
    detalhe: dados.detalhe ?? null,
    veiculo_id: dados.veiculo_id ?? null,
    veiculo_nome: dados.veiculo_nome ?? null,
    valor_veiculo: dados.valor_veiculo ?? null,
  });
}

// ───────────────────────── Visões com tempo ativo ─────────────────────────

export type InteracaoVeiculo = 'foto' | 'galeria' | 'whatsapp' | 'compartilhar';

interface Visao {
  tipo: 'pagina' | 'veiculo';
  eventId: string;
  base: Json;
  acumuladoMs: number;
  inicio: number;
  ultimoTick: number;
  ultimoEnvioSeg: number;
  ultimoPing: number;
  fotos: Set<string>;
  abriuGaleria: boolean;
  scrollMax: number;
  interacoes: Record<string, number>;
}

const visoes: { pagina: Visao | null; veiculo: Visao | null } = { pagina: null, veiculo: null };
let ultimaInteracao = Date.now();
let ouvintes = false;
let timer = 0;
let contador = 0;

const ativoAgora = () => document.visibilityState === 'visible' && Date.now() - ultimaInteracao < OCIOSO_APOS_MS;
const segundos = (v: Visao) => Math.round(v.acumuladoMs / 1000);

function acumular(v: Visao): void {
  const agora = Date.now();
  if (ativoAgora()) v.acumuladoMs += Math.min(agora - v.ultimoTick, TICK_MS * 3);
  v.ultimoTick = agora;
}

function enviarVisao(v: Visao): void {
  v.ultimoEnvioSeg = segundos(v);
  v.ultimoPing = Date.now();
  enviar({
    ...v.base,
    event_id: v.eventId,
    tempo_segundos: v.ultimoEnvioSeg,
    fotos_vistas: v.fotos.size,
    abriu_galeria: v.abriuGaleria,
    scroll_max: v.scrollMax,
    interacoes: v.interacoes,
  });
}

function todas(): Visao[] {
  return [visoes.pagina, visoes.veiculo].filter((v): v is Visao => Boolean(v));
}

function aoRolar(): void {
  ultimaInteracao = Date.now();
  const v = visoes.pagina;
  if (!v) return;
  const alt = document.documentElement.scrollHeight - window.innerHeight;
  if (alt <= 0) return;
  const pct = Math.min(100, Math.round((window.scrollY / alt) * 100));
  if (pct > v.scrollMax) v.scrollMax = pct;
}

function descarregarTudo(): void {
  for (const v of todas()) {
    acumular(v);
    enviarVisao(v);
  }
}

function aoMudarVisibilidade(): void {
  if (document.visibilityState === 'hidden') descarregarTudo();
  else for (const v of todas()) v.ultimoTick = Date.now();
}

function instalar(): void {
  if (typeof window === 'undefined') return;
  if (!ouvintes) {
    ouvintes = true; // os ouvintes são instalados uma única vez
    const marcar = () => {
      ultimaInteracao = Date.now();
    };
    for (const ev of ['pointerdown', 'keydown', 'touchstart', 'mousemove', 'click'] as const) window.addEventListener(ev, marcar, { passive: true });
    window.addEventListener('scroll', aoRolar, { passive: true });
    document.addEventListener('visibilitychange', aoMudarVisibilidade);
    window.addEventListener('pagehide', descarregarTudo);
  }
  if (timer) return;
  timer = window.setInterval(() => {
    const agora = Date.now();
    for (const v of todas()) {
      acumular(v);
      if (agora - v.inicio > LIMITE_VISAO_MS) {
        encerrar(v.tipo);
        continue;
      }
      if (agora - v.ultimoPing >= HEARTBEAT_MS && segundos(v) !== v.ultimoEnvioSeg) enviarVisao(v);
    }
  }, TICK_MS);
}

function iniciar(tipo: 'pagina' | 'veiculo', chave: string, base: Json): void {
  if (typeof window === 'undefined' || telemetriaDesativada()) return;
  const atual = visoes[tipo];
  if (atual && atual.base.chave === chave) return;
  encerrar(tipo);
  instalar();
  ultimaInteracao = Date.now();
  contador += 1;
  const agora = Date.now();
  const v: Visao = {
    tipo,
    eventId: `${tipo === 'pagina' ? 'pg' : 'vw'}_${idDaSessao()}_${chave.replace(/[^A-Za-z0-9]/g, '').slice(0, 24)}_${contador}`,
    base: { ...base, chave },
    acumuladoMs: 0,
    inicio: agora,
    ultimoTick: agora,
    ultimoEnvioSeg: -1,
    ultimoPing: agora,
    fotos: new Set(),
    abriuGaleria: false,
    scrollMax: 0,
    interacoes: {},
  };
  visoes[tipo] = v;
  enviarVisao(v);
}

function encerrar(tipo: 'pagina' | 'veiculo'): void {
  const v = visoes[tipo];
  if (!v) return;
  visoes[tipo] = null;
  acumular(v);
  enviarVisao(v);
  if (!visoes.pagina && !visoes.veiculo && timer) {
    window.clearInterval(timer); // sem visão ativa não há o que contar; o próximo início religa o contador
    timer = 0;
  }
}

/** Começa a contar o tempo (e o scroll) em uma página. */
export function iniciarVisaoPagina(pathname: string): void {
  if (rotaIgnorada(pathname)) {
    encerrar('pagina');
    return;
  }
  iniciar('pagina', pathname || '/', {
    acao: 'page_view',
    pagina: pathname || '/',
    detalhe: pathname === '/' ? 'Entrou na página do feirão' : `Acessou ${pathname}`,
  });
}

/** Começa a contar o tempo em um carro (ficha aberta). Se o mesmo carro já está sendo acompanhado, não faz nada. */
export function iniciarVisaoVeiculo(v: { codigo: string; titulo: string; preco: number | null }): void {
  iniciar('veiculo', v.codigo, {
    acao: 'view_vehicle',
    pagina: typeof location !== 'undefined' ? location.pathname : '/',
    veiculo_id: v.codigo,
    veiculo_nome: v.titulo,
    valor_veiculo: v.preco || null,
    detalhe: `Abriu a ficha: ${v.titulo}`,
  });
}

export function finalizarVisaoVeiculo(): void {
  encerrar('veiculo');
}

/** Micro-interação no carro atual (foto, galeria…). Sem ficha aberta, ignora. */
export function registrarInteracaoVeiculo(tipo: InteracaoVeiculo, detalhe?: string | number): void {
  const v = visoes.veiculo;
  if (!v) return;
  ultimaInteracao = Date.now();
  v.interacoes[tipo] = (v.interacoes[tipo] || 0) + 1;
  if (tipo === 'foto' && detalhe !== undefined) v.fotos.add(String(detalhe));
  if (tipo === 'galeria') v.abriuGaleria = true;
  // interação importante vai na hora: protege contra um pagehide que o navegador descarte
  if (tipo === 'galeria' || tipo === 'whatsapp') {
    acumular(v);
    enviarVisao(v);
  }
}
