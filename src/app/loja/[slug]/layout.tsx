import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { Shell } from '@/components/painel/Shell';
import { exigirSessao } from '@/lib/auth';
import { LOJAS_BY_SLUG } from '@/lib/config';
import type { LojaSlug } from '@/lib/types';

export const metadata: Metadata = { title: 'Painel da loja | Acelera V3', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function LojaLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const loja = LOJAS_BY_SLUG[slug as LojaSlug];
  if (!loja) notFound();
  const s = await exigirSessao();
  // admin acompanha as lojas pelo painel geral (filtro por loja)
  if (s.papel === 'admin') redirect(`/admin/conversas?loja=${slug}`);
  await exigirSessao('loja', slug as LojaSlug);

  return (
    <Shell
      titulo={loja.nome}
      subtitulo="Acelera V3 · Painel da loja"
      nav={[
        { href: `/loja/${slug}`, label: 'Visão geral' },
        { href: `/loja/${slug}/conversas`, label: 'Conversas' },
      ]}
    >
      {children}
    </Shell>
  );
}
