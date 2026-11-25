import {
  getLead,
  getMensagens,
  incorporarEspera,
  incorporarEventos,
  incorporarLead,
  incorporarMensagens,
  incorporarSettings,
  normalizarTelefone,
} from './store';
import {
  INSTANCIA,
  bancoConfigurado,
  batimentoELider,
  lerEsperaAlterada,
  lerEventosDesde,
  lerLeadPorId,
  lerLeadsAlterados,
  lerLeadsPorTelefone,
  lerMensagensDesde,
  lerSettingsDoBanco,
} from './remote';

/**
 * Sincronização entre instâncias do servidor.
 *
 * O store vive em memória (premissa: UMA instância). Num deploy a instância nova sobe enquanto a
 * antiga ainda atende por alguns minutos — e um host pode rodar mais de um processo. Sem isto, cada
 * uma fica com a sua cópia: o painel pausa o agente numa e o cliente é respondido pela outra; uma
 * roteia o lead e a outra grava a cópia velha por cima (incidente de 25/11/2026).
 *
 * 1) A cada 15 s puxa do banco o que mudou (leads, mensagens, eventos, lista de espera, configurações).
 * 2) Antes de agir sobre um lead (mensagem do cliente, resposta do agente, roteamento, painel),
 *    confere a versão do banco: sincronizarLead / sincronizarPorTelefone.
 * 3) Só a instância líder (a mais nova viva) roda as tarefas automáticas: souLider().
 */

const INTERVALO_MS = 15_000;
/** Folga na leitura incremental: relógios e a fila de escrita (com retry) atrasam a gravação. */
const FOLGA_MS = 3 * 60_000;

interface EstadoSync {
  ultimaLeitura: number;
  timer: NodeJS.Timeout | null;
  lider: boolean;
  liderVerificadoEm: number;
  rodando: boolean;
}
const g = globalThis as unknown as { __feiraoSync?: EstadoSync };
const st = (): EstadoSync =>
  (g.__feiraoSync ??= { ultimaLeitura: Date.now(), timer: null, lider: true, liderVerificadoEm: 0, rodando: false });

const desde = (ms: number) => new Date(ms - FOLGA_MS).toISOString();

/** Puxa do banco tudo o que mudou desde a última leitura. */
export async function puxarDoBanco(): Promise<{ leads: number; mensagens: number; eventos: number; espera: number; settings: boolean }> {
  const vazio = { leads: 0, mensagens: 0, eventos: 0, espera: 0, settings: false };
  if (!bancoConfigurado()) return vazio;
  const s = st();
  if (s.rodando) return vazio;
  s.rodando = true;
  const inicio = Date.now();
  try {
    const marco = desde(s.ultimaLeitura);
    const [leads, msgs, evs, settings] = await Promise.all([
      lerLeadsAlterados(marco),
      lerMensagensDesde(marco),
      lerEventosDesde(marco),
      lerSettingsDoBanco(),
    ]);
    // lead antes da mensagem (mensagem de lead desconhecido é ignorada)
    let nLeads = 0;
    for (const l of leads) if (l.instancia !== INSTANCIA.id && incorporarLead(l)) nLeads++;
    const nMsgs = incorporarMensagens(msgs);
    const nEvs = incorporarEventos(evs);
    const nSettings = incorporarSettings(settings);
    const nEspera = await lerEsperaAlterada(marco).then(incorporarEspera).catch(() => 0);
    s.ultimaLeitura = inicio;
    return { leads: nLeads, mensagens: nMsgs, eventos: nEvs, espera: nEspera, settings: nSettings };
  } finally {
    s.rodando = false;
  }
}

/** Traz a versão mais recente de um lead (e as mensagens recentes dele) antes de agir. Nunca lança. */
export async function sincronizarLead(leadId: string): Promise<void> {
  if (!bancoConfigurado()) return;
  try {
    const remoto = await lerLeadPorId(leadId);
    if (remoto && remoto.instancia !== INSTANCIA.id) incorporarLead(remoto);
    const msgs = getMensagens(leadId);
    const ultima = msgs.length ? Date.parse(msgs[msgs.length - 1].ts) : Date.now() - 86400_000;
    incorporarMensagens(await lerMensagensDesde(new Date(ultima - FOLGA_MS).toISOString(), leadId, 4000));
  } catch (e) {
    console.warn(`[sync] não consegui conferir o lead ${leadId} no banco:`, e instanceof Error ? e.message : e);
  }
}

/** Antes de criar um lead novo: talvez outra instância já tenha criado este telefone. Nunca lança. */
export async function sincronizarPorTelefone(telefone: string): Promise<void> {
  if (!bancoConfigurado()) return;
  const t = normalizarTelefone(telefone);
  const variantes = [t];
  if (t.startsWith('55')) {
    const ddd = t.slice(2, 4);
    const resto = t.slice(4);
    if (resto.length === 9 && resto.startsWith('9')) variantes.push(`55${ddd}${resto.slice(1)}`);
    if (resto.length === 8) variantes.push(`55${ddd}9${resto}`);
  }
  try {
    for (const l of await lerLeadsPorTelefone(variantes)) {
      if (l.instancia !== INSTANCIA.id) incorporarLead(l);
      if (getLead(l.id)) await sincronizarLead(l.id);
    }
  } catch (e) {
    console.warn('[sync] não consegui conferir o telefone no banco:', e instanceof Error ? e.message : e);
  }
}

/**
 * Esta instância deve rodar as tarefas automáticas? (follow-up, lista de espera, sync do estoque)
 * Sem banco, ou se a verificação falhar, assume que sim (comportamento de instância única).
 */
export async function souLider(): Promise<boolean> {
  if (!bancoConfigurado()) return true;
  const s = st();
  if (Date.now() - s.liderVerificadoEm < INTERVALO_MS) return s.lider;
  try {
    const lider = await batimentoELider();
    if (lider !== s.lider) console.log(`[sync] instância ${INSTANCIA.id} ${lider ? 'assumiu' : 'deixou'} as tarefas automáticas`);
    s.lider = lider;
  } catch {
    s.lider = true;
  }
  s.liderVerificadoEm = Date.now();
  return s.lider;
}

/** Liga a leitura periódica. Chamado uma vez no boot, depois da hidratação. */
export function iniciarSincronizacao(): void {
  const s = st();
  if (s.timer || !bancoConfigurado()) return;
  s.ultimaLeitura = Date.now();
  s.timer = setInterval(async () => {
    try {
      const r = await puxarDoBanco();
      if (r.leads || r.mensagens || r.settings) {
        console.log(`[sync] de outra instância: ${r.leads} lead(s), ${r.mensagens} mensagem(ns)${r.settings ? ', configurações' : ''}`);
      }
      await souLider();
    } catch (e) {
      console.warn('[sync] leitura periódica falhou:', e instanceof Error ? e.message : e);
    }
  }, INTERVALO_MS);
  s.timer.unref?.();
  console.log(`[sync] instância ${INSTANCIA.id} sincronizando com o banco a cada ${INTERVALO_MS / 1000}s`);
}
