/**
 * Agendador embutido (servidor Node de longa duração): a cada minuto executa
 * follow-ups/lembretes e, a cada hora, re-sincroniza o estoque das 4 lojas.
 * Em ambientes sem processo persistente, desligue com INTERNAL_CRON=off e
 * chame /api/cron/tick por um cron externo.
 */
export async function iniciarAgendador() {
  const { hidratarDoBanco } = await import('./lib/db/store');
  const h = await hidratarDoBanco();
  console.log(`[db] fonte: ${h.origem} · ${h.leads} leads em memória`);

  // acessos do site (telemetria): carrega os últimos 14 dias para o painel /admin/acessos
  const { hidratarAcessos } = await import('./lib/acessos/store');
  const ac = await hidratarAcessos();
  console.log(`[acessos] fonte: ${ac.origem} · ${ac.eventos} eventos em memória`);

  // outra instância (deploy em andamento ou mais de um processo): mantém as cópias em dia pelo banco
  const { iniciarSincronizacao, souLider } = await import('./lib/db/sync');
  iniciarSincronizacao();

  if (process.env.INTERNAL_CRON === 'off') return;

  const g = globalThis as unknown as { __feiraoCron?: NodeJS.Timeout };
  if (g.__feiraoCron) return;

  const { executarTick } = await import('./lib/agent/followup');
  const { sincronizarEstoque } = await import('./lib/sync-job');
  const { loadEstoque } = await import('./lib/estoque');
  const { verificarEsperaNoTick } = await import('./lib/espera/espera');

  let ocupado = false;
  g.__feiraoCron = setInterval(async () => {
    if (ocupado) return;
    ocupado = true;
    try {
      // só uma instância dispara follow-ups, lembretes, match da lista de espera e sync do estoque
      if (!(await souLider())) return;
      await executarTick();
      const idade = Date.now() - Date.parse(loadEstoque().metadata.atualizadoEm);
      if (idade > 60 * 60_000 && process.env.AUTO_SYNC_ESTOQUE !== 'off') {
        await sincronizarEstoque().catch((e) => console.error('[cron] sync estoque', e));
      }
      // lista de espera: cruza veículos novos (venham do sync, de /api/sync ou de um deploy)
      await verificarEsperaNoTick().catch((e) => console.error('[cron] lista de espera', e));
    } catch (e) {
      console.error('[cron] tick', e);
    } finally {
      ocupado = false;
    }
  }, 60_000);
  console.log('[cron] agendador interno ativo (1 min)');
}
