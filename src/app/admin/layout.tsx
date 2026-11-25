import type { Metadata } from 'next';
import { Shell } from '@/components/painel/Shell';
import { exigirSessao } from '@/lib/auth';

export const metadata: Metadata = { title: 'Admin | Acelera V3', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await exigirSessao('admin');
  return (
    <Shell
      titulo="Central de leads"
      subtitulo="Acelera V3 · Admin"
      nav={[
        { href: '/admin', label: 'Visão geral' },
        { href: '/admin/leads', label: 'Leads' },
        { href: '/admin/conversas', label: 'Conversas' },
        { href: '/admin/campanhas', label: 'Campanhas' },
        { href: '/admin/agente', label: 'Agente & Config' },
      ]}
    >
      {children}
    </Shell>
  );
}
