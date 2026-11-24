import type { EstoqueDatabase, LojaSlug, Veiculo } from './types';
import { LOJAS } from './config';

const UPPERCASE_ACRS = new Set([
  'BYD', 'GWM', 'GAC', 'SUV', 'CVT', 'TSI', 'TDI', 'TFSI', 'MPI', 'MSI', 'GDI',
  'AWD', '4WD', 'FWD', 'RWD', 'ABS', 'LED', 'EV', 'PHEV', 'HEV', 'GT', 'GTI',
  'GTS', 'GL', 'GLS', 'GLX', 'GS', 'EX', 'EXL', 'LX', 'LXL', 'DX', 'SE', 'SEL',
  'SL', 'SR', 'SRV', 'SRX', 'XLI', 'XRE', 'XRX', 'LT', 'LTZ', 'LS', 'RS', 'SS',
  'CD', 'CS', 'CE', 'AT', 'MT', 'V6', 'V8', '16V', '8V', '12V', '24V', 'BMW',
  'RAM', 'HR-V', 'CR-V', 'WR-V', 'ZR-V', 'HB20', 'HB20S', 'HB20X', 'S10', 'S-10',
  'SW4', 'L200', 'T270', 'T200', 'T350', '200TSI', '250TSI', 'MPFI', 'VTI',
  'THP', 'H6', 'NH', 'CG', 'CB', 'X1', 'X3', 'X5', 'Q3', 'Q5', 'GLA', 'GLC',
  'XC', 'XC40', 'XC60', 'EX30', 'E60', 'QQ', 'Z4', 'DSG', 'DCT', 'PCD', 'STD',
  'II', 'III', 'IV', 'B180', 'C180', 'C200', 'A3', 'A4', 'Q7', 'TX', 'TXS',
  'HL', 'EX2',
]);

const FORCE_TITLE_CASE = new Set([
  'AUTOMATICO', 'AUTOMÁTICO', 'AUTOMATICA', 'AUTOMÁTICA', 'MANUAL', 'FLEX',
  'TURBO', 'ELETRICO', 'ELÉTRICO', 'ELETRICA', 'ELÉTRICA', 'HIBRIDO', 'HÍBRIDO',
  'HIBRIDA', 'HÍBRIDA', 'PREMIUM', 'HIGHLINE', 'COMFORTLINE', 'TRENDLINE',
  'ICONIC', 'COMFORT', 'CONFORT', 'FREEDOM', 'VOLCANO', 'WORKING', 'HARD',
  'ROBUST', 'EXTREME', 'TRACK', 'INTENSE', 'LIMITED', 'LONGITUDE', 'RANCH',
  'TITANIUM', 'PRIME', 'SPORT', 'TOURING', 'ADVANCE', 'EXCLUSIVE', 'PRESTIGE',
  'DIAMOND', 'RODEIO', 'ACTIVE', 'DRIVE', 'LIKE', 'TREKKING', 'SENSE', 'SEAL',
  'DOLPHIN', 'AION', 'MOTORS', 'HAVAL', 'STRADA', 'NIVUS', 'VIRTUS', 'POLO',
  'COROLLA', 'CROSS', 'RENEGADE', 'COMPASS', 'TRACKER', 'ONIX', 'PULSE',
  'FASTBACK', 'KICKS', 'DUSTER', 'CAPTUR', 'BOREAL', 'CRETA', 'CITY', 'HATCH',
  'SEDAN', 'PICK-UP', 'PICKUP', 'POWER', 'TOTAL', 'FIRE', 'DIESEL', 'GASOLINA',
  'PLUS', 'PRO', 'MAX', 'SMILE', 'COURO', 'TETO', 'ROADSTER', 'EVOLUTION',
  'MINI', 'SOUL', 'KIA', 'VOLVO', 'CHERY', 'YAMAHA', 'FLUO',
]);

const LOWER_PREPS = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'em', 'com', 'para', 'p/']);

