import * as cheerio from 'cheerio';
import { LOJAS, LOJAS_BY_SLUG } from './config';
import type { EstoqueDatabase, LojaSlug, Veiculo } from './types';

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

async function fetchText(url: string, retries = 2): Promise<string> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000);
      const res = await fetch(url, {
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
        },
        signal: controller.signal,
        cache: 'no-store',
      });
      clearTimeout(timeout);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} em ${url}`);
      }
      return await res.text();
    } catch (err) {
      lastErr = err;
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 700 * (attempt + 1)));
      }
    }
  }
  throw lastErr;
}

async function runPool<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIdx = 0;

  async function next() {
    while (nextIdx < items.length) {
      const current = nextIdx++;
      results[current] = await worker(items[current], current);
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => next()
  );
  await Promise.all(workers);
  return results;
}

function cleanText(s: string | undefined | null): string {
  if (!s) return '';
  return s.replace(/\s+/g, ' ').trim();
}

function parsePrice(raw: unknown): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) {
    return Math.round(raw);
  }
  if (typeof raw !== 'string') return null;
  const cleaned = raw.replace(/[^\d.,]/g, '');
  if (!cleaned) return null;
  let normalized: string;
  if (cleaned.includes(',')) {
    // Formato BR: 119.900,00 -> 119900.00
    normalized = cleaned.replace(/\./g, '').replace(',', '.');
  } else if (/^\d+\.\d{1,2}$/.test(cleaned)) {
    // Formato ISO/EN: 119900.00 -> 119900.00
    normalized = cleaned;
  } else {
    // Formato milhar BR sem centavos: 119.900 -> 119900
    normalized = cleaned.replace(/\./g, '');
  }
  const val = parseFloat(normalized);
  return Number.isFinite(val) && val > 500 ? Math.round(val) : null;
}

export function formatPrice(price: number | null): string {
  if (!price || price <= 0) return 'Consulte';
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  }).format(price);
}

function parseKm(raw: unknown): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw) && raw >= 0) {
    return Math.round(raw);
  }
  if (typeof raw !== 'string') return null;
  const digits = raw.replace(/\D/g, '');
  if (!digits) return null;
  const val = parseInt(digits, 10);
  return Number.isFinite(val) ? val : null;
}

export function formatKm(km: number | null): string {
  if (km === null || km === undefined) return 'Consulte';
  if (km === 0) return '0 km';
  return `${new Intl.NumberFormat('pt-BR').format(km)} km`;
}

function normalizeCombustivel(raw: string): string {
  const s = cleanText(raw).toLowerCase();
  if (!s) return 'Flex';
  if (
    s.includes('híbrid') ||
    s.includes('hibrid') ||
    s.includes('hybrid') ||
    (s.includes('gas') && s.includes('elet'))
  )
    return 'Híbrido';
  if (s.includes('elétric') || s.includes('eletric')) return 'Elétrico';
  if (s.includes('diesel')) return 'Diesel';
  if (s.includes('flex') || (s.includes('álc') && s.includes('gasol')) || (s.includes('alc') && s.includes('gas')))
    return 'Flex';
  if (s.includes('gasol')) return 'Gasolina';
  if (s.includes('álc') || s.includes('etanol')) return 'Etanol';
  if (s.includes('gnv')) return 'GNV';
  return cleanText(raw);
}

function normalizeCambio(
  raw: string,
  titulo: string,
  opcionais: string[],
  combustivel: string
): string {
  const combined = `${raw} ${titulo} ${opcionais.join(' ')}`.toLowerCase();
  const s = cleanText(raw).toLowerCase();
  if (s.includes('cvt') || s.includes('autom')) return 'Automático';
  if (s.includes('manual') || s.includes('mecân')) return 'Manual';
  if (s.includes('automatiz')) return 'Automatizado';

  if (combustivel === 'Elétrico' || combustivel === 'Híbrido') return 'Automático';
  if (/\bcvt\b/i.test(combined)) return 'Automático';
  if (
    /câmbio automático|cambio automatico|automático|automatico|automática|automatica|\baut\.?\b|\btiptronic\b|\bdsg\b|\bs-tronic\b|\bpowershift\b/i.test(
      combined
    )
  ) {
    return 'Automático';
  }
  if (/\bmanual\b|\bmecânico\b/i.test(combined)) return 'Manual';
  return 'Manual';
}

function normalizeMarca(raw: string, titulo: string): string {
  const candidate = cleanText(raw) || cleanText(titulo).split(' ')[0] || 'Outros';
  const low = candidate.toLowerCase();
  const map: Record<string, string> = {
    vw: 'Volkswagen',
    volkswagen: 'Volkswagen',
    gm: 'Chevrolet',
    chevrolet: 'Chevrolet',
    fiat: 'Fiat',
    ford: 'Ford',
    toyota: 'Toyota',
    honda: 'Honda',
    hyundai: 'Hyundai',
    renault: 'Renault',
    jeep: 'Jeep',
    nissan: 'Nissan',
    peugeot: 'Peugeot',
    citroen: 'Citroën',
    'citroën': 'Citroën',
    mitsubishi: 'Mitsubishi',
    kia: 'Kia',
    bmw: 'BMW',
    'mercedes-benz': 'Mercedes-Benz',
    mercedes: 'Mercedes-Benz',
    audi: 'Audi',
    volvo: 'Volvo',
    byd: 'BYD',
    gwm: 'GWM',
    'gac motors': 'GAC',
    gac: 'GAC',
    chery: 'CAOA Chery',
    'caoa chery': 'CAOA Chery',
    ram: 'RAM',
    suzuki: 'Suzuki',
    subaru: 'Subaru',
    dafra: 'Dafra',
    yamaha: 'Yamaha',
    'land rover': 'Land Rover',
    mini: 'MINI',
    porsche: 'Porsche',
  };
  return map[low] || candidate;
}

function inferCategoria(
  carroceriaRaw: string,
  titulo: string,
  marca: string,
  combustivel: string,
  portas: number | null
): string {
  const c = cleanText(carroceriaRaw).toLowerCase();
  if (c.includes('suv')) return 'SUV';
  if (c.includes('sedã') || c.includes('seda') || c.includes('sedan')) return 'Sedan';
  if (c.includes('picape') || c.includes('pickup') || c.includes('caminhonete'))
    return 'Picape';
  if (c.includes('hatch')) return 'Hatch';
  if (c.includes('moto')) return 'Moto';
  if (c.includes('furg') || c.includes('van') || c.includes('utilit'))
    return 'Utilitário';

  const t = `${marca} ${titulo}`.toLowerCase();
  if (
    /\b(dafra|cg\s|cb\s|biz|bros|pcx|nmax|fazer|xtz|mt-0|kawasaki|harley|triumph|shineray|nh\s?190|moto)\b/i.test(
      t
    ) ||
    portas === 0
  ) {
    return 'Moto';
  }
  if (
    /\b(strada|saveiro|toro|hilux|s10|ranger|amarok|montana|oroch|frontier|l200|triton|rampage|maverick|f-250|silverado|ram\s?1500|picape|cd\b|cs\b)\b/i.test(
      t
    )
  ) {
    return 'Picape';
  }
  if (
    /\b(t-cross|tcross|nivus|taos|tiguan|creta|tracker|compass|renegade|commander|corolla cross|hr-v|hrv|zr-v|cr-v|kicks|duster|captur|kardian|boreal|pulse|fastback|haval|song|yuan|aion|tiggo|ecosport|territory|bronco|equinox|trailblazer|sw4|pajero|outlander|eclipse cross|x1|x3|x5|q3|q5|gla|xc40|xc60|peugeot\s*2008|peugeot\s*3008|c4 cactus|basalt|aircross|sportage|seltos|niro|wr-v)\b/i.test(
      t
    )
  ) {
    return 'SUV';
  }
  if (
    /\b(virtus|corolla(?!\s*cross)|civic|city(?!\s*hatch)|hb20s|hb20\s*sedan|onix\s*plus|cronos|voyage|jetta|sentra|versa|logan|cruze(?!\s*sport6)|prisma|siena|cobalt|accord|camry|seal|king|320i|c180|c200|a3\s*sedan|arrizo|cerato|elantra|fluence|fusion)\b/i.test(
      t
    )
  ) {
    return 'Sedan';
  }
  if (
    /\b(fiorino|kangoo|partner|doblo|kombi|master|sprinter|ducato|boxer|jumper|hr\s|bongo)\b/i.test(
      t
    )
  ) {
    return 'Utilitário';
  }
  if (
    /\b(polo|gol|golf|fox|up!|new beetle|beetle|onix|hb20|argo|mobi|uno|palio|kwid|sandero|stepway|ka\b|fiesta|focus|fit|city\s*hatch|yaris|etios|march|peugeot\s*208|c3|dolphin|ora|mini|clio|celta|corsa|punto|bravo|cruze\s*sport6|i30|picanto)\b/i.test(
      t
    )
  ) {
    return 'Hatch';
  }
  if (combustivel === 'Elétrico') return 'Elétrico';
  return 'Hatch / Passeio';
}

function makeShortCode(lojaSlug: LojaSlug, index: number): string {
  const prefixMap: Record<LojaSlug, string> = {
    'nenem-autos': 'NA',
    'rosa-automoveis': 'RA',
    'v3-automoveis': 'V3',
    'manos-veiculos': 'MV',
  };
  return `${prefixMap[lojaSlug]}-${String(index + 1).padStart(3, '0')}`;
}

function cleanDescription(desc: string): string {
  if (!desc) return '';
  return desc
    .replace(/Publicado pelo Autos 360[\s\S]*$/i, '')
    .replace(/GOSTOU DESTE VE[ÍI]CULO\?[\s\S]*?WhatsApp[^\n]*/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function parseJsonLd($: cheerio.CheerioAPI): Record<string, unknown>[] {
  const items: Record<string, unknown>[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).html();
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        for (const p of parsed) if (p && typeof p === 'object') items.push(p);
      } else if (parsed && typeof parsed === 'object') {
        items.push(parsed as Record<string, unknown>);
      }
    } catch {
      // ignore invalid json-ld
    }
  });
  return items;
}

// =========================================================================
// SCRAPER 1: Alto Vale Veículos & V3 Automóveis (mesmo motor Next.js)
// =========================================================================
async function extractAltoValeLikeStore(
  lojaSlug: LojaSlug,
  baseUrl: string,
  origin: string,
  linkPattern: RegExp
): Promise<{ veiculos: Veiculo[]; erros: string[] }> {
  const loja = LOJAS_BY_SLUG[lojaSlug];
  const erros: string[] = [];
  const allLinks = new Set<string>();

  for (let page = 1; page <= 10; page++) {
    const pageUrl = page === 1 ? baseUrl : `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}pagina=${page}`;
    try {
      const html = await fetchText(pageUrl);
      const $ = cheerio.load(html);
      let addedOnPage = 0;

      $('a[href]').each((_, el) => {
        const href = $(el).attr('href');
        if (!href) return;
        const fullUrl = href.startsWith('http') ? href : `${origin}${href.startsWith('/') ? '' : '/'}${href}`;
        if (linkPattern.test(fullUrl)) {
          const cleanUrl = fullUrl.split('?')[0].split('#')[0];
          if (!allLinks.has(cleanUrl)) {
            allLinks.add(cleanUrl);
            addedOnPage++;
          }
        }
      });

      if (addedOnPage === 0) break;
      // Check if page has pagination link to next page
      const hasNextPage = html.includes(`pagina=${page + 1}`);
      if (!hasNextPage) break;
    } catch (err) {
      erros.push(`[${loja.nome}] Falha ao listar página ${page}: ${String(err)}`);
      break;
    }
  }

  const urls = [...allLinks];
  const nowIso = new Date().toISOString();

  const rawVehicles = await runPool(urls, 6, async (url, idx) => {
    try {
      const html = await fetchText(url);
      const $ = cheerio.load(html);
      const lds = parseJsonLd($);
      const vehicleLd = lds.find(
        (ld) => ld['@type'] === 'Vehicle' || ld['@type'] === 'Car' || ld['@type'] === 'Motorcycle'
      ) as Record<string, any> | undefined;

      // Specs from <dl>
      const specs: Record<string, string> = {};
      $('dl dt').each((_, dt) => {
        const key = cleanText($(dt).text()).toLowerCase();
        const val = cleanText($(dt).next('dd').text());
        if (key && val) specs[key] = val;
      });
      // Fallback: div > dt + dd
      if (Object.keys(specs).length === 0) {
        $('dt').each((_, dt) => {
          const key = cleanText($(dt).text()).toLowerCase();
          const val = cleanText($(dt).parent().find('dd').first().text());
          if (key && val) specs[key] = val;
        });
      }

      const titulo =
        cleanText(vehicleLd?.name) ||
        cleanText($('h1').first().text()) ||
        cleanText($('title').text().split('—')[0]);

      const marca = normalizeMarca(vehicleLd?.brand?.name || '', titulo);
      const modelo = cleanText(vehicleLd?.model) || cleanText(titulo.replace(new RegExp(`^${marca}\\s*`, 'i'), '').split(' ')[0]);
      const versao = cleanText(
        titulo
          .replace(new RegExp(`^${marca}\\s*`, 'i'), '')
          .replace(new RegExp(`^${modelo}\\s*`, 'i'), '')
      );

      // Year
      const anoSpec = specs['ano'] || '';
      const anoMatches = anoSpec.match(/\d{4}/g);
      const anoFabricacao =
        (vehicleLd?.productionDate ? Number(vehicleLd.productionDate) : null) ||
        (anoMatches && anoMatches[0] ? Number(anoMatches[0]) : null);
      const anoModelo =
        (vehicleLd?.vehicleModelDate ? Number(vehicleLd.vehicleModelDate) : null) ||
        (anoMatches && anoMatches[1] ? Number(anoMatches[1]) : anoFabricacao);
      const anoTexto =
        anoFabricacao && anoModelo && anoFabricacao !== anoModelo
          ? `${anoFabricacao}/${anoModelo}`
          : anoModelo
            ? String(anoModelo)
            : anoSpec || 'Consulte';

      // Price
      const priceFromLd = parsePrice(vehicleLd?.offers?.price);
      const priceFromDom = parsePrice(
        $('*')
          .filter((_, el) => $(el).children().length === 0 && /R\$\s*[\d.]{4,}/.test($(el).text()))
          .first()
          .text()
      );
      const preco = priceFromLd ?? priceFromDom;

      // KM
      const km =
        parseKm(vehicleLd?.mileageFromOdometer?.value) ??
        parseKm(specs['quilometragem'] || specs['km']);

      // Opcionais
      const opcionais: string[] = [];
      $('h2, h3').each((_, heading) => {
        if (/opcionais/i.test($(heading).text())) {
          $(heading)
            .parent()
            .find('li')
            .each((_, li) => {
              const txt = cleanText($(li).text());
              if (txt && !opcionais.includes(txt)) opcionais.push(txt);
            });
        }
      });

      // Description
      let descricao = '';
      $('h2, h3').each((_, heading) => {
        if (/sobre o ve[íi]culo|descri[çc][ãa]o|observa/i.test($(heading).text())) {
          const p = $(heading).parent().find('p').text();
          const candidate = cleanText(p);
          if (candidate && candidate.length > descricao.length) {
            descricao = candidate;
          }
        }
      });

      const combustivel = normalizeCombustivel(
        vehicleLd?.fuelType || specs['combustível'] || specs['combustivel'] || ''
      );
      const cambio = normalizeCambio(
        specs['câmbio'] || specs['cambio'] || '',
        titulo,
        opcionais,
        combustivel
      );
      const cor = cleanText(vehicleLd?.color || specs['cor'] || 'Não informada');
      const portasRaw = vehicleLd?.numberOfDoors ?? specs['portas'];
      const portas = portasRaw ? parseInt(String(portasRaw).replace(/\D/g, ''), 10) || null : null;
      const finalPlaca = cleanText(specs['final da placa'] || specs['placa'] || '') || null;
      const cidade = cleanText(specs['cidade'] || loja.cidade);
      const categoria = inferCategoria(
        specs['carroceria'] || '',
        titulo,
        marca,
        combustivel,
        portas
      );

      // Photos: extract all unique 800.webp photos from fotos.altovaleveiculos.com.br
      const photoMatches = [
        ...html.matchAll(
          /https:\/\/fotos\.altovaleveiculos\.com\.br\/v\/[^"'\s\\<>]+\/800\.webp/g
        ),
      ].map((m) => m[0]);
      const fotos = [...new Set(photoMatches)];

      // Slug ID
      const lastSeg = url.split('/').filter(Boolean).pop() || String(idx);
      const shortSlug = lastSeg.slice(-24).replace(/[^a-zA-Z0-9-]/g, '');
      const id = `${lojaSlug}-${shortSlug}`;

      const veiculo: Veiculo = {
        id,
        codigo: makeShortCode(lojaSlug, idx),
        lojaSlug,
        lojaNome: loja.nome,
        titulo,
        marca,
        modelo,
        versao,
        anoFabricacao,
        anoModelo,
        anoTexto,
        preco,
        precoFormatado: formatPrice(preco),
        km,
        kmFormatado: formatKm(km),
        cambio,
        combustivel,
        cor,
        portas,
        categoria,
        finalPlaca,
        cidade,
        descricao: cleanDescription(descricao),
        opcionais,
        fotoCapa: fotos[0] || '',
        fotos,
        urlOriginal: url,
        atualizadoEm: nowIso,
      };
      return veiculo;
    } catch (err) {
      erros.push(`[${loja.nome}] Falha ao extrair ${url}: ${String(err)}`);
      return null;
    }
  });

  return {
    veiculos: rawVehicles.filter((v): v is Veiculo => v !== null && Boolean(v.titulo)),
    erros,
  };
}

// =========================================================================
// SCRAPER 2: Manos Veículos (WordPress + Altimus)
// =========================================================================
async function extractManosStore(): Promise<{ veiculos: Veiculo[]; erros: string[] }> {
  const lojaSlug: LojaSlug = 'manos-veiculos';
  const loja = LOJAS_BY_SLUG[lojaSlug];
  const erros: string[] = [];
  const allLinks = new Set<string>();

  for (let page = 1; page <= 12; page++) {
    const pageUrl =
      page === 1
        ? 'https://manosveiculos.com.br/estoque/'
        : `https://manosveiculos.com.br/estoque/page/${page}/`;
    try {
      const html = await fetchText(pageUrl);
      const $ = cheerio.load(html);
      let addedOnPage = 0;

      $('a[href]').each((_, el) => {
        const href = $(el).attr('href');
        if (!href) return;
        if (/^https?:\/\/manosveiculos\.com\.br\/veiculos\/[^/]+\/?$/i.test(href)) {
          const cleanUrl = href.endsWith('/') ? href : `${href}/`;
          if (!allLinks.has(cleanUrl)) {
            allLinks.add(cleanUrl);
            addedOnPage++;
          }
        }
      });

      if (addedOnPage === 0) break;
      const hasNext = html.includes(`/estoque/page/${page + 1}/`);
      if (!hasNext) break;
    } catch (err) {
      if (page === 1) {
        erros.push(`[${loja.nome}] Falha ao listar estoque: ${String(err)}`);
      }
      break;
    }
  }

  const urls = [...allLinks];
  const nowIso = new Date().toISOString();

  const rawVehicles = await runPool(urls, 6, async (url, idx) => {
    try {
      const html = await fetchText(url);
      const $ = cheerio.load(html);
      const lds = parseJsonLd($);
      const productLd = lds.find((ld) => ld['@type'] === 'Product') as
        | Record<string, any>
        | undefined;

      // Specs from dt/dd pairs AND li items
      const specs: Record<string, string> = {};
      $('dl').each((_, dl) => {
        const dts = $(dl).find('dt');
        const dds = $(dl).find('dd');
        if (dts.length > 0 && dts.length === dds.length) {
          dts.each((i, dt) => {
            const key = cleanText($(dt).text()).replace(/:$/, '').toLowerCase();
            const val = cleanText($(dds[i]).text()).replace(/:$/, '');
            if (key && val) specs[key] = val;
          });
        }
      });
      // Also check label/value inside list items (e.g. Ano: 2024)
      $('li').each((_, li) => {
        const txt = cleanText($(li).text());
        const m = txt.match(/^(Ano|KM|Quilometragem|Combust[íi]vel|C[âa]mbio|Cor|Portas|Placa|Marca|Modelo)\s*:\s*(.+)$/i);
        if (m) {
          const key = m[1].toLowerCase();
          if (!specs[key]) specs[key] = cleanText(m[2]);
        }
      });

      // Opcionais: Altimus puts optionals in <dl> elements that only have <dt> (no <dd>)
      const opcionais: string[] = [];
      $('dl').each((_, dl) => {
        const dts = $(dl).find('dt');
        const dds = $(dl).find('dd');
        if (dts.length > 0 && dds.length === 0) {
          dts.each((_, dt) => {
            const txt = cleanText($(dt).text());
            if (txt && txt.length < 80 && !opcionais.includes(txt)) {
              opcionais.push(txt);
            }
          });
        }
      });

      // Title: prioritize JSON-LD name or vehicle H1 (ignoring AltWhatsApp modal H1)
      const vehicleH1 = $('h1')
        .map((_, el) => cleanText($(el).text()))
        .get()
        .find((txt) => txt && !/whatsapp/i.test(txt));
      let titulo =
        cleanText(productLd?.name) ||
        cleanText(vehicleH1?.replace(/\s+-\s+/g, ' ')) ||
        cleanText($('title').text().split('–')[0]);
      titulo = titulo.replace(/\s+/g, ' ').trim();

      const marca = normalizeMarca(specs['marca'] || productLd?.brand?.name || '', titulo);
      const modelo =
        cleanText(specs['modelo']) ||
        cleanText(titulo.replace(new RegExp(`^${marca}\\s*`, 'i'), '').split(' ')[0]);
      const versao = cleanText(
        titulo
          .replace(new RegExp(`^${marca}\\s*`, 'i'), '')
          .replace(new RegExp(`^${modelo}\\s*`, 'i'), '')
          .replace(/\b20\d{2}\s*$/, '')
      );

      // Year from URL slug (e.g. ...-2023-2024/) or specs
      const slugYears = url.match(/(19\d{2}|20\d{2})-(19\d{2}|20\d{2})\/?$/);
      let anoFabricacao: number | null = slugYears ? Number(slugYears[1]) : null;
      let anoModelo: number | null = slugYears ? Number(slugYears[2]) : null;
      if (!anoModelo && specs['ano']) {
        const m = specs['ano'].match(/\d{4}/g);
        if (m && m.length >= 2) {
          anoFabricacao = Number(m[0]);
          anoModelo = Number(m[1]);
        } else if (m && m.length === 1) {
          anoFabricacao = Number(m[0]);
          anoModelo = Number(m[0]);
        }
      }
      const anoTexto =
        anoFabricacao && anoModelo && anoFabricacao !== anoModelo
          ? `${anoFabricacao}/${anoModelo}`
          : anoModelo
            ? String(anoModelo)
            : specs['ano'] || 'Consulte';

      // Price
      const priceFromLd = parsePrice(productLd?.offers?.price);
      let priceFromDom: number | null = null;
      const priceMatches = html.match(/R\$\s*[\d.]{2,3}\.\d{3}(?:,\d{2})?/g) || [];
      for (const pm of priceMatches) {
        const p = parsePrice(pm);
        if (p && p >= 5000) {
          priceFromDom = p;
          break;
        }
      }
      const preco = priceFromLd ?? priceFromDom;

      // KM
      const km = parseKm(specs['km'] || specs['quilometragem']);

      const combustivel = normalizeCombustivel(specs['combustível'] || specs['combustivel'] || '');
      const cambio = normalizeCambio(
        specs['cambio'] || specs['câmbio'] || '',
        titulo,
        opcionais,
        combustivel
      );
      const cor = cleanText(specs['cor'] || 'Não informada');
      const portas = specs['portas']
        ? parseInt(specs['portas'].replace(/\D/g, ''), 10) || null
        : null;
      const placaRaw = cleanText(specs['placa'] || '');
      const finalPlaca = placaRaw ? placaRaw.slice(-1) : null;
      const categoria = inferCategoria('', titulo, marca, combustivel, portas);

      // Photos from altimus2.arquivos.prod S3
      const s3Photos = [
        ...html.matchAll(
          /https?:\/\/s3\.amazonaws\.com\/altimus2\.arquivos\.prod\/[^"'\s<>]+\.(?:jpg|jpeg|png|webp)/gi
        ),
      ].map((m) => m[0]);
      const fotos = [...new Set(s3Photos)].filter(
        (u) => !/sem-foto|placeholder/i.test(u)
      );

      const descricao = cleanDescription(productLd?.description || '');

      const slugPart = url.split('/veiculos/')[1]?.replace(/\/$/, '') || String(idx);
      const id = `${lojaSlug}-${slugPart.slice(0, 48)}`;

      const veiculo: Veiculo = {
        id,
        codigo: makeShortCode(lojaSlug, idx),
        lojaSlug,
        lojaNome: loja.nome,
        titulo,
        marca,
        modelo,
        versao,
        anoFabricacao,
        anoModelo,
        anoTexto,
        preco,
        precoFormatado: formatPrice(preco),
        km,
        kmFormatado: formatKm(km),
        cambio,
        combustivel,
        cor,
        portas,
        categoria,
        finalPlaca,
        cidade: 'Rio do Sul',
        descricao,
        opcionais,
        fotoCapa: fotos[0] || '',
        fotos,
        urlOriginal: url,
        atualizadoEm: nowIso,
      };
      return veiculo;
    } catch (err) {
      erros.push(`[${loja.nome}] Falha ao extrair ${url}: ${String(err)}`);
      return null;
    }
  });

  return {
    veiculos: rawVehicles.filter((v): v is Veiculo => v !== null && Boolean(v.titulo)),
    erros,
  };
}

