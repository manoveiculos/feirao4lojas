import { Suspense } from 'react';
import { LeadsTable } from '@/components/painel/LeadsTable';

export default function LeadsAdmin() {
  return (
    <Suspense fallback={<p className="p-6 text-sm text-slate-500">Carregando…</p>}>
      <LeadsTable admin baseConversas="/admin/conversas" />
    </Suspense>
  );
}