export function normalizeTitleCase(raw: string): string {
  if (!raw) return '';
  const cleaned = raw
    .replace(/\s+/g, ' ')
    .replace(/\(\s*el[ée]trico\s*\)/gi, '(Elétrico)')
    .replace(/\(\s*h[íi]brido\s*\)/gi, '(Híbrido)')
    .replace(/\bHibrido\b/gi, 'Híbrido')
    .replace(/\bEletrico\b/gi, 'Elétrico')
    .replace(/\bAutomatico\b/gi, 'Automático')
    .replace(/\bAutomatica\b/gi, 'Automática')
    .replace(/\bMec\.\/Aut\./gi, 'Aut.')
    .replace(/\bAut\.\s*$/i, 'Automático')
    .replace(/\bGAC MOTORS\b/gi, 'GAC')
    .trim();

  const words = cleaned.split(' ');
  const result = words.map((word, idx) => {
    if (!word) return word;
    const leadMatch = word.match(/^([(\["']*)/);
    const trailMatch = word.match(/([)\]"',.;:]*)$/);
    const lead = leadMatch ? leadMatch[1] : '';
    const trail = trailMatch ? trailMatch[1] : '';
    const core = word.slice(lead.length, word.length - trail.length);
    if (!core) return word;

    const upper = core.toUpperCase();
    const lower = core.toLowerCase();

    if (/^\d+\.\d+$/.test(core)) return word;
    if (/^\d+p$/i.test(core)) return `${lead}${lower}${trail}`;
    if (/^\d+v$/i.test(core)) return `${lead}${upper}${trail}`;
    if (/^4x[24]$/i.test(core)) return `${lead}${lower}${trail}`;
    if (upper === 'T-CROSS') return `${lead}T-Cross${trail}`;
    if (upper === 'XEI') return `${lead}XEi${trail}`;
    if (upper === 'C.S' || upper === 'C.S.') return `${lead}CS${trail}`;
    if (upper === 'C.D' || upper === 'C.D.') return `${lead}CD${trail}`;
    if (upper === 'AUT' || upper === 'AUT.') return `${lead}Aut.${trail.replace(/^\.+/, '')}`;
    if (upper === 'SDRIVE') return `${lead}sDrive${trail}`;
    if (upper === '320I') return `${lead}320i${trail}`;
    if (upper === 'R-DESIGN') return `${lead}R-Design${trail}`;
    if (upper === 'R-LINE') return `${lead}R-Line${trail}`;
    if (upper === 'E-TRACTION') return `${lead}e-Traction${trail}`;

    if (FORCE_TITLE_CASE.has(upper)) {
      const fixed =
        upper === 'ELETRICO'
          ? 'Elétrico'
          : upper === 'HIBRIDO'
            ? 'Híbrido'
            : upper === 'AUTOMATICO'
              ? 'Automático'
              : upper === 'AUTOMATICA'
                ? 'Automática'
                : upper === 'PICK-UP'
                  ? 'Pick-up'
                  : lower.charAt(0).toUpperCase() + lower.slice(1);
      return `${lead}${fixed}${trail}`;
    }

    if (UPPERCASE_ACRS.has(upper)) {
      return `${lead}${upper}${trail}`;
    }

    if (idx > 0 && LOWER_PREPS.has(lower)) {
      return `${lead}${lower}${trail}`;
    }

    if (core.includes('-')) {
      const parts = core.split('-').map((p) => {
        const pu = p.toUpperCase();
        if (UPPERCASE_ACRS.has(pu) || p.length <= 2) return pu;
        return p.charAt(0).toUpperCase() + p.slice(1).toLowerCase();
      });
      return `${lead}${parts.join('-')}${trail}`;
    }

    if (core === upper || core === lower) {
      if (core.length <= 2 && /^[A-Z0-9]+$/.test(upper) && !LOWER_PREPS.has(lower)) {
        return `${lead}${upper}${trail}`;
      }
      return `${lead}${lower.charAt(0).toUpperCase() + lower.slice(1)}${trail}`;
    }

    return word;
  });

  let joined = result.join(' ').replace(/\s+/g, ' ').trim();
  joined = joined
    .replace(/\b(\w+(?:\s+\w+)?)\s+\1\b/gi, '$1')
    .replace(/\s+(19\d{2}|20\d{2})$/, '')
    .trim();
  return joined;
}

export function normalizeVeiculoData(v: Veiculo): Veiculo {
  const titleAndVersion = `${v.titulo} ${v.versao}`;
  let combustivel = v.combustivel;

  if (
    /\b(h[íi]brid[oa]|hybrid|phev|hev|haval\s+h6|corolla\s+cross\s+xrx\s+1\.8\s+h|song\s+plus|king\s+dm-i|rav4\s+hybrid)\b/i.test(
      titleAndVersion
    )
  ) {
    combustivel = 'Híbrido';
  } else if (
    /\b(el[ée]tric[oa]|100%\s*el[ée]trico|dolphin|seal|aion\s+y|ora\s+03|yuan\s+plus|kwid\s+e-tech|e-js1|\bev\b)\b/i.test(
      titleAndVersion
    ) &&
    !/h[íi]brid/i.test(`${titleAndVersion} ${v.descricao}`)
  ) {
    combustivel = 'Elétrico';
  } else if (/\b(diesel|tdi|turbodiesel|4x4\s+diesel)\b/i.test(titleAndVersion)) {
    combustivel = 'Diesel';
  } else if (/\b(total\s*flex|flex)\b/i.test(titleAndVersion) && combustivel === 'Gasolina') {
    combustivel = 'Flex';
  }

  let categoria = v.categoria;
  const t = `${v.marca} ${v.modelo} ${v.titulo}`.toLowerCase();
  if (
    /\b(yamaha|dafra|fluo|biz|cg\s|cb\s|bros|pcx|nmax|fazer|nh\s?190|lander|xtz|twister|pop\s?110|moto)\b/i.test(
      t
    )
  ) {
    categoria = 'Moto';
  } else if (/\b(xc\s?60|xc\s?40|ex30|aion|haval)\b/i.test(t)) {
    categoria = 'SUV';
  } else if (/\b(535\s*i|320i|seal)\b/i.test(t)) {
    categoria = 'Sedan';
  } else if (categoria === 'Hatch / Passeio' || categoria === 'Elétrico') {
    if (/\b(strada|saveiro|toro|hilux|s10|s-10|ranger|amarok|montana|oroch|frontier|l200|triton|rampage|pick-up|pickup)\b/i.test(t)) {
      categoria = 'Picape';
    } else if (/\b(suv|tracker|creta|kicks|duster|t-cross|nivus|taos|compass|renegade|haval|aion|corolla cross|hr-v|pulse|fastback|tiggo|boreal|captur|ecosport|bronco|sw4|x1|x3|q3|gla|xc40)\b/i.test(t)) {
      categoria = 'SUV';
    } else if (/\b(sedan|sedã|corolla|civic|virtus|city|hb20s|onix plus|cronos|voyage|jetta|sentra|versa|logan|cruze|seal|cobalt|prisma|siena|fusion|cerato)\b/i.test(t) && !/hatch|sport6|cross/i.test(t)) {
      categoria = 'Sedan';
    } else {
      categoria = 'Hatch';
    }
  }

  const anoTexto =
    v.anoFabricacao && v.anoModelo && v.anoFabricacao !== v.anoModelo
      ? `${v.anoFabricacao}/${v.anoModelo}`
      : v.anoModelo
        ? String(v.anoModelo)
        : v.anoFabricacao
          ? String(v.anoFabricacao)
          : v.anoTexto;

  return {
    ...v,
    titulo: normalizeTitleCase(v.titulo),
    modelo: normalizeTitleCase(v.modelo),
    versao: normalizeTitleCase(v.versao),
    anoTexto,
    combustivel,
    categoria,
    pronta_entrega: Boolean(v.pronta_entrega),
  };
}

export interface SyncDiffSummary {
  adicionados: Veiculo[];
  removidos: Veiculo[];
  precoAlterado: { veiculo: Veiculo; precoAnterior: number | null; precoNovo: number | null }[];
  lojasEmFallback: LojaSlug[];
  houveMudanca: boolean;
}

/**
 * Mescla o resultado novo do scraper com a base anterior:
 * 1. Se alguma loja retornar 0 carros por falha temporária de rede, preserva o estoque anterior daquela loja.
 * 2. Preserva flags manuais (ex: pronta_entrega: true) dos carros que continuam no estoque.
 * 3. Padroniza títulos, combustíveis, categorias e anos automaticamente.
 * 4. Calcula o diff exato (novos, vendidos/removidos, alteração de preço).
 */
export function mergeAndNormalizeSync(
  previousDb: EstoqueDatabase | null,
  freshDb: EstoqueDatabase
): { db: EstoqueDatabase; diff: SyncDiffSummary } {
  const prevVehicles = previousDb?.veiculos || [];
  const prevByUrl = new Map(prevVehicles.map((v) => [v.urlOriginal, v]));
  const prevById = new Map(prevVehicles.map((v) => [v.id, v]));

  const storeSlugs: LojaSlug[] = [
    'nenem-autos',
    'rosa-automoveis',
    'v3-automoveis',
    'manos-veiculos',
  ];

  const lojasEmFallback: LojaSlug[] = [];
  const perStoreVehicles: Record<LojaSlug, Veiculo[]> = {
    'nenem-autos': [],
    'rosa-automoveis': [],
    'v3-automoveis': [],
    'manos-veiculos': [],
  };

  for (const slug of storeSlugs) {
    const freshForStore = freshDb.veiculos.filter((v) => v.lojaSlug === slug);
    const prevForStore = prevVehicles.filter((v) => v.lojaSlug === slug);

    // Fail-safe: if scrape returned 0 vehicles while previously there were vehicles, keep previous to avoid outage wipe
    if (freshForStore.length === 0 && prevForStore.length > 0) {
      lojasEmFallback.push(slug);
      perStoreVehicles[slug] = prevForStore.map((v) => normalizeVeiculoData(v));
      continue;
    }

    perStoreVehicles[slug] = freshForStore.map((v) => {
      const existing = prevByUrl.get(v.urlOriginal) || prevById.get(v.id);
      const merged: Veiculo = {
        ...v,
        pronta_entrega: existing ? Boolean(existing.pronta_entrega) : Boolean(v.pronta_entrega),
      };
      return normalizeVeiculoData(merged);
    });
  }

  // Interleave vehicles from all 4 stores
  const queues = [
    perStoreVehicles['nenem-autos'],
    perStoreVehicles['v3-automoveis'],
    perStoreVehicles['manos-veiculos'],
    perStoreVehicles['rosa-automoveis'],
  ];
  const mergedVehicles: Veiculo[] = [];
  const maxLen = Math.max(...queues.map((q) => q.length), 0);
  for (let i = 0; i < maxLen; i++) {
    for (const q of queues) {
      if (q[i]) mergedVehicles.push(q[i]);
    }
  }

  // Calculate diff against previous inventory
  const mergedByUrl = new Map(mergedVehicles.map((v) => [v.urlOriginal, v]));
  const adicionados = mergedVehicles.filter(
    (v) => !prevByUrl.has(v.urlOriginal) && !prevById.has(v.id)
  );
  const removidos = prevVehicles.filter(
    (v) => !mergedByUrl.has(v.urlOriginal) && !mergedVehicles.some((m) => m.id === v.id)
  );
  const precoAlterado: SyncDiffSummary['precoAlterado'] = [];
  for (const v of mergedVehicles) {
    const prev = prevByUrl.get(v.urlOriginal) || prevById.get(v.id);
    if (prev && prev.preco !== v.preco) {
      precoAlterado.push({
        veiculo: v,
        precoAnterior: prev.preco,
        precoNovo: v.preco,
      });
    }
  }

  // Compare core fields (ignoring atualizadoEm) to know if real content changed
  const stripTime = (list: Veiculo[]) =>
    list
      .map(({ atualizadoEm: _ignored, ...rest }) => rest)
      .sort((a, b) => a.urlOriginal.localeCompare(b.urlOriginal));

  const houveMudanca =
    JSON.stringify(stripTime(prevVehicles)) !==
    JSON.stringify(stripTime(mergedVehicles));

  const erros = [
    ...freshDb.metadata.erros,
    ...lojasEmFallback.map(
      (slug) =>
        `[${slug}] Site temporariamente sem resposta — mantido estoque anterior por segurança.`
    ),
  ];

  const finalDb: EstoqueDatabase = {
    metadata: {
      atualizadoEm: houveMudanca
        ? new Date().toISOString()
        : previousDb?.metadata.atualizadoEm || new Date().toISOString(),
      totalVeiculos: mergedVehicles.length,
      porLoja: {
        'nenem-autos': perStoreVehicles['nenem-autos'].length,
        'rosa-automoveis': perStoreVehicles['rosa-automoveis'].length,
        'v3-automoveis': perStoreVehicles['v3-automoveis'].length,
        'manos-veiculos': perStoreVehicles['manos-veiculos'].length,
      },
      erros,
    },
    lojas: LOJAS,
    veiculos: mergedVehicles,
  };

  return {
    db: finalDb,
    diff: {
      adicionados,
      removidos,
      precoAlterado,
      lojasEmFallback,
      houveMudanca,
    },
  };
}
