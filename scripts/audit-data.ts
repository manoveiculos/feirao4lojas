import fs from 'node:fs';
import path from 'node:path';
import type { EstoqueDatabase, Veiculo } from '../src/lib/types';

const DATA_PATH = path.join(process.cwd(), 'data', 'estoque.json');

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

// Words that should stay normal Title Case even if in uppercase in source
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
    // Preserve parentheses wrapper
    const leadMatch = word.match(/^([(\["']*)/);
    const trailMatch = word.match(/([)\]"',.;:]*)$/);
    const lead = leadMatch ? leadMatch[1] : '';
    const trail = trailMatch ? trailMatch[1] : '';
    const core = word.slice(lead.length, word.length - trail.length);
    if (!core) return word;

    const upper = core.toUpperCase();
    const lower = core.toLowerCase();

    // Keep version decimals like 1.0, 1.3, 2.0, 5p, 16V, 8V, 4x4, 4x2
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

    // Forced title case for common car words that arrive ALL CAPS
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

    // Known acronyms
    if (UPPERCASE_ACRS.has(upper)) {
      return `${lead}${upper}${trail}`;
    }

    // Prepositions (except first word)
    if (idx > 0 && LOWER_PREPS.has(lower)) {
      return `${lead}${lower}${trail}`;
    }

    // Hyphenated tokens like T-Cross, HR-V, S-10
    if (core.includes('-')) {
      const parts = core.split('-').map((p) => {
        const pu = p.toUpperCase();
        if (UPPERCASE_ACRS.has(pu) || p.length <= 2) return pu;
        return p.charAt(0).toUpperCase() + p.slice(1).toLowerCase();
      });
      return `${lead}${parts.join('-')}${trail}`;
    }

    // Mixed case already (e.g. i30, e-208, dCi) -> if all upper or all lower, normalize
    if (core === upper || core === lower) {
      if (core.length <= 2 && /^[A-Z0-9]+$/.test(upper) && !LOWER_PREPS.has(lower)) {
        return `${lead}${upper}${trail}`;
      }
      return `${lead}${lower.charAt(0).toUpperCase() + lower.slice(1)}${trail}`;
    }

    return word;
  });

  // Remove trailing redundant year and consecutive duplicated phrases (e.g. "Haval H6 Haval H6")
  let joined = result.join(' ').replace(/\s+/g, ' ').trim();
  joined = joined
    .replace(/\b(\w+(?:\s+\w+)?)\s+\1\b/gi, '$1')
    .replace(/\s+(19\d{2}|20\d{2})$/, '')
    .trim();
  return joined;
}

function fixCombustivel(v: Veiculo): { combustivel: string; changed: boolean; reason?: string } {
  const hay = `${v.titulo} ${v.versao} ${v.descricao} ${v.opcionais.join(' ')}`.toLowerCase();
  const prev = v.combustivel;

  // Detect hybrid explicitly mentioned in title/model/version
  if (
    /\b(h[íi]brid[oa]|hybrid|phev|hev|haval\s+h6|corolla\s+cross\s+xrx\s+1\.8\s+h|song\s+plus|king\s+dm-i|rav4\s+hybrid)\b/i.test(
      `${v.titulo} ${v.versao}`
    )
  ) {
    if (prev !== 'Híbrido') {
      return { combustivel: 'Híbrido', changed: true, reason: `Título/modelo indica híbrido (era "${prev}")` };
    }
    return { combustivel: prev, changed: false };
  }

  // Detect electric explicitly mentioned in title/model/version
  if (
    /\b(el[ée]tric[oa]|100%\s*el[ée]trico|dolphin|seal|aion\s+y|ora\s+03|yuan\s+plus|kwid\s+e-tech|e-js1|\bev\b)\b/i.test(
      `${v.titulo} ${v.versao}`
    ) &&
    !/h[íi]brid/i.test(hay)
  ) {
    if (prev !== 'Elétrico') {
      return { combustivel: 'Elétrico', changed: true, reason: `Título/modelo indica elétrico (era "${prev}")` };
    }
    return { combustivel: prev, changed: false };
  }

  // Detect diesel in title
  if (/\b(diesel|tdi|turbodiesel|4x4\s+diesel)\b/i.test(`${v.titulo} ${v.versao}`)) {
    if (prev !== 'Diesel') {
      return { combustivel: 'Diesel', changed: true, reason: `Título indica diesel (era "${prev}")` };
    }
  }

  // Detect flex in title
  if (/\b(total\s*flex|flex)\b/i.test(`${v.titulo} ${v.versao}`) && prev === 'Gasolina') {
    return { combustivel: 'Flex', changed: true, reason: `Título indica Flex (era "${prev}")` };
  }

  return { combustivel: prev, changed: false };
}

function fixCategoria(v: Veiculo): { categoria: string; changed: boolean } {
  let cat = v.categoria;
  const t = `${v.marca} ${v.modelo} ${v.titulo}`.toLowerCase();

  // Always classify Yamaha / Honda motorcycles accurately
  if (
    /\b(yamaha|dafra|fluo|biz|cg\s|cb\s|bros|pcx|nmax|fazer|nh\s?190|lander|xtz|twister|pop\s?110|moto)\b/i.test(
      t
    )
  ) {
    cat = 'Moto';
  } else if (/\b(xc\s?60|xc\s?40|ex30|aion|haval)\b/i.test(t)) {
    cat = 'SUV';
  } else if (/\b(535\s*i|320i|seal)\b/i.test(t)) {
    cat = 'Sedan';
  } else if (cat === 'Hatch / Passeio') {
    if (/\b(strada|saveiro|toro|hilux|s10|s-10|ranger|amarok|montana|oroch|frontier|l200|triton|rampage|pick-up|pickup)\b/i.test(t)) {
      cat = 'Picape';
    } else if (/\b(suv|tracker|creta|kicks|duster|t-cross|nivus|taos|compass|renegade|haval|aion|corolla cross|hr-v|pulse|fastback|tiggo|boreal|captur|ecosport|bronco|sw4|x1|x3|q3|gla|xc40)\b/i.test(t)) {
      cat = 'SUV';
    } else if (/\b(sedan|sedã|corolla|civic|virtus|city|hb20s|onix plus|cronos|voyage|jetta|sentra|versa|logan|cruze|seal|cobalt|prisma|siena|fusion|cerato)\b/i.test(t) && !/hatch|sport6|cross/i.test(t)) {
      cat = 'Sedan';
    } else {
      cat = 'Hatch';
    }
  }

  // Reclassify "Elétrico" category into actual body type (Electric is a fuel filter!)
  if (cat === 'Elétrico') {
    if (/\b(aion|yuan|song|haval|xc40|ex30|suv)\b/i.test(t)) cat = 'SUV';
    else if (/\b(seal|sedan)\b/i.test(t)) cat = 'Sedan';
    else cat = 'Hatch';
  }

  return { categoria: cat, changed: cat !== v.categoria };
}

function normalizeAno(v: Veiculo): { anoTexto: string; changed: boolean } {
  const fab = v.anoFabricacao;
  const mod = v.anoModelo;
  let anoTexto = v.anoTexto;
  if (fab && mod && fab !== mod) {
    anoTexto = `${fab}/${mod}`;
  } else if (mod) {
    anoTexto = String(mod);
  } else if (fab) {
    anoTexto = String(fab);
  }
  return { anoTexto, changed: anoTexto !== v.anoTexto };
}

function main() {
  const apply = process.argv.includes('--apply');
  const db = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8')) as EstoqueDatabase;

  const fuelFixes: string[] = [];
  const catFixes: string[] = [];
  const titleFixes: string[] = [];
  const anoFixes: string[] = [];

  for (const v of db.veiculos) {
    // 1. Fuel
    const ff = fixCombustivel(v);
    if (ff.changed) {
      fuelFixes.push(`[${v.codigo}] ${v.lojaNome} — ${v.titulo}: ${ff.reason} -> ${ff.combustivel}`);
      if (apply) v.combustivel = ff.combustivel;
    }

    // 2. Category
    const cf = fixCategoria(v);
    if (cf.changed) {
      catFixes.push(`[${v.codigo}] ${v.titulo}: "${v.categoria}" -> "${cf.categoria}"`);
      if (apply) v.categoria = cf.categoria;
    }

    // 3. Title & model normalization
    const newTitle = normalizeTitleCase(v.titulo);
    const newModelo = normalizeTitleCase(v.modelo);
    const newVersao = normalizeTitleCase(v.versao);
    if (newTitle !== v.titulo) {
      titleFixes.push(`[${v.codigo}] "${v.titulo}" -> "${newTitle}"`);
      if (apply) {
        v.titulo = newTitle;
        v.modelo = newModelo;
        v.versao = newVersao;
      }
    }

    // 4. Year format
    const af = normalizeAno(v);
    if (af.changed) {
      anoFixes.push(`[${v.codigo}] "${v.anoTexto}" -> "${af.anoTexto}"`);
      if (apply) v.anoTexto = af.anoTexto;
    }

    // 5. pronta_entrega default false if missing
    if (apply && typeof v.pronta_entrega !== 'boolean') {
      v.pronta_entrega = false;
    }
  }

  // Detect possible cross-store duplicates (do NOT delete anything!)
  const duplicates: string[] = [];
  const vs = db.veiculos;
  for (let i = 0; i < vs.length; i++) {
    for (let j = i + 1; j < vs.length; j++) {
      const a = vs[i];
      const b = vs[j];
      if (a.lojaSlug === b.lojaSlug) continue;

      const sameBrand = a.marca.toLowerCase() === b.marca.toLowerCase();
      if (!sameBrand) continue;

      const modA = a.modelo.toLowerCase().replace(/[^a-z0-9]/g, '');
      const modB = b.modelo.toLowerCase().replace(/[^a-z0-9]/g, '');
      const sameModel = modA && modB && (modA.includes(modB) || modB.includes(modA));
      if (!sameModel) continue;

      const sameYear =
        (a.anoModelo && b.anoModelo && a.anoModelo === b.anoModelo) ||
        a.anoTexto === b.anoTexto;
      const samePrice = a.preco && b.preco && Math.abs(a.preco - b.preco) <= 2000;
      const sameKm = a.km !== null && b.km !== null && Math.abs(a.km - b.km) <= 2000;

      if (sameYear && (samePrice || sameKm)) {
        const matchReasons = [
          samePrice ? `preço ${a.precoFormatado} vs ${b.precoFormatado}` : null,
          sameKm ? `km ${a.kmFormatado} vs ${b.kmFormatado}` : null,
        ]
          .filter(Boolean)
          .join(' + ');
        duplicates.push(
          `• [${a.codigo}] ${a.lojaNome}: ${a.titulo} (${a.anoTexto}, ${a.kmFormatado}, ${a.precoFormatado})\n` +
            `  ↔ [${b.codigo}] ${b.lojaNome}: ${b.titulo} (${b.anoTexto}, ${b.kmFormatado}, ${b.precoFormatado})\n` +
            `  Critério: mesmo modelo/ano + ${matchReasons}`
        );
      }
    }
  }

  if (apply) {
    fs.writeFileSync(DATA_PATH, JSON.stringify(db, null, 2), 'utf8');
  }

  console.log('================ RELATÓRIO DE AUDITORIA DE DADOS ================');
  console.log(`Modo: ${apply ? 'APLICADO em data/estoque.json' : 'APENAS LEITURA'}`);
  console.log(`Total de veículos analisados: ${db.veiculos.length}`);
  console.log(`\n1) POSSÍVEIS DUPLICATAS ENTRE LOJAS (${duplicates.length}) — NENHUMA APAGADA:`);
  duplicates.forEach((d) => console.log(d));

  console.log(`\n2) CORREÇÕES DE COMBUSTÍVEL (${fuelFixes.length}):`);
  fuelFixes.forEach((f) => console.log('  -', f));

  console.log(`\n3) UNIFICAÇÃO DE CATEGORIAS (${catFixes.length}):`);
  catFixes.forEach((c) => console.log('  -', c));

  console.log(`\n4) PADRONIZAÇÃO DE TÍTULOS (${titleFixes.length}):`);
  titleFixes.slice(0, 20).forEach((t) => console.log('  -', t));
  if (titleFixes.length > 20) console.log(`  ... (+${titleFixes.length - 20} títulos padronizados)`);

  // Final counts by category & fuel
  const catCount: Record<string, number> = {};
  const fuelCount: Record<string, number> = {};
  for (const v of db.veiculos) {
    catCount[v.categoria] = (catCount[v.categoria] || 0) + 1;
    fuelCount[v.combustivel] = (fuelCount[v.combustivel] || 0) + 1;
  }
  console.log('\n5) DISTRIBUIÇÃO FINAL:');
  console.log('   Categorias:', catCount);
  console.log('   Combustíveis:', fuelCount);
  const maxPrice = Math.max(...db.veiculos.map((v) => v.preco || 0));
  console.log('   Maior preço do estoque:', maxPrice);
}

main();
