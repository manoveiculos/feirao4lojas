import { Dashboard } from '@/components/painel/Dashboard';

export default async function LojaHome({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <Dashboard baseConversas={`/loja/${slug}/conversas`} escopoLoja />;
}
