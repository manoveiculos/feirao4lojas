'use client';

import type { ReactNode } from 'react';
import { Drawer } from 'vaul';
import { X } from 'lucide-react';

/**
 * Bottom sheet no celular (arrasta para fechar) e modal compacto centralizado no desktop.
 * Mesmo padrão "Responsive Dialog" do shadcn/ui, usando o vaul que o projeto já tem.
 */
export function ResponsiveSheet({
  open,
  onOpenChange,
  title,
  description,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-[60] bg-slate-950/70 backdrop-blur-xs" />
        <Drawer.Content
          className="fixed inset-x-0 bottom-0 z-[60] mx-auto flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl focus:outline-none sm:bottom-auto sm:top-1/2 sm:-translate-y-1/2 sm:rounded-2xl"
          aria-describedby={undefined}
        >
          <div className="shrink-0 px-5 pb-2 pt-2.5 sm:pt-5">
            <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-slate-300 sm:hidden" />
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <Drawer.Title className="text-lg font-black leading-tight tracking-tight text-slate-950">
                  {title}
                </Drawer.Title>
                {description && (
                  <p className="mt-1 text-sm leading-snug text-slate-600">{description}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                aria-label="Fechar"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-700 transition active:scale-95 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>
          <div className="safe-bottom overflow-y-auto overscroll-contain px-5 pt-2">{children}</div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
