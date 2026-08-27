/**
 * Deterministic extractor for `Nordic_Lux_Product_Catalogue.pdf`.
 *
 * The catalogue is a text PDF (Helvetica + ZapfDingbats, no embedded CID
 * fonts). Every stream is filtered `[ /ASCII85Decode /FlateDecode ]` for page
 * content and `[ /ASCII85Decode /DCTDecode ]` for product photography, so
 * node:zlib plus a small ASCII85 decoder reads all of it — no PDF dependency.
 *
 * It recovers three things:
 *   1. the tabular product data (name, SKU, price, stock, category, blurb),
 *   2. the embedded product JPEGs,
 *   3. the image -> product association, resolved through each page's
 *      /Resources /XObject dict and the `Do` draw order in its content stream
 *      (never by guessing from position).
 *
 * Output, all under ../archive/:
 *   pdf-raw-pages.json       per page: text lines + drawn image names
 *   pdf-products.json        structured product rows, verbatim from the PDF
 *   pdf-media/*.jpg          embedded product images
 *   pdf-media-manifest.json  image -> page / product SKU / sha256
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

const HERE = dirname(fileURLToPath(import.meta.url));
const ARCHIVE = resolve(HERE, '../archive');

export type PdfImage = {
  file: string;
  /** PDF object number of the image XObject — the stable identity. */
  object: number;
  xobjectName: string;
  page: number;
  /** Draw order of this image within its page. */
  order: number;
  width: number;
  height: number;
  bytes: number;
  sha256: string;
  /** SKU of the product card this image belongs to, once cards are matched. */
  sku: string | null;
};

export type PdfProduct = {
  page: number;
  /** 1-based position of the card within its page, in reading order. */
  index: number;
  /** Brand section heading the card appeared under. */
  brandSection: string | null;
  name: string;
  sku: string | null;
  category: string | null;
  /** Verbatim price text as printed, e.g. "$19.99". */
  priceText: string | null;
  stock: number | null;
  description: string | null;
  /** Number of filled stars printed by the ZapfDingbats rating run. */
  ratingStars: number | null;
  /** True when the card printed the literal "[ No Image ]" marker. */
  noImage: boolean;
  /** Image file recovered from the PDF for this card, if any. */
  image: string | null;
  /** Every text line of the card, verbatim, for audit. */
  raw: string[];
};

type PdfObject = { num: number; head: string; body: string };

function indexObjects(pdf: string): Map<number, PdfObject> {
  const objects = new Map<number, PdfObject>();
  const re = /(\d+) 0 obj([\s\S]*?)endobj/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(pdf))) {
    const body = m[2] ?? '';
    const streamAt = body.indexOf('stream');
    objects.set(Number(m[1]), {
      num: Number(m[1]),
      head: streamAt < 0 ? body : body.slice(0, streamAt),
      body,
    });
  }
  return objects;
}

function streamBytes(body: string): Buffer | null {
  const start = body.indexOf('stream');
  if (start < 0) return null;
  let from = start + 'stream'.length;
  if (body[from] === '\r') from++;
  if (body[from] === '\n') from++;
  const end = body.lastIndexOf('endstream');
  if (end < 0 || end <= from) return null;
  return Buffer.from(body.slice(from, end), 'latin1');
}

/** ASCII85 (`/ASCII85Decode`), including the `z` all-zero shorthand. */
export function ascii85Decode(input: string): Buffer {
  const body = input
    .replace(/^\s*<~/, '')
    .split('~>')[0]!
    .replace(/\s+/g, '');
  const out: number[] = [];
  let tuple = 0;
  let count = 0;
  for (const ch of body) {
    if (ch === 'z' && count === 0) {
      out.push(0, 0, 0, 0);
      continue;
    }
    const code = ch.charCodeAt(0) - 33;
    if (code < 0 || code > 84) continue;
    tuple = tuple * 85 + code;
    if (++count === 5) {
      out.push(
        (tuple >>> 24) & 0xff,
        (tuple >>> 16) & 0xff,
        (tuple >>> 8) & 0xff,
        tuple & 0xff,
      );
      tuple = 0;
      count = 0;
    }
  }
  if (count > 0) {
    for (let i = count; i < 5; i++) tuple = tuple * 85 + 84;
    const bytes = [
      (tuple >>> 24) & 0xff,
      (tuple >>> 16) & 0xff,
      (tuple >>> 8) & 0xff,
      tuple & 0xff,
    ];
    out.push(...bytes.slice(0, count - 1));
  }
  return Buffer.from(out);
}

/** Applies the object's `/Filter` chain. DCTDecode is left encoded — that is the JPEG. */
function decodeStream(head: string, bytes: Buffer): Buffer | null {
  let data = bytes;
  if (/ASCII85Decode/.test(head)) data = ascii85Decode(data.toString('latin1'));
  if (/FlateDecode/.test(head)) {
    try {
      data = zlib.inflateSync(data);
    } catch {
      return null;
    }
  }
  return data;
}

