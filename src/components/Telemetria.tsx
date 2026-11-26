'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { iniciarVisaoPagina } from '@/lib/acessos/cliente';

/**
 * Liga a telemetria de acessos: conta a visita, o tempo ativo e o scroll de cada página.
 * Não renderiza nada. Ignora /admin, /loja e /login, e respeita "Do Not Track" e ?notrack=1.
 */
export function Telemetria() {
  const pathname = usePathname();
  useEffect(() => {
    iniciarVisaoPagina(pathname || '/');
  }, [pathname]);
  return null;
}
