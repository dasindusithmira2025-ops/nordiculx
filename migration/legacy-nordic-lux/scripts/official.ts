/**
 * Phase 6/7 — official-source recovery.
 *
 * The PDF supplies 48 of 88 product photographs and truncates every
 * description mid-word; the legacy repo covers 26 products. The rest has to
 * come from the manufacturers themselves.
 *
 * Two rules shape this file:
 *
 *  1. **Harvest once, match locally.** Each brand's catalogue is pulled in one
 *     or two requests and cached on disk, then our 88 products are matched
 *     against that local index. There is no per-product API call and a re-run
 *     costs nothing. Nothing here is a paid service.
 *  2. **Never guess a product.** A candidate is only accepted when the token
 *     evidence clears a threshold *and* any size printed on both sides agrees.
 *     Everything else is reported as unresolved rather than filled with a
 *     plausible-looking neighbour — using the wrong variant's photograph is a
 *     worse failure than having none.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ARCHIVE = resolve(HERE, '../archive');
const CACHE = resolve(ARCHIVE, 'official-cache');

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/* ==========================================================================
   Cached fetch
   ========================================================================== */

export type Fetched = {
  url: string;
  status: number;
  body: string;
  retrievedAt: string;
  fromCache: boolean;
};

function cachePath(url: string): string {
  return resolve(
    CACHE,
    `${createHash('sha256').update(url).digest('hex').slice(0, 32)}.json`,
  );
}

