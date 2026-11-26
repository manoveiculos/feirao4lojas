import { Suspense } from 'react';
import { ListaEspera } from '@/components/painel/ListaEspera';

export default function EsperaLoja() {
  return (
    <Suspense fallback={<p className="p-6 text-sm text-slate-500">Carregando…</p>}>
      <ListaEspera admin={false} />
    </Suspense>
  );
}
