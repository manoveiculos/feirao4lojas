'use client';

import { useMemo } from 'react';
import { ChevronRight } from 'lucide-react';
import { isMoto } from '@/lib/filters';
import type { Veiculo } from '@/lib/types';

const brl = (n: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(n);

const ROTULO: Record<string, string> = {
  SUV: 'SUVs',
  Hatch: 'Hatches',
  Sedan: 'Sedans',
  Picape: 'Picapes',
};

/**
 * Vitrine do hero: categorias com quantidade e preço inicial calculados do estoque real.
 * Cada cartão leva ao estoque já filtrado; nada aqui é texto fixo.
 */
export function HeroVitrine({
  veiculos,
  onSelect,
}: {
  veiculos: Veiculo[];
  onSelect: (categoria: string) => void;
}) {
  const itens = useMemo(() => {
    const porCategoria = new Map<string, { n: number; min: number }>();
    for (const v of veiculos) {
      if (isMoto(v) || !v.preco || !ROTULO[v.categoria]) continue;
      const atual = porCategoria.get(v.categoria);
      porCategoria.set(v.categoria, {
        n: (atual?.n ?? 0) + 1,
        min: Math.min(atual?.min ?? Infinity, v.preco),
      });
    }
    return [...porCategoria.entries()]
      .sort((a, b) => b[1].n - a[1].n)
      .slice(0, 4)
      .map(([categoria, d]) => ({ categoria, ...d }));
  }, [veiculos]);

  if (itens.length < 2) return null;

  return (
    <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:grid sm:grid-cols-4 sm:gap-3 sm:overflow-visible sm:px-0">
      {itens.map((i) => (
        <button
          key={i.categoria}
          type="button"
          onClick={() => onSelect(i.categoria)}
          className="group flex min-w-[10.5rem] shrink-0 items-center justify-between gap-2 rounded-xl border border-white/15 bg-white/[0.08] px-3.5 py-2.5 text-left backdrop-blur-md transition hover:border-orange-400/60 hover:bg-white/[0.14] active:scale-[0.98] cursor-pointer sm:min-w-0"
        >
          <span className="min-w-0">
            <span className="block text-sm font-extrabold text-white">
              {ROTULO[i.categoria]}
            </span>
            <span className="block truncate text-[11px] font-semibold text-orange-300">
              a partir de {brl(i.min)}
            </span>
          </span>
          <ChevronRight className="h-4 w-4 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-orange-300" />
        </button>
      ))}
    </div>
  );
}
