import { Suspense } from 'react';
import { ListaEspera } from '@/components/painel/ListaEspera';

export default function EsperaAdmin() {
  return (
    <Suspense fallback={<p className="p-6 text-sm text-slate-500">Carregando…</p>}>
      <ListaEspera />
    </Suspense>
  );
}
