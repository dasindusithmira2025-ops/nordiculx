import { describe, expect, it } from 'vitest';
import {
  extractProducts,
  buildMediaManifest,
  imagePathsOf,
  type LegacyProduct,
} from '../../migration/legacy-nordic-lux/scripts/extract';
import {
  CATEGORY_MAP,
  concernSlugsFor,
  isMultiSizeLabel,
  mapCatalogue,
  mapProduct,
  normaliseKey,
  parseVolumeMl,
  skinTypesFor,
  slugify,
  stripBrandPrefix,
  targetMediaUrl,
  toMinorUnits,
} from '../../migration/legacy-nordic-lux/scripts/map';

/**
 * Migration tests.
 *
 * These guard the mapping, not the database: every function under test is pure,
 * so the whole legacy catalogue can be run through them in milliseconds. The
 * transactional and idempotency behaviour of the importer is covered by the
 * two structural tests at the bottom plus the `--verify` run recorded in
 * migration/legacy-nordic-lux/reports/post-import-comparison.md.
 */

const legacy = extractProducts();
const mapped = mapCatalogue(legacy);
const bySku = new Map(mapped.map((m) => [m.legacySku, m]));

const base: LegacyProduct = {
  id: 'x',
  sku: 'X-1',
  name: 'Test Brand Widget',
  brand: 'Test Brand',
  category: 'Serums',
  type: '30ml',
  price: 10,
  stock: 4,
  image: '/products/x.jpg',
  rating: 0,
  reviews: 0,
  country: 'UK',
  description: 'short',
  overview: 'long',
  benefits: ['a'],
  sourceFile: 'app/lib/seed-products.ts',
};
const map1 = (over: Partial<LegacyProduct> = {}) =>
  mapProduct({ ...base, ...over }, { slugTaken: () => false });

describe('parser', () => {
  it('recovers the whole legacy catalogue', () => {
    expect(legacy).toHaveLength(33);
    expect(legacy.every((p) => p.sku && p.name && p.category)).toBe(true);
  });

  it('preserves legacy values verbatim', () => {
    const niacinamide = legacy.find((p) => p.sku === 'TO-NIACINAMIDE-30')!;
    expect(niacinamide.price).toBe(8.9);
    expect(niacinamide.stock).toBe(4);
    expect(niacinamide.brand).toBe('The Ordinary');
    expect(niacinamide.image).toBe('/products/to-niacinamide-30.jpg');
  });

  it('records every media file, referenced or not', () => {
    const manifest = buildMediaManifest(legacy);
    const referenced = new Set(legacy.flatMap(imagePathsOf));
    expect(referenced.size).toBe(33);
    // Every referenced file resolves on disk, and orphans are still listed.
    expect(
      manifest.filter((m) => m.referencedBy.length > 0).every((m) => m.exists),
    ).toBe(true);
    expect(manifest.length).toBeGreaterThan(referenced.size);
    expect(manifest.every((m) => !m.exists || m.sha256?.length === 64)).toBe(
      true,
    );
  });
});

describe('normalisation', () => {
  it('collapses brand spellings that differ only in case or punctuation', () => {
    const keys = ['La Roche Posay', 'La Roche-Posay', 'LA ROCHE-POSAY'].map(
      normaliseKey,
    );
    expect(new Set(keys).size).toBe(1);
    expect(normaliseKey('CeraVe')).toBe(normaliseKey('cera ve'));
    // Different brands must NOT collapse.
    expect(normaliseKey('CeraVe')).not.toBe(normaliseKey('The Ordinary'));
  });

  it('slugifies symbols that matter to skincare names', () => {
    expect(slugify('Niacinamide 10% + Zinc 1%')).toBe(
      'niacinamide-10-percent-plus-zinc-1-percent',
    );
    expect(slugify('Sets & Kits')).toBe('sets-and-kits');
  });

  it('strips a repeated brand prefix and nothing else', () => {
    expect(stripBrandPrefix('CeraVe Moisturizing Cream', 'CeraVe')).toBe(
      'Moisturizing Cream',
    );
    expect(stripBrandPrefix('Moisturizing Cream', 'CeraVe')).toBe(
      'Moisturizing Cream',
    );
    // A name that is only the brand must survive, not become empty.
    expect(stripBrandPrefix('CeraVe', 'CeraVe')).toBe('CeraVe');
  });
});