export async function cachedFetch(
  url: string,
  { refresh = false } = {},
): Promise<Fetched> {
  mkdirSync(CACHE, { recursive: true });
  const path = cachePath(url);
  if (!refresh && existsSync(path)) {
    return {
      ...(JSON.parse(readFileSync(path, 'utf8')) as Fetched),
      fromCache: true,
    };
  }
  // One flaky host must not abort a harvest of hundreds of pages; a failure is
  // recorded as a status-0 result and simply skipped by the callers.
  let record: Fetched;
  try {
    const res = await fetch(url, {
      headers: {
        'user-agent': UA,
        accept: '*/*',
        'accept-language': 'en-GB,en;q=0.9',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(30_000),
    });
    record = {
      url,
      status: res.status,
      body: await res.text(),
      retrievedAt: new Date().toISOString(),
      fromCache: false,
    };
  } catch (err) {
    return {
      url,
      status: 0,
      body: `fetch failed: ${(err as Error).message}`,
      retrievedAt: new Date().toISOString(),
      fromCache: false,
    };
  }
  writeFileSync(path, JSON.stringify(record));
  return record;
}

/** Small politeness delay between live requests to one host. */
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/* ==========================================================================
   Normalised shape every adapter produces
   ========================================================================== */

export type OfficialProduct = {
  source: string;
  sourceDomain: string;
  url: string;
  title: string;
  vendor: string | null;
  /** Plain-text description, HTML stripped. */
  description: string | null;
  /** Full INCI list when the page publishes one. */
  ingredients: string | null;
  howToUse: string | null;
  /** Highest-resolution image URLs, best first. */
  images: string[];
  /** Size labels the source advertises, e.g. ["30ml", "60ml"]. */
  sizes: string[];
  tags: string[];
  productType: string | null;
  retrievedAt: string;
};

/* --- HTML helpers --------------------------------------------------------- */

export function stripHtml(html: string): string {
  return html
    .replace(/<\s*(script|style)[\s\S]*?<\/\s*\1\s*>/gi, ' ')
    .replace(/<\s*br\s*\/?\s*>/gi, '\n')
    .replace(/<\s*\/\s*(p|div|li|h[1-6])\s*>/gi, '\n')
    .replace(/<\s*li\s*>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&rsquo;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Every JSON-LD block on a page, flattened through @graph. */
export function jsonLdBlocks(html: string): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  for (const m of html.matchAll(
    /<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    try {
      const parsed = JSON.parse(m[1]!.trim());
      const list = Array.isArray(parsed) ? parsed : [parsed];
      for (const node of list) {
        if (node && typeof node === 'object') {
          out.push(node as Record<string, unknown>);
          const graph = (node as { '@graph'?: unknown })['@graph'];
          if (Array.isArray(graph))
            for (const g of graph) if (g && typeof g === 'object') out.push(g);
        }
      }
    } catch {
      // A malformed block on one page must not abort the harvest.
    }
  }
  return out;
}

function typeOf(node: Record<string, unknown>): string[] {
  const t = node['@type'];
  return Array.isArray(t) ? t.map(String) : t ? [String(t)] : [];
}

export function findProductNode(html: string): Record<string, unknown> | null {
  return jsonLdBlocks(html).find((n) => typeOf(n).includes('Product')) ?? null;
}

function metaContent(html: string, property: string): string | null {
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']${property}["'][^>]*content=["']([^"']+)["']`,
    'i',
  );
  const alt = new RegExp(
    `<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']${property}["']`,
    'i',
  );
  return html.match(re)?.[1] ?? html.match(alt)?.[1] ?? null;
}

/* ==========================================================================
   Adapter: Shopify (SKIN1004, COSRX)
   ========================================================================== */

type ShopifyProduct = {
  title: string;
  handle: string;
  body_html: string;
  vendor: string;
  product_type: string;
  tags: string[];
  images: { src: string; width: number; height: number }[];
  variants: { title: string; option1?: string | null; sku?: string | null }[];
};

/** Shopify serves the whole catalogue as JSON, 250 rows per page. */
export async function harvestShopify(
  host: string,
  refresh: boolean,
): Promise<OfficialProduct[]> {
  const out: OfficialProduct[] = [];
  for (let page = 1; page <= 4; page++) {
    const url = `https://${host}/products.json?limit=250&page=${page}`;
    const res = await cachedFetch(url, { refresh });
    if (res.status !== 200) break;
    let products: ShopifyProduct[] = [];
    try {
      products =
        (JSON.parse(res.body) as { products: ShopifyProduct[] }).products ?? [];
    } catch {
      break;
    }
    if (products.length === 0) break;
    for (const p of products) {
      out.push({
        source: host,
        sourceDomain: host,
        url: `https://${host}/products/${p.handle}`,
        title: p.title,
        vendor: p.vendor ?? null,
        description: p.body_html ? stripHtml(p.body_html) : null,
        ingredients: extractSection(p.body_html ?? '', /ingredients?/i),
        howToUse: extractSection(
          p.body_html ?? '',
          /how to use|directions|usage/i,
        ),
        // Shopify CDN honours a width parameter; ask for a large master.
        images: (p.images ?? [])
          .sort((a, b) => b.width * b.height - a.width * a.height)
          .map((i) => i.src),
        sizes: [
          ...new Set(
            (p.variants ?? [])
              .map((v) => v.option1 ?? v.title)
              .filter(Boolean) as string[],
          ),
        ].filter((s) => s.toLowerCase() !== 'default title'),
        tags: p.tags ?? [],
        productType: p.product_type || null,
        retrievedAt: res.retrievedAt,
      });
    }
    if (!res.fromCache) await sleep(600);
    if (products.length < 250) break;
  }
  return out;
}

/**
 * Pulls a labelled block ("Ingredients: ...") out of a description. Brands
 * publish these as a bold heading followed by the text, which survives the
 * HTML strip as a line beginning with that label.
 */
export function extractSection(html: string, label: RegExp): string | null {
  const text = stripHtml(html);
  const lines = text.split('\n');
  const at = lines.findIndex((l) => label.test(l) && l.trim().length < 120);
  if (at < 0) return null;
  // The label may sit on its own line, or lead the paragraph.
  const inline = lines[at]!.replace(
    new RegExp(`^.*?${label.source}\\s*:?\\s*`, 'i'),
    '',
  ).trim();
  if (inline.length > 40) return inline;
  const rest: string[] = [];
  for (let i = at + 1; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (!line) {
      if (rest.length) break;
      continue;
    }
    if (
      /^(how to use|ingredients?|directions|benefits?|what it is|caution)/i.test(
        line,
      ) &&
      rest.length
    )
      break;
    rest.push(line);
    if (rest.join(' ').length > 1200) break;
  }
  const joined = rest.join('\n').trim();
  return joined.length > 20 ? joined : null;
}

