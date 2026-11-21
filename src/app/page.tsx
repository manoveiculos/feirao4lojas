import { FeiraoCatalog } from '@/components/FeiraoCatalog';
import { getEstoqueFacets, loadEstoque } from '@/lib/estoque';

export const dynamic = 'force-dynamic';

export default function HomePage() {
  const db = loadEstoque();
  const facets = getEstoqueFacets(db.veiculos);

  return (
    <FeiraoCatalog
      veiculos={db.veiculos}
      lojas={db.lojas}
      metadata={db.metadata}
      facets={{
        marcas: facets.marcas,
        categorias: facets.categorias,
        combustiveis: facets.combustiveis,
        cambios: facets.cambios,
      }}
    />
  );
}
