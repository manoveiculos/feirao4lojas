import { Dashboard } from '@/components/painel/Dashboard';

export default function AdminHome() {
  return <Dashboard baseConversas="/admin/conversas" escopoLoja={false} />;
}