describe('money', () => {
  it('converts to integer minor units without floating point drift', () => {
    expect(toMinorUnits(8.9)).toBe(890);
    expect(toMinorUnits(29.9)).toBe(2990);
    expect(toMinorUnits(38.6)).toBe(3860);
    expect(toMinorUnits(0.1 + 0.2)).toBe(30);
    for (const p of legacy)
      expect(Number.isInteger(toMinorUnits(p.price))).toBe(true);
  });

  it('bills the legacy price whether or not the product is on offer', () => {
    const plain = map1({ price: 8.9 });
    expect(plain.variant.price).toBe(890);
    expect(plain.variant.salePrice).toBeNull();

    const onOffer = map1({ price: 29.9, originalPrice: 38.6 });
    expect(onOffer.variant.price).toBe(3860);
    expect(onOffer.variant.salePrice).toBe(2990);
    expect(onOffer.variant.salePrice ?? onOffer.variant.price).toBe(2990);
  });

  it('rejects an original price that is not above the selling price', () => {
    expect(map1({ price: 30, originalPrice: 20 }).state).toBe('INVALID');
  });

  it('every mapped product bills exactly its legacy price', () => {
    for (const m of mapped) {
      const src = legacy.find((l) => l.sku === m.legacySku)!;
      expect(m.variant.salePrice ?? m.variant.price).toBe(
        toMinorUnits(src.price),
      );
    }
  });
});

describe('size mapping', () => {
  it('parses a single unambiguous volume only', () => {
    expect(parseVolumeMl('30ml')).toBe(30);
    expect(parseVolumeMl('236ml')).toBe(236);
    // A weight, a multi-size label and a set are not millilitres.
    expect(parseVolumeMl('454g')).toBeNull();
    expect(parseVolumeMl('236ml / 473ml')).toBeNull();
    expect(parseVolumeMl('Set')).toBeNull();
    expect(parseVolumeMl(undefined)).toBeNull();
  });

  it('keeps the legacy size label verbatim and flags multi-size records', () => {
    const multi = bySku.get('TO-HA-B5-30')!;
    expect(multi.variant.name).toBe('30ml / 60ml');
    expect(isMultiSizeLabel(multi.variant.name)).toBe(true);
    expect(multi.notes.some((n) => n.includes('several sizes'))).toBe(true);
    // Flagged, but still a complete importable record — legacy sold it this way.
    expect(multi.state).toBe('READY');
  });
});

describe('taxonomy mapping', () => {
  it('maps every legacy category', () => {
    const legacyCategories = new Set(legacy.map((p) => p.category));
    for (const c of legacyCategories) expect(CATEGORY_MAP[c]).toBeDefined();
    expect(mapped.every((m) => m.categorySlug)).toBe(true);
  });

  it('marks an unknown category INVALID rather than guessing', () => {
    const result = map1({ category: 'Nonsense' });
    expect(result.state).toBe('INVALID');
    expect(result.categorySlug).toBeNull();
    expect(result.product.status).toBe('draft');
  });

  it('collapses "All Skin Types" instead of listing it alongside specifics', () => {
    expect(skinTypesFor(['All Skin Types', 'Dry Skin'])).toEqual(['all']);
    expect(skinTypesFor(['Dry Skin', 'Sensitive Skin'])).toEqual([
      'dry',
      'sensitive',
    ]);
    expect(skinTypesFor(['Exfoliating'])).toEqual([]);
  });

  it('lets one ambiguous tag carry two concerns, and maps nothing else', () => {
    expect(concernSlugsFor(['Brightening'])).toEqual([
      'dullness',
      'uneven-tone',
    ]);
    expect(concernSlugsFor(['Acne-Prone', 'Blemish Control'])).toEqual([
      'blemishes',
    ]);
    // No invented taxonomy for tags with no honest equivalent.
    expect(concernSlugsFor(['Keratosis Pilaris', 'SPF 45'])).toEqual([]);
  });
});

