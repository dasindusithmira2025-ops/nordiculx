import './load-env';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';

/**
 * Provisions the official brand logos used by the brand grid.
 *
 * Every asset is downloaded from the brand's own site or its own CDN, stored
 * locally under `public/media/brands`, and recorded in a provenance file with
 * the source URL, the retrieval time and a SHA-256 of the bytes. Nothing is
 * hotlinked at render time — a brand changing its CDN path must not blank the
 * grid, and a third-party origin must not receive a request for every visitor.
 *
 * Two rules this script exists to enforce:
 *
 *   1. Logos are never recreated, redrawn, traced or generated. The bytes a
 *      brand publishes are the bytes we serve. If a source cannot be
 *      retrieved, the brand is reported as unresolved and the grid falls back
 *      to setting its name, which is what it did before this existed.
 *   2. The optical scale below is presentation metadata, not a modification.
 *      The stored asset is byte-identical to the source.
 *
 *   npx tsx scripts/fetch-brand-logos.ts [--db] [--dry-run]
 *
 * `--db` writes the resulting paths to `brands.logo_url`, which is the real
 * source of truth; the generated manifest is the fallback for an environment
 * whose rows predate the column being populated.
 */

const OUT_DIR = join(process.cwd(), 'public', 'media', 'brands');
const PUBLIC_PREFIX = '/media/brands';
const MANIFEST_TS = join(
  process.cwd(),
  'src',
  'lib',
  'catalogue',
  'brand-logos.ts',
);

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

type Source =
  /** A logo the brand publishes as its own file. */
  | { kind: 'file'; url: string; referer: string }
  /**
   * A logo the brand only ships as an inline `<svg>` in its header. The
   * element is lifted verbatim; `contains` pins which one, so a redesign of
   * the source site fails loudly instead of silently saving a search icon.
   */
  | { kind: 'inline'; pageUrl: string; contains: string[] };

type BrandLogoSource = {
  /** Must match `brands.slug`. */
  slug: string;
  name: string;
  source: Source;
  /**
   * Height relative to the shared logo stage, 0–1.
   *
   * Normalising on the bounding box alone does not work. A lockup that
   * includes a descriptor line ("DEVELOPED WITH DERMATOLOGISTS") or an
   * enclosing shape carries far more artwork above and below its cap height
   * than a bare wordmark does, and giving both the same box height makes the
   * bare wordmark look twice as large. These values equalise the letterforms,
   * which is what the eye actually compares. Tuned against the rendered row —
   * there is no formula for it, so this is the knob to turn if a logo looks
   * wrong next to its neighbours.
   */
  opticalScale: number;
};

