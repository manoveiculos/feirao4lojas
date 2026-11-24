'use client';

import * as Tooltip from '@radix-ui/react-tooltip';

export function TooltipProviderRoot({ children }: { children: React.ReactNode }) {
  return (
    <Tooltip.Provider delayDuration={200} skipDelayDuration={100}>
      {children}
    </Tooltip.Provider>
  );
}

export function TooltipHint({
  content,
  children,
  side = 'top',
}: {
  content: string;
  children: React.ReactNode;
  side?: 'top' | 'bottom' | 'left' | 'right';
}) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          side={side}
          sideOffset={6}
          className="z-[70] max-w-xs rounded-lg bg-slate-900 px-3 py-2 text-xs font-medium leading-snug text-white shadow-xl ring-1 ring-white/15"
        >
          {content}
          <Tooltip.Arrow className="fill-slate-900" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
