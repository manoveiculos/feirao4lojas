import { FeiraoCatalog } from '@/components/FeiraoCatalog';
import { resolveEffectiveDate } from '@/lib/campaign';
import { getEstoqueFacets, loadEstoque } from '@/lib/estoque';

export const dynamic = 'force-dynamic';

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ modo?: string; data?: string }>;
}) {
  const params = await searchParams;
  const sp = new URLSearchParams();
  if (params?.modo) sp.set('modo', params.modo);
  if (params?.data) sp.set('data', params.data);

  const initialDate = resolveEffectiveDate(sp, 0);
  const db = loadEstoque();
  const facets = getEstoqueFacets(db.veiculos);

  return (
    <FeiraoCatalog
      veiculos={db.veiculos}
      lojas={db.lojas}
      metadata={db.metadata}
      facets={facets}
      initialNowIso={initialDate.nowBrt.toISOString()}
      initialIsSimulated={initialDate.isSimulated}
      initialSimulationLabel={initialDate.simulationLabel}
    />
  );
}