const SOURCES: BrandLogoSource[] = [
  {
    slug: 'cerave',
    name: 'CeraVe',
    source: {
      kind: 'file',
      url: 'https://www.cerave.com/-/media/project/loreal/brand-sites/cerave/shared/baseline/cerave-logo-top.svg?w=0&hash=239AA06EAC9D269F3D17D7645863F4C0',
      referer: 'https://www.cerave.com/',
    },
    // Wordmark plus a descriptor line under it — the block is tall for its type.
    opticalScale: 1,
  },
  {
    slug: 'cetaphil',
    name: 'Cetaphil',
    source: {
      kind: 'file',
      url: 'https://www.cetaphil.com/on/demandware.static/-/Library-Sites-RefArchSharedLibrary/default/dw14371c1b/images/Cetaphil_Logo_285.png',
      referer: 'https://www.cetaphil.com/',
    },
    // Type sits inside an ellipse device, so it is small within its box.
    opticalScale: 0.85,
  },
  {
    slug: 'cosrx',
    name: 'COSRX',
    source: {
      kind: 'file',
      url: 'https://www.cosrx.com/cdn/shop/files/COSRX.png?v=1658313147',
      referer: 'https://www.cosrx.com/',
    },
    // Bare wordmark, pure cap height — needs holding well back.
    opticalScale: 0.5,
  },
  {
    slug: 'eucerin',
    name: 'Eucerin',
    source: {
      kind: 'inline',
      pageUrl: 'https://int.eucerin.com/',
      contains: ['viewBox="0 0 209 78"', '#C10016'],
    },
    // Wordmark over the red chevron device.
    opticalScale: 0.78,
  },
  {
    slug: 'ferrero-rocher',
    name: 'Ferrero Rocher',
    source: {
      kind: 'file',
      url: 'https://www.ferrerorocher.com/int/brands/ferrerorocher20/themes/custom/ferrerorocher20_theme/assets/images/global-logo.svg',
      referer: 'https://www.ferrerorocher.com/int/en/',
    },
    // Two stacked lines of type; the whole block is the mark.
    opticalScale: 0.9,
  },
  {
    slug: 'garnier',
    name: 'Garnier',
    source: {
      kind: 'file',
      url: 'https://www.garnier.co.uk/-/media/project/loreal/brand-sites/garnier/emea/uk/garnier-logo-new-menu.png',
      referer: 'https://www.garnier.co.uk/',
    },
    // Wordmark with the leaf device overlapping the G.
    opticalScale: 0.72,
  },
  {
    slug: 'la-roche-posay',
    name: 'La Roche-Posay',
    source: {
      kind: 'file',
      url: 'https://www.laroche-posay.pl/-/media/project/loreal/brand-sites/lrp/shared/baseline/identity/lrp_logo/logo.png',
      referer: 'https://www.laroche-posay.pl/',
    },
    // Wordmark over "LABORATOIRE DERMATOLOGIQUE".
    opticalScale: 0.9,
  },
  {
    slug: 'purito',
    name: 'Purito',
    source: {
      kind: 'inline',
      pageUrl: 'https://purito.com/',
      contains: ['viewBox="0 0 205.8 59.7"'],
    },
    // Serif wordmark with a wide ascender-to-descender range.
    opticalScale: 0.5,
  },
  {
    slug: 'revuele',
    name: 'Revuele',
    source: {
      kind: 'inline',
      pageUrl: 'https://revuele.eu/',
      contains: ['aria-label="REVUELE"'],
    },
    // Wordmark over a letter-spaced descriptor line.
    opticalScale: 0.85,
  },
  {
    slug: 'skin1004',
    name: 'SKIN1004',
    source: {
      kind: 'file',
      url: 'https://www.skin1004.com/cdn/shop/files/SKIN1004_LOGO_300PX_30c77c72-0035-4b50-ba2c-f2c7a36a0d9d.png?v=1738771518',
      referer: 'https://www.skin1004.com/',
    },
    // Very wide, heavily letter-spaced wordmark; full stage height dominates.
    opticalScale: 1,
  },
  {
    slug: 'the-ordinary',
    name: 'The Ordinary',
    source: {
      kind: 'file',
      url: 'https://theordinary.com/on/demandware.static/Sites-deciem-global-Site/-/default/dw95d33370/images/brands-logo/theOrdinary-logo.svg',
      referer: 'https://theordinary.com/',
    },
    // Two lines: small "The" over a large "Ordinary."
    opticalScale: 0.92,
  },
];

type Resolved = {
  slug: string;
  name: string;
  file: string;
  url: string;
  format: string;
  width: number;
  height: number;
  opticalScale: number;
  bytes: number;
  sha256: string;
  sourceUrl: string;
  retrievedAt: string;
};