/* ==========================================================================
   Adapter: JSON-LD storefronts (The Ordinary, CeraVe)
   ========================================================================== */

/** Follows a sitemap index down to the URL entries matching a pattern. */
async function sitemapUrls(
  indexUrl: string,
  keep: RegExp,
  refresh: boolean,
): Promise<string[]> {
  const seen = new Set<string>();
  const index = await cachedFetch(indexUrl, { refresh });
  if (index.status !== 200) return [];
  const children = [...index.body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) =>
    m[1]!.trim(),
  );
  // A sitemap index lists sitemaps; a plain sitemap lists pages. Handle both.
  const nested = children.filter((u) => /\.xml(\.gz)?$/.test(u));
  const direct = children.filter((u) => keep.test(u));
  for (const u of direct) seen.add(u);

  for (const child of nested) {
    // Localised sitemaps repeat the same catalogue in other languages; keep
    // only the English ones (which is where the product URLs actually live).
    if (/sitemap-[a-z]{2}_[A-Z]{2}/.test(child) && !/sitemap-en_/.test(child))
      continue;
    const res = await cachedFetch(child, { refresh });
    if (!res.fromCache) await sleep(400);
    if (res.status !== 200) continue;
    for (const m of res.body.matchAll(/<loc>([^<]+)<\/loc>/g)) {
      const u = m[1]!.trim();
      if (keep.test(u)) seen.add(u);
    }
  }
  return [...seen];
}

/** Collects product URLs from listing pages or a sitemap, then reads each product's JSON-LD. */
export async function harvestJsonLd(
  opts: {
    host: string;
    listingUrls?: string[];
    sitemap?: { indexUrl: string; keep: RegExp };
    linkPattern?: RegExp;
    limit?: number;
  },
  refresh: boolean,
): Promise<OfficialProduct[]> {
  const links = new Set<string>();

  if (opts.sitemap) {
    for (const u of await sitemapUrls(
      opts.sitemap.indexUrl,
      opts.sitemap.keep,
      refresh,
    ))
      links.add(u);
  }
  for (const listing of opts.listingUrls ?? []) {
    const res = await cachedFetch(listing, { refresh });
    if (res.status !== 200) continue;
    if (opts.linkPattern) {
      for (const m of res.body.matchAll(opts.linkPattern)) {
        const href = m[1] ?? m[0];
        links.add(
          href.startsWith('http') ? href : `https://${opts.host}${href}`,
        );
      }
    }
    if (!res.fromCache) await sleep(600);
  }

  const out: OfficialProduct[] = [];
  const urls = [...links].slice(0, opts.limit ?? 400);
  for (const url of urls) {
    const res = await cachedFetch(url, { refresh });
    if (!res.fromCache) await sleep(500);
    if (res.status !== 200) continue;
    const node = findProductNode(res.body);
    const title = (node?.name as string) ?? metaContent(res.body, 'og:title');
    if (!title) continue;

    const images = collectImages(node, res.body);
    out.push({
      source: opts.host,
      sourceDomain: opts.host,
      url,
      title: stripHtml(String(title)),
      vendor: (node?.brand as { name?: string })?.name ?? null,
      description: node?.description
        ? stripHtml(String(node.description))
        : metaContent(res.body, 'og:description'),
      ingredients: extractSection(res.body, /ingredients/i),
      howToUse: extractSection(res.body, /how to use|directions/i),
      images,
      sizes: collectSizes(res.body),
      tags: [],
      productType: null,
      retrievedAt: res.retrievedAt,
    });
  }
  return out;
}

