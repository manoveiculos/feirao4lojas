'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function Shell({
  titulo,
  subtitulo,
  nav,
  acoes,
  children,
}: {
  titulo: string;
  subtitulo: string;
  nav: Array<{ href: string; label: string }>;
  acoes?: React.ReactNode;
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  async function sair() {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/login';
  }

  return (
    <div className="min-h-dvh bg-slate-100">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-[#062835] text-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-1 px-4 py-2.5">
          <div>
            <div className="text-[10px] font-extrabold uppercase tracking-widest text-orange-400">{subtitulo}</div>
            <div className="text-base font-extrabold leading-tight">{titulo}</div>
          </div>
          <nav className="flex flex-1 flex-wrap gap-1" aria-label="Seções do painel">
            {nav.map((n) => {
              const ativo = n.href === pathname || (n.href.split('/').length > 2 && pathname.startsWith(n.href));
              return (
                <Link key={n.href} href={n.href}
                  className={`rounded-lg px-3 py-1.5 text-sm font-bold ${ativo ? 'bg-white/15 text-white' : 'text-slate-300 hover:bg-white/10'}`}>
                  {n.label}
                </Link>
              );
            })}
          </nav>
          {acoes}
          <button onClick={sair} className="rounded-lg px-3 py-1.5 text-sm font-bold text-slate-300 hover:bg-white/10 cursor-pointer">Sair</button>
        </div>
      </header>
      <main className="mx-auto max-w-7xl p-3 sm:p-4">{children}</main>
    </div>
  );
}