function dictInt(head: string, key: string): number | null {
  const m = head.match(new RegExp(`/${key}\\s+(\\d+)`));
  return m ? Number(m[1]) : null;
}

function unescapePdfString(s: string): string {
  return s.replace(/\\(n|r|t|b|f|\(|\)|\\|[0-7]{1,3})/g, (_, c: string) => {
    if (c === 'n') return '\n';
    if (c === 'r') return '\r';
    if (c === 't') return '\t';
    if (c === 'b') return '\b';
    if (c === 'f') return '\f';
    if (/^[0-7]+$/.test(c)) return String.fromCharCode(parseInt(c, 8));
    return c;
  });
}

/**
 * Show-text operators in draw order, grouped into visual lines. The generator
 * emits one positioned run per rendered line, so any positioning operator
 * (`Td`/`TD`/`T*`) or `BT`/`ET` closes the current line.
 */
export function contentStreamLines(content: string): string[] {
  const lines: string[] = [];
  let current = '';
  const flush = () => {
    if (current.trim()) lines.push(current.trim());
    current = '';
  };
  const token =
    /\((?:\\[\s\S]|[^\\)])*\)\s*Tj|\[((?:\\[\s\S]|[^\]])*)\]\s*TJ|T\*|-?[\d.]+\s+-?[\d.]+\s+T[dD]|ET|BT/g;
  let t: RegExpExecArray | null;
  while ((t = token.exec(content))) {
    const op = t[0];
    if (/Tj$/.test(op)) {
      current += unescapePdfString(
        op.slice(op.indexOf('(') + 1, op.lastIndexOf(')')),
      );
    } else if (/TJ$/.test(op)) {
      const parts = /\((?:\\[\s\S]|[^\\)])*\)/g;
      let p: RegExpExecArray | null;
      while ((p = parts.exec(t[1] ?? '')))
        current += unescapePdfString(p[0].slice(1, -1));
    } else {
      flush();
    }
  }
  flush();
  return lines;
}

/** XObject names in the order they are painted (`/FormXob.abc Do`). */
export function contentStreamImages(content: string): string[] {
  return [...content.matchAll(/\/([A-Za-z0-9_.]+)\s+Do\b/g)].map((m) => m[1]!);
}

/** Page objects in document order, following /Type /Pages /Kids. */
function pageOrder(objects: Map<number, PdfObject>): number[] {
  for (const obj of objects.values()) {
    if (!/\/Type\s*\/Pages/.test(obj.head)) continue;
    const kids = obj.head.match(/\/Kids\s*\[([\s\S]*?)\]/);
    if (kids)
      return [...kids[1]!.matchAll(/(\d+)\s+0\s+R/g)].map((m) => Number(m[1]));
  }
  return [...objects.keys()]
    .filter((n) => /\/Type\s*\/Page\b/.test(objects.get(n)!.head))
    .sort((a, b) => a - b);
}

export type RawPage = {
  page: number;
  lines: string[];
  images: { name: string; object: number }[];
};

export function readPages(pdfPath: string): {
  pages: RawPage[];
  objects: Map<number, PdfObject>;
} {
  const pdf = readFileSync(pdfPath).toString('latin1');
  const objects = indexObjects(pdf);
  const pages: RawPage[] = [];

  for (const [i, pageNum] of pageOrder(objects).entries()) {
    const page = objects.get(pageNum);
    if (!page) continue;

    // name -> image object number, from this page's /Resources /XObject dict
    const xobjects = new Map<string, number>();
    const xdict = page.head.match(/\/XObject\s*<<([\s\S]*?)>>/);
    if (xdict) {
      for (const m of xdict[1]!.matchAll(
        /\/([A-Za-z0-9_.]+)\s+(\d+)\s+0\s+R/g,
      )) {
        xobjects.set(m[1]!, Number(m[2]));
      }
    }

    const contentsRef = page.head.match(/\/Contents\s+(\d+)\s+0\s+R/);
    let lines: string[] = [];
    let drawn: string[] = [];
    if (contentsRef) {
      const stream = objects.get(Number(contentsRef[1]));
      const bytes = stream && streamBytes(stream.body);
      const decoded = stream && bytes ? decodeStream(stream.head, bytes) : null;
      if (decoded) {
        const content = decoded.toString('latin1');
        lines = contentStreamLines(content);
        drawn = contentStreamImages(content);
      }
    }

    pages.push({
      page: i + 1,
      lines,
      images: drawn
        .filter((n) => xobjects.has(n))
        .map((n) => ({ name: n, object: xobjects.get(n)! })),
    });
  }

  return { pages, objects };
}

