'use client';

import { useState } from 'react';

export default function LoginPage() {
  const [usuario, setUsuario] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setErro('');
    const r = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuario, senha }),
    });
    const j = await r.json().catch(() => ({}));
    if (r.ok) window.location.href = j.destino;
    else {
      setErro(j.erro || 'Não foi possível entrar.');
      setEnviando(false);
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-[#062835] p-4">
      <form onSubmit={entrar} className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
        <div className="text-[11px] font-extrabold uppercase tracking-widest text-orange-600">Acelera V3</div>
        <h1 className="mt-1 text-2xl font-extrabold text-slate-900">Painel de leads</h1>
        <p className="mt-1 text-sm text-slate-500">
          Use <b>admin</b> ou o nome da loja (ex: <i>v3-automoveis</i>).
        </p>
        <label className="mt-5 block text-xs font-bold uppercase text-slate-600" htmlFor="u">Usuário</label>
        <input id="u" value={usuario} onChange={(e) => setUsuario(e.target.value)} autoComplete="username" autoCapitalize="none"
          className="mt-1 h-11 w-full rounded-xl border border-slate-300 px-3 text-base focus:border-orange-500 focus:outline-none" />
        <label className="mt-3 block text-xs font-bold uppercase text-slate-600" htmlFor="s">Senha</label>
        <input id="s" type="password" value={senha} onChange={(e) => setSenha(e.target.value)} autoComplete="current-password"
          className="mt-1 h-11 w-full rounded-xl border border-slate-300 px-3 text-base focus:border-orange-500 focus:outline-none" />
        {erro && <p className="mt-3 text-sm font-semibold text-rose-600" role="alert">{erro}</p>}
        <button disabled={enviando || !usuario || !senha}
          className="mt-5 h-11 w-full rounded-xl bg-orange-500 font-extrabold text-white transition hover:bg-orange-600 disabled:opacity-50 cursor-pointer">
          {enviando ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </main>
  );
}