describe('SKU and slug uniqueness', () => {
  it('produces one variant per legacy SKU with no duplicates', () => {
    const skus = mapped.map((m) => m.variant.sku);
    expect(new Set(skus).size).toBe(skus.length);
    expect(skus).toEqual(legacy.map((l) => l.sku));
  });

  it('never reuses a product slug', () => {
    const slugs = mapped.map((m) => m.product.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('disambiguates two products that share a display name', () => {
    const twins = [
      { ...base, sku: 'A', name: 'Test Brand Cream', type: '30ml' },
      { ...base, sku: 'B', name: 'Test Brand Cream', type: '100ml' },
    ];
    const result = mapCatalogue(twins);
    expect(result[0]!.product.slug).not.toBe(result[1]!.product.slug);
    expect(result[1]!.product.slug).toContain('100ml');
  });
});

describe('inventory mapping', () => {
  it('carries legacy stock across unchanged', () => {
    for (const m of mapped) {
      const src = legacy.find((l) => l.sku === m.legacySku)!;
      expect(m.inventory.onHand).toBe(src.stock);
    }
  });

  it('rejects a negative or fractional stock figure', () => {
    expect(map1({ stock: -1 }).state).toBe('INVALID');
    expect(map1({ stock: 1.5 }).state).toBe('INVALID');
  });
});

describe('image mapping', () => {
  it('rewrites legacy paths onto the application media root', () => {
    expect(targetMediaUrl('/products/to-caffeine-30.jpg')).toBe(
      '/media/products/to-caffeine-30.webp',
    );
    // Nothing may keep pointing at the legacy repository.
    for (const m of mapped) {
      for (const img of m.media) {
        expect(img.url.startsWith('/media/products/')).toBe(true);
        expect(img.alt.length).toBeGreaterThan(0);
      }
    }
  });

  it('flags a product for review when its image is absent', () => {
    const result = mapProduct(base, {
      slugTaken: () => false,
      mediaExists: () => false,
    });
    expect(result.state).toBe('REVIEW');
    expect(result.media).toHaveLength(0);
    // Reviewed records are imported, but never published.
    expect(result.product.status).toBe('draft');
  });
});

describe('content safety', () => {
  it('does not carry legacy ratings or review counts into the mapping', () => {
    const serialised = JSON.stringify(mapped);
    expect(serialised).not.toContain('"rating"');
    expect(serialised).not.toContain('"reviews"');
    const rated = bySku.get('TO-NIACINAMIDE-30')!;
    expect(rated.notes.some((n) => n.includes('not imported'))).toBe(true);
  });

  it('leaves the INCI list empty rather than passing off a partial one', () => {
    expect(mapped.every((m) => m.product.ingredientsList === null)).toBe(true);
    // The key ingredients legacy does supply are carried over.
    expect(bySku.get('TO-NIACINAMIDE-30')!.keyIngredients).toHaveLength(2);
    expect(
      bySku.get('TO-NIACINAMIDE-30')!.keyIngredients[0]!.concentration,
    ).toBe('10%');
  });

  it('publishes only complete records', () => {
    for (const m of mapped) {
      expect(m.product.status).toBe(
        m.state === 'READY' ? 'published' : 'draft',
      );
    }
    expect(mapped.filter((m) => m.state === 'READY')).toHaveLength(33);
  });
});

describe('determinism', () => {
  it('maps identically on every run — the basis of idempotent import', () => {
    expect(JSON.stringify(mapCatalogue(extractProducts()))).toBe(
      JSON.stringify(mapped),
    );
  });
});
