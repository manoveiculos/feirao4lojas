'use client';

import type { ButtonHTMLAttributes } from 'react';

/** Botão de CTA com brilho sutil inspirado no Magic UI Shimmer Button (CSS puro, sem dependência). */
export function ShimmerButton({
  className = '',
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      className={`relative isolate inline-flex items-center justify-center gap-2 overflow-hidden rounded-xl bg-orange-500 font-extrabold text-white shadow-lg shadow-orange-600/35 transition hover:bg-orange-600 active:scale-[0.98] disabled:opacity-70 cursor-pointer ${className}`}
    >
      <span
        aria-hidden="true"
        className="shimmer-sweep pointer-events-none absolute inset-y-0 left-0 -z-10 w-1/3 bg-gradient-to-r from-transparent via-white/45 to-transparent will-change-transform"
      />
      {children}
    </button>
  );
}
