import { Suspense } from 'react';
import { LeadsTable } from '@/components/painel/LeadsTable';

export default async function LeadsLoja({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return (
    <Suspense fallback={<p className="p-6 text-sm text-slate-500">Carregando…</p>}>
      <LeadsTable admin={false} baseConversas={`/loja/${slug}/conversas`} />
    </Suspense>
  );
}
