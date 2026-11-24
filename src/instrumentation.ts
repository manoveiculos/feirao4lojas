/**
 * O código do agendador usa APIs do Node (fs, crypto) e fica em arquivo separado,
 * carregado só no runtime nodejs. Assim o bundle Edge não tenta resolver `node:`.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { iniciarAgendador } = await import('./instrumentation-node');
    await iniciarAgendador();
  }
}
