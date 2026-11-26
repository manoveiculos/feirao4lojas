import type { Metadata } from 'next';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { AgentSwitch } from '@/components/painel/AgentSwitch';
import { Shell } from '@/components/painel/Shell';
import { COOKIE, lerToken } from '@/lib/auth';

export const metadata: Metadata = { title: 'Admin | Acelera V3', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const url = (await headers()).get('x-av3-url') || '/admin';
  const s = await lerToken((await cookies()).get(COOKIE)?.value);
  if (!s) redirect(`/login?next=${encodeURIComponent(url)}`);

  // Usuário de loja (store_user) nunca vê o admin geral. O link do aviso de lead
  // (/admin/conversas?lead=ID) leva à mesma conversa no painel da loja.
  if (s.papel !== 'admin') {
    const conversa = url.match(/^\/admin\/conversas(\?.*)?$/);
    redirect(s.loja ? `/loja/${s.loja}${conversa ? `/conversas${conversa[1] ?? ''}` : ''}` : '/login');
  }

  return (
    <Shell
      titulo="Central de leads"
      subtitulo="Acelera V3 · Admin"
      nav={[
        { href: '/admin', label: 'Visão geral' },
        { href: '/admin/leads', label: 'Leads' },
        { href: '/admin/conversas', label: 'Conversas' },
        { href: '/admin/espera', label: 'Lista de Espera' },
        { href: '/admin/campanhas', label: 'Campanhas' },
        { href: '/admin/acessos', label: 'Acessos' },
        { href: '/admin/agente', label: 'Agente & Config' },
      ]}
      acoes={<AgentSwitch />}
    >
      {children}
    </Shell>
  );
}