// =========================================================================
// ORQUESTRADOR PRINCIPAL DAS 4 LOJAS
// =========================================================================
export async function syncAllStores(): Promise<EstoqueDatabase> {
  const [nenem, rosa, v3, manos] = await Promise.all([
    extractAltoValeLikeStore(
      'nenem-autos',
      'https://altovaleveiculos.com.br/lojas/nenem-autos',
      'https://altovaleveiculos.com.br',
      /altovaleveiculos\.com\.br\/carros\/[^/]+$/i
    ),
    extractAltoValeLikeStore(
      'rosa-automoveis',
      'https://altovaleveiculos.com.br/lojas/rosa-automoveis',
      'https://altovaleveiculos.com.br',
      /altovaleveiculos\.com\.br\/carros\/[^/]+$/i
    ),
    extractAltoValeLikeStore(
      'v3-automoveis',
      'https://www.v3automoveis.com.br/estoque',
      'https://www.v3automoveis.com.br',
      /v3automoveis\.com\.br\/veiculo\/[^/]+$/i
    ),
    extractManosStore(),
  ]);

  // Interleave vehicles from the 4 stores so the default view showcases all 4 stores nicely!
  const queues = [nenem.veiculos, v3.veiculos, manos.veiculos, rosa.veiculos];
  const interleaved: Veiculo[] = [];
  const maxLen = Math.max(...queues.map((q) => q.length));
  for (let i = 0; i < maxLen; i++) {
    for (const q of queues) {
      if (q[i]) interleaved.push(q[i]);
    }
  }

  const erros = [...nenem.erros, ...rosa.erros, ...v3.erros, ...manos.erros];

  return {
    metadata: {
      atualizadoEm: new Date().toISOString(),
      totalVeiculos: interleaved.length,
      porLoja: {
        'nenem-autos': nenem.veiculos.length,
        'rosa-automoveis': rosa.veiculos.length,
        'v3-automoveis': v3.veiculos.length,
        'manos-veiculos': manos.veiculos.length,
      },
      erros,
    },
    lojas: LOJAS,
    veiculos: interleaved,
  };
}