/** Writes each drawn image out as a real JPEG and records provenance. */
export function extractImages(
  pages: RawPage[],
  objects: Map<number, PdfObject>,
  mediaDir: string,
): PdfImage[] {
  mkdirSync(mediaDir, { recursive: true });
  const images: PdfImage[] = [];
  for (const page of pages) {
    for (const [order, ref] of page.images.entries()) {
      const obj = objects.get(ref.object);
      const bytes = obj && streamBytes(obj.body);
      if (!obj || !bytes) continue;
      const jpeg = decodeStream(obj.head, bytes);
      if (!jpeg || jpeg.length === 0) continue;
      const file = `pdf-p${String(page.page).padStart(2, '0')}-${String(order + 1).padStart(2, '0')}.jpg`;
      writeFileSync(resolve(mediaDir, file), jpeg);
      images.push({
        file,
        object: ref.object,
        xobjectName: ref.name,
        page: page.page,
        order,
        width: dictInt(obj.head, 'Width') ?? 0,
        height: dictInt(obj.head, 'Height') ?? 0,
        bytes: jpeg.length,
        sha256: createHash('sha256').update(jpeg).digest('hex'),
        sku: null,
      });
    }
  }
  return images;
}

const NO_IMAGE = /^\[\s*No Image\s*\]$/i;
const SKU_LINE = /^SKU:\s*(\S+)/i;
const STOCK_IN_SKU_LINE = /Stock:\s*(\d+)/i;
const PRICE_LINE = /^\$\s*[\d,]+(?:\.\d+)?$/;
const RATING_LINE = /^Rating:/i;
/** Section heading: all-caps brand banner, never a data line. */
const BRAND_HEADING = /^[A-Z][A-Z0-9 &.'’()-]{2,}$/;

/**
 * Splits a page's text lines into product cards.
 *
 * Each card is emitted in a fixed reading order:
 *   [ No Image ]?  name lines...  $price  category  description lines...
 *   SKU: <sku> · Stock: <n> ·   Rating: <stars>
 * so the SKU line is a reliable card terminator and the price line is a
 * reliable name/description boundary.
 */
export function parsePageCards(
  page: RawPage,
  carriedBrand: string | null = null,
): PdfProduct[] {
  const cards: PdfProduct[] = [];
  let brandSection = carriedBrand;
  let buffer: string[] = [];
  let awaitingRating: PdfProduct | null = null;

  const isKnownStructural = (l: string) =>
    NO_IMAGE.test(l) ||
    SKU_LINE.test(l) ||
    PRICE_LINE.test(l) ||
    RATING_LINE.test(l);

  for (const line of page.lines) {
    // The Rating run is printed *after* the SKU line, so it closes the card
    // that just ended rather than opening the next one.
    if (awaitingRating) {
      if (RATING_LINE.test(line)) {
        awaitingRating.raw.push(line);
        awaitingRating.ratingStars = countStars(line);
        awaitingRating = null;
        continue;
      }
      awaitingRating = null;
    }
    // A brand banner only counts before a card has started collecting.
    if (
      buffer.length === 0 &&
      BRAND_HEADING.test(line) &&
      !isKnownStructural(line)
    ) {
      brandSection = line.trim();
      continue;
    }
    buffer.push(line);
    if (!SKU_LINE.test(line)) continue;

    const card = buildCard(page, cards.length + 1, brandSection, buffer);
    cards.push(card);
    awaitingRating = card;
    buffer = [];
  }
  return cards;
}

/** The brand banner in effect at the end of a page, for carry-over to the next. */
export function trailingBrand(
  cards: PdfProduct[],
  carriedBrand: string | null,
): string | null {
  return cards.length ? cards[cards.length - 1]!.brandSection : carriedBrand;
}

function countStars(ratingLine: string): number | null {
  // ZapfDingbats filled star (a-star) maps to 'H' in the generator's encoding.
  const stars = ratingLine.replace(/^Rating:\s*/i, '').trim();
  if (!stars) return null;
  const filled = (stars.match(/H/g) ?? []).length;
  return filled || null;
}

function buildCard(
  page: RawPage,
  index: number,
  brandSection: string | null,
  raw: string[],
): PdfProduct {
  const lines = [...raw];
  const noImage = lines.some((l) => NO_IMAGE.test(l));
  const body = lines.filter((l) => !NO_IMAGE.test(l));

  const priceAt = body.findIndex((l) => PRICE_LINE.test(l));
  const skuAt = body.findIndex((l) => SKU_LINE.test(l));

  const nameLines =
    priceAt > 0 ? body.slice(0, priceAt) : body.slice(0, Math.max(skuAt, 0));
  const priceText = priceAt >= 0 ? body[priceAt]!.trim() : null;
  const category =
    priceAt >= 0 && priceAt + 1 < body.length
      ? body[priceAt + 1]!.trim()
      : null;
  const descLines =
    priceAt >= 0 && skuAt > priceAt + 1 ? body.slice(priceAt + 2, skuAt) : [];

  const skuLine = (skuAt >= 0 ? body[skuAt] : '') ?? '';
  const sku = skuLine.match(SKU_LINE)?.[1] ?? null;
  const stock = skuLine.match(STOCK_IN_SKU_LINE)?.[1];

  return {
    page: page.page,
    index,
    brandSection,
    // PDF line wrapping is purely visual; join with single spaces.
    name: nameLines.join(' ').replace(/\s+/g, ' ').trim(),
    sku,
    category: category && !SKU_LINE.test(category) ? category : null,
    priceText,
    stock: stock === undefined ? null : Number(stock),
    description: descLines.length
      ? descLines.join(' ').replace(/\s+/g, ' ').trim()
      : null,
    ratingStars: null,
    noImage,
    image: null,
    raw,
  };
}

/**
 * Associates recovered images with cards. Within a page, images are painted in
 * the same reading order as the cards that own them, and cards that printed
 * "[ No Image ]" own none — so consuming the page's images in order across the
 * cards that did *not* print the marker is exact, not heuristic.
 */
export function attachImages(products: PdfProduct[], images: PdfImage[]): void {
  const byPage = new Map<number, PdfImage[]>();
  for (const img of images) {
    if (!byPage.has(img.page)) byPage.set(img.page, []);
    byPage.get(img.page)!.push(img);
  }
  for (const [pageNum, pageImages] of byPage) {
    const cards = products.filter((p) => p.page === pageNum && !p.noImage);
    const ordered = [...pageImages].sort((a, b) => a.order - b.order);
    // Only a 1:1 run can be trusted; anything else is left unassigned and reported.
    if (cards.length !== ordered.length) continue;
    for (const [i, card] of cards.entries()) {
      card.image = ordered[i]!.file;
      ordered[i]!.sku = card.sku;
    }
  }
}

export function extractCatalogue(pdfPath: string, mediaDir: string) {
  const { pages, objects } = readPages(pdfPath);
  const images = extractImages(pages, objects, mediaDir);
  // The brand banner is a running section header: it is printed once and then
  // applies until the next one, including across page breaks.
  const products: PdfProduct[] = [];
  let brand: string | null = null;
  for (const page of pages) {
    const cards = parsePageCards(page, brand);
    brand = trailingBrand(cards, brand);
    products.push(...cards);
  }
  attachImages(products, images);
  return { pages, images, products };
}

const invokedDirectly = process.argv[1]
  ?.replace(/\\/g, '/')
  .endsWith('pdf-extract.ts');
if (invokedDirectly) {
  const src =
    process.argv[2] ??
    resolve(ARCHIVE, 'source-pdf/Nordic_Lux_Product_Catalogue.pdf');
  const { pages, images, products } = extractCatalogue(
    src,
    resolve(ARCHIVE, 'pdf-media'),
  );

  writeFileSync(
    resolve(ARCHIVE, 'pdf-raw-pages.json'),
    JSON.stringify(pages, null, 2),
  );
  writeFileSync(
    resolve(ARCHIVE, 'pdf-products.json'),
    JSON.stringify(products, null, 2),
  );
  writeFileSync(
    resolve(ARCHIVE, 'pdf-media-manifest.json'),
    JSON.stringify(images, null, 2),
  );

  const withImage = products.filter((p) => p.image).length;
  const noImage = products.filter((p) => p.noImage).length;
  const skus = products.map((p) => p.sku).filter(Boolean) as string[];
  const dupes = skus.filter((s, i) => skus.indexOf(s) !== i);
  const prices = new Map<string, number>();
  for (const p of products)
    prices.set(
      p.priceText ?? 'none',
      (prices.get(p.priceText ?? 'none') ?? 0) + 1,
    );

  console.warn(`pages:            ${pages.length}`);
  console.warn(`products parsed:  ${products.length}`);
  console.warn(
    `images extracted: ${images.length}  (attached to card: ${images.filter((i) => i.sku).length})`,
  );
  console.warn(`cards with image: ${withImage}`);
  console.warn(`cards "[No Image]": ${noImage}`);
  console.warn(
    `unique SKUs:      ${new Set(skus).size}  duplicates: ${[...new Set(dupes)].join(', ') || 'none'}`,
  );
  console.warn(
    `brand sections:   ${[...new Set(products.map((p) => p.brandSection))].join(' | ')}`,
  );
  console.warn(
    `price histogram:  ${[...prices].map(([k, v]) => `${k}×${v}`).join('  ')}`,
  );
}