async function get(url: string, referer: string): Promise<Buffer> {
  const res = await fetch(url, {
    headers: { 'user-agent': UA, referer, accept: '*/*' },
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

/**
 * Pulls one `<svg>` element out of a page. The cap on the lazy match stops a
 * malformed document from swallowing the rest of the file.
 */
function extractInlineSvg(html: string, contains: string[]): string | null {
  const svgs = html.match(/<svg[\s\S]{0,40000}?<\/svg>/gi) ?? [];
  const hit = svgs.find((svg) => contains.every((c) => svg.includes(c)));
  if (!hit) return null;
  // A standalone file needs the namespace the inline element inherits from HTML.
  return /xmlns=/.test(hit)
    ? hit
    : hit.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
}

async function resolveOne(
  entry: BrandLogoSource,
  dryRun: boolean,
): Promise<Resolved> {
  const { source } = entry;

  let data: Buffer;
  let sourceUrl: string;

  if (source.kind === 'file') {
    data = await get(source.url, source.referer);
    sourceUrl = source.url;
  } else {
    const html = (await get(source.pageUrl, source.pageUrl)).toString('utf8');
    const svg = extractInlineSvg(html, source.contains);
    if (!svg) {
      throw new Error(
        `no inline <svg> on ${source.pageUrl} matching ${source.contains.join(' + ')} — the source markup changed`,
      );
    }
    data = Buffer.from(svg, 'utf8');
    sourceUrl = source.pageUrl;
  }

  const meta = await sharp(data).metadata();
  if (!meta.format || !meta.width || !meta.height) {
    throw new Error(`unreadable image for ${entry.slug}`);
  }
  const file = `${entry.slug}.${meta.format === 'svg' ? 'svg' : meta.format}`;

  if (!dryRun) {
    await mkdir(OUT_DIR, { recursive: true });
    await writeFile(join(OUT_DIR, file), data);
  }

  return {
    slug: entry.slug,
    name: entry.name,
    file,
    url: `${PUBLIC_PREFIX}/${file}`,
    format: meta.format,
    width: meta.width,
    height: meta.height,
    opticalScale: entry.opticalScale,
    bytes: data.byteLength,
    sha256: createHash('sha256').update(data).digest('hex'),
    sourceUrl,
    retrievedAt: new Date().toISOString(),
  };
}

function renderManifest(rows: Resolved[]): string {
  const entries = rows
    .map(
      (r) => `  '${r.slug}': {
    src: '${r.url}',
    width: ${r.width},
    height: ${r.height},
    opticalScale: ${r.opticalScale},
  },`,
    )
    .join('\n');

  return `/**
 * Official brand logos held locally under public/media/brands.
 *
 * GENERATED by scripts/fetch-brand-logos.ts — do not edit by hand. Re-run the
 * script to add a brand or refresh an asset; provenance for every file is in
 * public/media/brands/logo-provenance.json.
 *
 * \`brands.logo_url\` in the database is the source of truth and wins whenever
 * it is set. This map is the fallback for rows that predate the column being
 * populated, and it is also what supplies the intrinsic size and the optical
 * scale — neither of which the database column carries.
 */

export type BrandLogo = {
  src: string;
  width: number;
  height: number;
  /**
   * Height relative to the logo stage, 0–1, equalising letterform size across
   * marks whose artwork includes very different amounts of surrounding
   * material. See the note in scripts/fetch-brand-logos.ts.
   */
  opticalScale: number;
};

const BRAND_LOGOS: Record<string, BrandLogo> = {
${entries}
};

/** The held logo for a brand slug, or null when we do not have one. */
export function brandLogo(slug: string): BrandLogo | null {
  return BRAND_LOGOS[slug] ?? null;
}
`;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const writeDb = process.argv.includes('--db');

  const resolved: Resolved[] = [];
  const failed: { slug: string; reason: string }[] = [];

  for (const entry of SOURCES) {
    try {
      const row = await resolveOne(entry, dryRun);
      resolved.push(row);
      console.warn(
        `  ok    ${row.slug.padEnd(16)} ${row.format.padEnd(4)} ${row.width}x${row.height}  ${row.bytes}b`,
      );
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      failed.push({ slug: entry.slug, reason });
      console.error(`  FAIL  ${entry.slug.padEnd(16)} ${reason}`);
    }
  }

  if (!dryRun && resolved.length > 0) {
    await writeFile(
      join(OUT_DIR, 'logo-provenance.json'),
      `${JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          note: "Official brand assets retrieved from each brand's own site or CDN and stored verbatim. Never redrawn, traced or generated.",
          count: resolved.length,
          logos: resolved,
          unresolved: failed,
        },
        null,
        2,
      )}\n`,
      'utf8',
    );
    await writeFile(MANIFEST_TS, renderManifest(resolved), 'utf8');
  }

  if (writeDb && !dryRun && resolved.length > 0) {
    const { db } = await import('@/lib/db');
    const s = await import('@/lib/db/schema');
    const { eq } = await import('drizzle-orm');
    for (const row of resolved) {
      const hit = await db
        .update(s.brands)
        .set({ logoUrl: row.url, updatedAt: new Date() })
        .where(eq(s.brands.slug, row.slug))
        .returning({ id: s.brands.id });
      console.warn(
        hit.length > 0
          ? `  db    ${row.slug} -> ${row.url}`
          : `  db    ${row.slug} — no such brand row, skipped`,
      );
    }
  }

  console.warn(
    `\n${resolved.length}/${SOURCES.length} logos resolved${
      failed.length > 0
        ? `, unresolved: ${failed.map((f) => f.slug).join(', ')}`
        : ''
    }`,
  );
  if (!writeDb && !dryRun) {
    console.warn('Run again with --db to write brands.logo_url.');
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