function collectImages(
  node: Record<string, unknown> | null,
  html: string,
): string[] {
  const raw: string[] = [];
  const image = node?.image;
  if (typeof image === 'string') raw.push(image);
  else if (Array.isArray(image))
    for (const i of image)
      raw.push(
        typeof i === 'string' ? i : String((i as { url?: string })?.url ?? ''),
      );
  const og = metaContent(html, 'og:image');
  if (og) raw.push(og);
  return [...new Set(raw.filter((u) => /^https?:\/\//.test(u)))];
}

function collectSizes(html: string): string[] {
  const sizes = new Set<string>();
  for (const m of html.matchAll(/\b(\d[\d.]*)\s?(ml|g)\b/gi))
    sizes.add(`${Number(m[1])}${m[2]!.toLowerCase()}`);
  return [...sizes].slice(0, 8);
}

/* ==========================================================================
   Matching
   ========================================================================== */

const STOP = new Set([
  'the',
  'for',
  'a',
  'of',
  'in',
  'to',
  'and',
  'with',
  'skin',
  'face',
  'facial',
  'new',
  'size',
  'travel',
  'oz',
  'fl',
  'ml',
  'g',
  'pack',
  'pcs',
  'formula',
  // Range words that a brand prints on the pack but omits from its own product
  // titles. SKIN1004 sells "Centella Ampoule Foam", never "Madagascar Centella
  // Ampoule Foam", so keeping these would penalise every correct match.
  'madagascar',
  'madagaskar',
  'products',
  'product',
]);

/**
 * Ingredient abbreviations, expanded before tokenising so both spellings meet
 * in the middle. Our listings spell them out ("Hyaluronic Acid") where the
 * brands abbreviate ("HA"), and without this every such pair loses two tokens.
 */
const ALIASES: [RegExp, string][] = [
  [/\bha\b/g, 'hyaluronic acid'],
  [/\bhyaluronic acid\b/g, 'hyaluronic acid'],
  [/\bnmf\b/g, 'natural moisturizing factors'],
  [/\bsa\b/g, 'salicylic acid'],
  [/\bb5\b/g, 'panthenol b5'],
  [/\bmoisturising\b/g, 'moisturizing'],
  [/\bmoisturiser\b/g, 'moisturizer'],
  [/\bcentre\b/g, 'center'],
];

export function tokens(s: string): Set<string> {
  let text = s.toLowerCase().replace(/[^a-z0-9%+]+/g, ' ');
  for (const [re, to] of ALIASES) text = text.replace(re, to);
  return new Set(text.split(' ').filter((w) => w.length > 1 && !STOP.has(w)));
}

/**
 * Symmetric token score (Dice). Symmetric matters: a plain containment score
 * lets a two-word official title ("Foaming Cleanser") swallow a long listing
 * title that actually names a different product ("Foaming Oil Cleanser").
 *
 * With `weights`, rare tokens count for more than common ones, so "argan" or
 * "lactic" outweighs "cleanser" or "cream" — the difference between two
 * products in a range is always carried by the rare token.
 */
export function score(
  a: string,
  b: string,
  weights?: Map<string, number>,
): number {
  const ta = tokens(a);
  const tb = tokens(b);
  if (!ta.size || !tb.size) return 0;
  const w = (t: string) => weights?.get(t) ?? 1;
  let shared = 0;
  let total = 0;
  for (const t of ta) {
    total += w(t);
    if (tb.has(t)) shared += w(t);
  }
  for (const t of tb) {
    total += w(t);
    if (ta.has(t)) shared += w(t);
  }
  return total === 0 ? 0 : shared / total;
}

/**
 * The text a candidate is matched on: brand, title, and the URL slug.
 *
 * The slug matters. Garnier's JSON-LD titles are range-level ("Garnier Vitamin
 * E Moisturising Body Cream") and only the URL says which variant it is
 * (`body-superfood-avocado-omega-6`), so without the slug every flavour in a
 * range looks identical.
 */
export function matchText(c: OfficialProduct): string {
  const slug = (() => {
    try {
      return decodeURIComponent(new URL(c.url).pathname).replace(
        /[/_-]+/g,
        ' ',
      );
    } catch {
      return '';
    }
  })();
  return `${c.vendor ?? ''} ${c.title} ${slug}`;
}

/**
 * Inverse document frequency over the candidate titles. Computed per source so
 * "cerave" in every CeraVe title contributes almost nothing.
 */
export function tokenWeights(
  candidates: OfficialProduct[],
): Map<string, number> {
  const df = new Map<string, number>();
  for (const c of candidates) {
    for (const t of tokens(matchText(c))) df.set(t, (df.get(t) ?? 0) + 1);
  }
  const n = Math.max(candidates.length, 1);
  const weights = new Map<string, number>();
  for (const [t, count] of df) weights.set(t, Math.log(1 + n / count));
  return weights;
}

/**
 * Concentration/strength markers — "0.5%", "10%", "2%", "spf50", "23%".
 *
 * These are the whole difference between Retinol 0.5% and Retinol 1%, or
 * between Anthelios SPF30 and SPF50. Dice similarity barely notices them
 * because they are one token among many, so they are checked separately and
 * treated as a hard constraint.
 */
export function strengthMarkers(s: string): Set<string> {
  const out = new Set<string>();
  for (const m of s.matchAll(/(\d+(?:\.\d+)?)\s*%/g))
    out.add(`${Number(m[1])}%`);
  for (const m of s.matchAll(/\bspf\s*(\d+)/gi)) out.add(`spf${Number(m[1])}`);
  return out;
}

/**
 * True when the two sides state *incompatible* strengths.
 *
 * Absence is not disagreement. Brands abbreviate: our listing says "Lactic Acid
 * 5% + Hyaluronic Acid 2%" where The Ordinary's own title says "Lactic Acid 5%
 * + HA" — the 2% is simply not printed, and demanding it would reject the
 * correct product. A conflict needs each side to assert something the other
 * contradicts, which is exactly the Retinol 0.5% vs Retinol 1% case.
 */
export function strengthConflict(want: string, have: string): boolean {
  const a = strengthMarkers(want);
  const b = strengthMarkers(have);
  if (a.size === 0 || b.size === 0) return false;
  const onlyA = [...a].filter((m) => !b.has(m));
  const onlyB = [...b].filter((m) => !a.has(m));
  return onlyA.length > 0 && onlyB.length > 0;
}

const ML_PER_FL_OZ = 29.5735;

/** A size label reduced to millilitres, so "1 fl oz" and "30ml" compare equal. */
export function sizeToMl(label: string): number | null {
  const s = label.toLowerCase().replace(/\s+/g, ' ');
  const floz = s.match(/([\d.]+)\s*fl\.?\s?oz/);
  if (floz) return Number(floz[1]) * ML_PER_FL_OZ;
  const ml = s.match(/([\d.]+)\s*ml/);
  if (ml) return Number(ml[1]);
  const g = s.match(/([\d.]+)\s*g\b/);
  if (g) return Number(g[1]);
  return null;
}

/**
 * Size agreement, when both sides state one.
 *
 * Compared in millilitres with a 5% tolerance rather than as strings: brands
 * round the imperial figure on the label ("1.69 fl oz" is sold as 50ml), so a
 * literal comparison reports a mismatch for two labels describing one bottle.
 */
export function sizesAgree(
  want: string | null,
  have: string[],
): boolean | null {
  if (!want || have.length === 0) return null;
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, '');
  if (have.some((h) => norm(h) === norm(want))) return true;

  const wantMl = sizeToMl(want);
  if (wantMl === null) return null;
  const haveMl = have.map(sizeToMl).filter((n): n is number => n !== null);
  if (haveMl.length === 0) return null;
  return haveMl.some((h) => Math.abs(h - wantMl) / Math.max(h, wantMl) <= 0.05);
}

/**
 * Modifiers that make a separate product rather than a wording difference.
 *
 * "Anthelios UVMune 400 Invisible Fluid" and "Anthelios UVMune 400 Invisible
 * *Tinted* Fluid" differ by one token and score almost identically, but one is
 * clear and one is coloured. Same for a kids' formula, a refill pouch, a travel
 * size or a gift set. If one side declares such a modifier and the other does
 * not, they are different products regardless of how well the rest matches.
 */
const VARIANT_MODIFIERS = [
  'tinted',
  'kids',
  'kid',
  'junior',
  'baby',
  'paediatrics',
  'pediatrics',
  'refill',
  'mini',
  'set',
  'kit',
  'duo',
  'trio',
  'bundle',
  'spray',
  'wipes',
  'cloths',
  'bar',
];

export function modifierConflict(want: string, have: string): boolean {
  const a = tokens(want);
  const b = tokens(have);
  for (const m of VARIANT_MODIFIERS) {
    if (a.has(m) !== b.has(m)) return true;
  }
  return false;
}

export type Match = {
  sku: string;
  candidate: OfficialProduct | null;
  score: number;
  sizeAgreement: boolean | null;
  accepted: boolean;
  reason: string;
  runnerUp: { title: string; score: number } | null;
};

/**
 * Picks the best candidate for one product.
 *
 * Acceptance needs a strong absolute score AND a clear margin over the runner
 * up — sibling products in a range differ by one token ("Hair Food Banana" vs
 * "Hair Food Papaya"), so a narrow win means the evidence cannot tell them
 * apart and the product is left unresolved on purpose.
 */
export function bestMatch(
  sku: string,
  name: string,
  sizeLabel: string | null,
  candidates: OfficialProduct[],
  {
    minScore = 0.55,
    minMargin = 0.05,
    weights,
  }: {
    minScore?: number;
    minMargin?: number;
    weights?: Map<string, number>;
  } = {},
): Match {
  // A strength stated on our side is a hard filter, not a tiebreak: Retinol
  // 0.5% must never fall back to Retinol 1% just because nothing closer exists.
  const eligible = candidates.filter(
    (c) => !strengthConflict(name, `${matchText(c)} ${c.sizes.join(' ')}`),
  );

  const ranked = eligible
    .map((c) => ({ c, s: score(name, matchText(c), weights) }))
    .sort((x, y) => y.s - x.s);

  const top = ranked[0];
  const second = ranked[1];
  if (!top || top.s === 0) {
    const why =
      eligible.length === 0 && candidates.length > 0
        ? 'no candidate with matching strength'
        : 'no candidate';
    return {
      sku,
      candidate: null,
      score: 0,
      sizeAgreement: null,
      accepted: false,
      reason: why,
      runnerUp: null,
    };
  }

  const agreement = sizesAgree(sizeLabel, top.c.sizes);
  const margin = second ? top.s - second.s : 1;
  const runnerUp = second
    ? { title: second.c.title, score: round2(second.s) }
    : null;

  let accepted = true;
  let reason = 'accepted';
  if (top.s < minScore) {
    accepted = false;
    reason = `score ${round2(top.s)} < ${minScore}`;
  } else if (margin < minMargin) {
    accepted = false;
    reason = `ambiguous: margin ${round2(margin)} over "${second!.c.title}"`;
  }
  // A size mismatch downgrades to content-only rather than rejecting outright:
  // the 30ml and 50ml of one ampoule share copy and packaging photography.
  // The caller decides what to take; `sizeAgreement` records the caveat.

  return {
    sku,
    candidate: top.c,
    score: round2(top.s),
    sizeAgreement: agreement,
    accepted,
    reason,
    runnerUp,
  };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Matches a whole brand's products at once, giving each official product to at
 * most one of ours.
 *
 * Per-product matching cannot separate siblings in a range: "Hair Food Papaya",
 * "Hair Conditioner Papaya" and "Hair Food Shampoo Papaya" all score similarly
 * against every Papaya page, so each one individually looks ambiguous. Solved
 * together, the conditioner claims the conditioner page, the shampoo claims the
 * shampoo page, and the tub is left with the mask — which is the correct
 * answer and needs no per-product rule.
 *
 * Assignment is greedy on descending score. That is not guaranteed optimal,
 * but with a uniqueness constraint and a score floor it cannot produce the
 * failure that matters (two of our products sharing one source page), and it
 * stays deterministic and explainable.
 */
export function assignMatches(
  products: {
    sku: string;
    name: string;
    sizeLabel: string | null;
    lineKey: string;
  }[],
  candidates: OfficialProduct[],
  {
    minScore = 0.55,
    weights,
  }: { minScore?: number; weights?: Map<string, number> } = {},
): Map<string, Match> {
  const pool = dedupeCandidates(candidates);

  type Pair = { sku: string; ci: number; s: number };
  const pairs: Pair[] = [];
  for (const p of products) {
    for (const [ci, c] of pool.entries()) {
      if (strengthConflict(p.name, `${matchText(c)} ${c.sizes.join(' ')}`))
        continue;
      if (modifierConflict(p.name, c.title)) continue;
      const s = score(p.name, matchText(c), weights);
      if (s >= minScore) pairs.push({ sku: p.sku, ci, s });
    }
  }
  pairs.sort((a, b) => b.s - a.s);

  const takenSku = new Set<string>();
  /**
   * Which product line already claimed each candidate. Uniqueness is enforced
   * *across* product lines but not within one: a 30ml and a 50ml of the same
   * ampoule are two of our SKUs and one official page, and forcing the second
   * elsewhere is how "Capsule Ampoule 30ml" ends up pointing at "Capsule
   * Cream". Same line may share; a different line may not.
   */
  const candidateLine = new Map<number, string>();
  const result = new Map<string, Match>();

  for (const pair of pairs) {
    if (takenSku.has(pair.sku)) continue;
    const product = products.find((p) => p.sku === pair.sku)!;
    const claimedBy = candidateLine.get(pair.ci);
    if (claimedBy !== undefined && claimedBy !== product.lineKey) continue;

    takenSku.add(pair.sku);
    candidateLine.set(pair.ci, product.lineKey);
    const candidate = pool[pair.ci]!;
    result.set(pair.sku, {
      sku: pair.sku,
      candidate,
      score: round2(pair.s),
      sizeAgreement: sizesAgree(product.sizeLabel, candidate.sizes),
      accepted: true,
      reason: 'accepted',
      runnerUp: null,
    });
  }

  // Everything left over: report the reason that actually applied, so the
  // migration report says why a product is unresolved rather than quoting a
  // score belonging to a candidate a filter had already excluded.
  for (const p of products) {
    if (result.has(p.sku)) continue;

    let best: { c: OfficialProduct; s: number } | null = null;
    let bestEligible = 0;
    let sawStrengthConflict = false;
    let sawModifierConflict = false;

    for (const c of pool) {
      const s = score(p.name, matchText(c), weights);
      if (!best || s > best.s) best = { c, s };
      if (strengthConflict(p.name, `${matchText(c)} ${c.sizes.join(' ')}`)) {
        if (s >= minScore) sawStrengthConflict = true;
        continue;
      }
      if (modifierConflict(p.name, c.title)) {
        if (s >= minScore) sawModifierConflict = true;
        continue;
      }
      bestEligible = Math.max(bestEligible, s);
    }

    const claimed = pairs.some((x) => x.sku === p.sku);
    const reason =
      pool.length === 0
        ? 'no source harvested for brand'
        : claimed
          ? 'best candidate already claimed by a closer product'
          : sawModifierConflict
            ? `closest candidate "${best?.c.title}" is a different variant (tinted/kids/refill/set)`
            : sawStrengthConflict
              ? `closest candidate "${best?.c.title}" states a different strength`
              : `best eligible score ${round2(bestEligible)} < ${minScore}`;

    result.set(p.sku, {
      sku: p.sku,
      candidate: null,
      score: round2(bestEligible),
      sizeAgreement: null,
      accepted: false,
      reason,
      runnerUp: best ? { title: best.c.title, score: round2(best.s) } : null,
    });
  }

  return result;
}

/**
 * Collapses catalogue entries that are the same product reached by two URLs
 * (a category path and a canonical path, say). Keeps the richest copy.
 */
export function dedupeCandidates(
  candidates: OfficialProduct[],
): OfficialProduct[] {
  const byKey = new Map<string, OfficialProduct>();
  for (const c of candidates) {
    const key = [...tokens(`${c.vendor ?? ''} ${c.title}`)].sort().join('-');
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, c);
      continue;
    }
    const richer =
      (c.description?.length ?? 0) + c.images.length * 200 >
      (existing.description?.length ?? 0) + existing.images.length * 200;
    if (richer) byKey.set(key, c);
  }
  return [...byKey.values()];
}

/* ==========================================================================
   Source registry
   ========================================================================== */

export const SOURCES: Record<
  string,
  (refresh: boolean) => Promise<OfficialProduct[]>
> = {
  SKIN1004: (r) => harvestShopify('skin1004.com', r),
  COSRX: (r) => harvestShopify('www.cosrx.com', r),
  'The Ordinary': (r) =>
    harvestJsonLd(
      {
        host: 'theordinary.com',
        sitemap: {
          indexUrl: 'https://theordinary.com/sitemap_index.xml',
          keep: /\/en-us\/[a-z0-9-]+-\d+\.html$/,
        },
      },
      r,
    ),
  CeraVe: (r) =>
    harvestJsonLd(
      {
        host: 'www.cerave.com',
        sitemap: {
          indexUrl: 'https://www.cerave.com/sitemap.xml',
          keep: /cerave\.com\/skincare\/(?:[a-z-]+\/){1,3}[a-z0-9-]+$/,
        },
      },
      r,
    ),
  // L'Oréal brand sites publish JSON-LD Product on every product page, but the
  // title is range-level — the variant lives in the URL, which `matchText`
  // folds into the comparison.
  Garnier: (r) =>
    harvestJsonLd(
      {
        host: 'www.garnier.co.uk',
        sitemap: {
          indexUrl: 'https://www.garnier.co.uk/sitemap.xml',
          keep: /garnier\.co\.uk\/our-brands\/(?:[a-z0-9-]+\/){1,3}[a-z0-9-]+$/,
        },
      },
      r,
    ),
  Eucerin: (r) =>
    harvestJsonLd(
      {
        host: 'www.eucerin.co.uk',
        sitemap: {
          indexUrl: 'https://www.eucerin.co.uk/sitemap.xml',
          keep: /eucerin\.co\.uk\/products\/[a-z0-9-]+(?:\/[a-z0-9-]+)?$/,
        },
      },
      r,
    ),
  Purito: (r) =>
    harvestJsonLd(
      {
        host: 'purito.com',
        sitemap: {
          indexUrl: 'https://purito.com/sitemap.xml',
          keep: /purito\.com\/(?:product|products)\/[^/]+\/?$/,
        },
      },
      r,
    ),
};

/* ==========================================================================
   CLI
   ========================================================================== */

const invokedDirectly = process.argv[1]
  ?.replace(/\\/g, '/')
  .endsWith('official.ts');
if (invokedDirectly) {
  const refresh = process.argv.includes('--refresh');
  const only = process.argv
    .find((a) => a.startsWith('--source='))
    ?.split('=')[1];

  const all: Record<string, OfficialProduct[]> = {};
  for (const [name, harvest] of Object.entries(SOURCES)) {
    if (only && name !== only) continue;
    process.stdout.write(`harvesting ${name} ... `);
    try {
      const products = await harvest(refresh);
      all[name] = products;
      console.warn(`${products.length} products`);
    } catch (err) {
      console.warn(`FAILED: ${(err as Error).message}`);
      all[name] = [];
    }
  }

  const path = resolve(ARCHIVE, 'official-catalogue.json');
  const existing = existsSync(path)
    ? (JSON.parse(readFileSync(path, 'utf8')) as Record<
        string,
        OfficialProduct[]
      >)
    : {};
  writeFileSync(path, JSON.stringify({ ...existing, ...all }, null, 2));
  console.warn(`\nwrote ${path}`);
}
