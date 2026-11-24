import { Suspense } from 'react';
import { Inbox } from '@/components/painel/Inbox';

export default function ConversasAdmin() {
  return (
    <Suspense fallback={<p className="p-6 text-sm text-slate-500">Carregando…</p>}>
      <Inbox admin />
    </Suspense>
  );
}
