import { Suspense } from 'react';
import { Inbox } from '@/components/painel/Inbox';

export default async function ConversasLoja({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return (
    <Suspense fallback={<p className="p-6 text-sm text-slate-500">Carregando…</p>}>
      <Inbox admin={false} lojaFixa={slug} />
    </Suspense>
  );
}
