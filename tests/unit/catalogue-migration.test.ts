import { describe, expect, it } from 'vitest';

import {
  ascii85Decode,
  contentStreamLines,
  parsePageCards,
  trailingBrand,
} from '@/../migration/legacy-nordic-lux/scripts/pdf-extract';
import {
  brandKey,
  cleanName,
  identityKey,
  parseSize,
  productLineKey,
  resolveBrand,
  resolveCategory,
  stripLeadingBrand,
} from '@/../migration/legacy-nordic-lux/scripts/canonical';
import {
  modifierConflict,
  score,
  sizeToMl,
  sizesAgree,
  strengthConflict,
  strengthMarkers,
  tokens,
} from '@/../migration/legacy-nordic-lux/scripts/official';
import {
  slugify,
  toCompleteSentences,
} from '@/../migration/legacy-nordic-lux/scripts/plan';

/* ==========================================================================
   PDF parser
   ========================================================================== */

describe('PDF decoding', () => {
  it('decodes ASCII85 including the z shorthand', () => {
    // Canonical ASCII85 fixture: this encodes "Hello World!".
    expect(ascii85Decode('87cURD]i,"Ebo80~>').toString()).toBe('Hello World!');
    expect(ascii85Decode('z~>')).toEqual(Buffer.from([0, 0, 0, 0]));
  });

  it('groups show-text operators into visual lines', () => {
    const stream =
      'BT /F1 12 Tf 72 800 Td (CERAVE) Tj 0 -14 Td [(Eye Repair )-2(Cream)] TJ ET';
    expect(contentStreamLines(stream)).toEqual(['CERAVE', 'Eye Repair Cream']);
  });
});

describe('product card parsing', () => {
  const page = {
    page: 4,
    images: [],
    lines: [
      'CERAVE',
      '[ No Image ]',
      'CeraVe Eye Repair',
      'Cream 14ML',
      '$19.99',
      'Skin Care',
      'Minimises dark circles.',
      'SKU: SK80CT0134 · Stock: 3 ·',
      'Rating: HHHHH',
      'CeraVe Foaming Cleanser',
      '$19.99',
      'Skin Care',
      'SKU: SK80CT0130 · Stock: 1 ·',
      'Rating: HHHHH',
    ],
  };

  const cards = parsePageCards(page);

  it('splits a page into one card per SKU', () => {
    expect(cards).toHaveLength(2);
    expect(cards.map((c) => c.sku)).toEqual(['SK80CT0134', 'SK80CT0130']);
  });

  it('joins wrapped name lines without swallowing the price or category', () => {
    expect(cards[0]!.name).toBe('CeraVe Eye Repair Cream 14ML');
    expect(cards[0]!.priceText).toBe('$19.99');
    expect(cards[0]!.category).toBe('Skin Care');
    expect(cards[0]!.description).toBe('Minimises dark circles.');
  });

  it('reads stock and the no-image marker', () => {
    expect(cards[0]!.stock).toBe(3);
    expect(cards[0]!.noImage).toBe(true);
    expect(cards[1]!.stock).toBe(1);
  });

  it('attaches the rating run to the card it follows, not the next one', () => {
    // Regression: the Rating line is printed after the SKU line, and used to
    // leak into the following product's name.
    expect(cards[0]!.ratingStars).toBe(5);
    expect(cards[1]!.name).toBe('CeraVe Foaming Cleanser');
    expect(cards[1]!.name).not.toMatch(/Rating/);
  });

  it('carries the brand banner across a page break', () => {
    expect(cards.every((c) => c.brandSection === 'CERAVE')).toBe(true);
    const next = parsePageCards(
      { page: 5, images: [], lines: page.lines.slice(1) },
      trailingBrand(cards, null),
    );
    expect(next[0]!.brandSection).toBe('CERAVE');
  });
});

/* ==========================================================================
   Brand normalisation
   ========================================================================== */

describe('brand normalisation', () => {
  it('folds casing and punctuation to one key', () => {
    const keys = ['LA ROCHE POSAY', 'La Roche Posay', 'La Roche-Posay'].map(
      brandKey,
    );
    expect(new Set(keys).size).toBe(1);
  });

  it('resolves the brand from the product name over the section banner', () => {
    // The PDF files this SKIN1004 product under an "ORDINARY" banner.
    expect(
      resolveBrand(
        'SKIN1004 Madagascar Centella Poremizing Fresh Ampoule',
        'ORDINARY',
      ),
    ).toBe('SKIN1004');
    expect(
      resolveBrand('The Ordinary Niacinamide 10% + Zinc 1%', 'ORDINARY'),
    ).toBe('The Ordinary');
  });

  it('maps both Centella banners to SKIN1004 and OTHER to Purito', () => {
    expect(resolveBrand('Unbranded thing', 'MADAGASCAR CENTELLA')).toBe(
      'SKIN1004',
    );
    expect(resolveBrand('Unbranded thing', 'CENTELLA')).toBe('SKIN1004');
    expect(resolveBrand('Unbranded thing', 'OTHER')).toBe('Purito');
  });

  it('never repeats the brand in the name', () => {
    expect(cleanName('CeraVe Foaming Cleanser', 'CeraVe')).toBe(
      'CeraVe Foaming Cleanser',
    );
    expect(cleanName('Foaming Cleanser', 'CeraVe')).toBe(
      'CeraVe Foaming Cleanser',
    );
  });

  it('keeps a product line that looks like a brand alias', () => {
    // "Madagascar Centella" is SKIN1004's range, not a second brand name.
    expect(
      stripLeadingBrand('Madagascar Centella Ampoule Foam', 'SKIN1004'),
    ).toBe('Madagascar Centella Ampoule Foam');
  });
});

/* ==========================================================================
   Name cleaning
   ========================================================================== */

describe('name cleaning', () => {
  it('strips batch and expiry text from the permanent title', () => {
    expect(
      cleanName('CeraVe Moisturizing Cream 177ml 6oz Exp 10/2026', 'CeraVe'),
    ).toBe('CeraVe Moisturizing Cream');
    expect(
      cleanName(
        'La Roche Posay Anthelios Fluid SPF50 50ml EXP 01/27',
        'La Roche-Posay',
      ),
    ).toBe('La Roche-Posay Anthelios Fluid SPF50');
    expect(
      cleanName('The Ordinary Vitamin C 30 ML SEALED NIB', 'The Ordinary'),
    ).not.toMatch(/sealed|nib/i);
    expect(
      cleanName(
        'Madagascar Centella Cream 30ml Brand New Exp 07/2027',
        'SKIN1004',
      ),
    ).not.toMatch(/brand new/i);
  });

  it('cuts the keyword tail at the pack size', () => {
    expect(
      cleanName(
        'Madagascar Centella Ampoule Foam 4.22 fl.oz, 125ml, Low pH Foam Cleanser, Natural Soda Powder',
        'SKIN1004',
      ),
    ).toBe('SKIN1004 Madagascar Centella Ampoule Foam');
  });

  it('keeps strength markers, which are not pack sizes', () => {
    expect(
      cleanName(
        'Anthelios UVMune 400 Invisible Fluid SPF50 50ml',
        'La Roche-Posay',
      ),
    ).toBe('La Roche-Posay Anthelios UVMune 400 Invisible Fluid SPF50');
  });

  it('title-cases a shouted listing', () => {
    expect(
      cleanName(
        'THE ORDINARY VITAMIN C SUSPENSION 23% + HA SPHERES 2%',
        'The Ordinary',
      ),
    ).toBe('The Ordinary Vitamin C Suspension 23% + HA Spheres 2%');
  });

  it('corrects source typos where the product is unambiguous', () => {
    expect(cleanName('Cetaphil - Moistursing Cream', 'Cetaphil')).toContain(
      'Moisturising',
    );
    expect(cleanName('Garnier Hari Food Aloevera', 'Garnier')).toBe(
      'Garnier Hair Food Aloe Vera',
    );
    expect(
      cleanName(
        'Madagaskar Centella Tea - Trica Relife Ampoule 30ml',
        'SKIN1004',
      ),
    ).toBe('SKIN1004 Madagascar Centella Tea-Trica Relief Ampoule');
  });

  it('leaves no dangling bracket or trailing comma', () => {
    const name = cleanName(
      'Purito Wonder Releaf Centella Daily Sun Lotion SPF50 (60ml)',
      'Purito',
    );
    expect(name).toBe('Purito Wonder Releaf Centella Daily Sun Lotion SPF50');
    expect(name).not.toMatch(/[([{,\s]$/);
  });
});

/* ==========================================================================
   Size parsing
   ========================================================================== */

describe('size parsing', () => {
  it('prefers an explicit metric size', () => {
    expect(parseSize('Ampoule Foam 4.22 fl.oz, 125ml')).toEqual({
      label: '125ml',
      volumeMl: 125,
    });
    expect(parseSize('Eye Repair Cream 14ML')).toEqual({
      label: '14ml',
      volumeMl: 14,
    });
  });

  it('converts fl oz only when no metric size is printed', () => {
    expect(parseSize('First Ampoule 1.69 fl. oz.')).toEqual({
      label: '1.69 fl oz',
      volumeMl: 50,
    });
  });

  it('returns nothing when no size is printed', () => {
    expect(parseSize('CeraVe Moisturizing Face Cream')).toEqual({
      label: null,
      volumeMl: null,
    });
  });

  it('compares sizes by volume, so 1 fl oz matches 30ml', () => {
    expect(sizeToMl('1.69 fl oz')).toBeCloseTo(50, 0);
    expect(sizesAgree('1 fl oz', ['30ml', '100ml'])).toBe(true);
    expect(sizesAgree('30ml', ['100ml', '240ml'])).toBe(false);
    expect(sizesAgree(null, ['30ml'])).toBeNull();
  });
});

/* ==========================================================================
   Category mapping
   ========================================================================== */

describe('category mapping', () => {
  it('reads the shelf from the product identity, not the PDF label', () => {
    expect(resolveCategory('Garnier Hair Food Shampoo Banana')).toBe(
      'Hair Care',
    );
    expect(resolveCategory('CeraVe Hydrating Cleanser Face Wash')).toBe(
      'Cleansers',
    );
    expect(
      resolveCategory('La Roche-Posay Anthelios UVMune 400 Fluid SPF50'),
    ).toBe('Sunscreen');
    expect(
      resolveCategory('The Ordinary Glycolic Acid 7% Exfoliating Toner'),
    ).toBe('Toners');
    expect(resolveCategory('CeraVe Eye Repair Cream')).toBe('Eye Care');
    expect(
      resolveCategory('The Ordinary Squalane + Amino Acids Lip Balm'),
    ).toBe('Lip Care');
  });

  it('files a bare active-plus-strength name as a serum', () => {
    // The Ordinary names most of its range with no format word at all.
    expect(resolveCategory('The Ordinary Niacinamide 10% + Zinc 1%')).toBe(
      'Serums',
    );
    expect(resolveCategory('The Ordinary Retinol 0.5% in Squalane')).toBe(
      'Serums',
    );
  });
});

/* ==========================================================================
   Deduplication keys
   ========================================================================== */

describe('duplicate detection', () => {
  it('treats reordered wording as the same identity', () => {
    const a = identityKey(
      'CeraVe',
      'CeraVe AM Facial Moisturising Lotion SPF 50',
      { label: '52ml', volumeMl: 52 },
    );
    const b = identityKey(
      'CeraVe',
      'CeraVe Facial Moisturising Lotion Am Spf50',
      { label: '52ml', volumeMl: 52 },
    );
    expect(a).toBe(b);
  });

  it('keeps different pack sizes distinct', () => {
    const small = identityKey('SKIN1004', 'Tone Brightening Capsule Ampoule', {
      label: '30ml',
      volumeMl: 30,
    });
    const large = identityKey('SKIN1004', 'Tone Brightening Capsule Ampoule', {
      label: '50ml',
      volumeMl: 50,
    });
    expect(small).not.toBe(large);
  });

  it('groups pack sizes of one product under a single line key', () => {
    // This is what lets a 30ml and a 50ml share one official source page.
    expect(
      productLineKey('SKIN1004', 'Tone Brightening Capsule Ampoule 30ml'),
    ).toBe(
      productLineKey('SKIN1004', 'Tone Brightening Capsule Ampoule (50ml)'),
    );
  });
});

/* ==========================================================================
   Official-source matching safety
   ========================================================================== */

describe('official source matching', () => {
  it('expands ingredient abbreviations before comparing', () => {
    expect(tokens('Natural Moisturizing Factors + HA')).toEqual(
      tokens('Natural Moisturizing Factors + Hyaluronic Acid'),
    );
  });

  it('scores an exact title higher than a sibling product', () => {
    const exact = score(
      'The Ordinary Lactic Acid 5% + Hyaluronic Acid 2%',
      'The Ordinary Lactic Acid 5% + HA',
    );
    const sibling = score(
      'The Ordinary Lactic Acid 5% + Hyaluronic Acid 2%',
      'The Ordinary Lactic Acid 10% + HA',
    );
    expect(exact).toBeGreaterThan(sibling);
  });

  it('reads strength markers', () => {
    expect(strengthMarkers('Retinol 0.5% in Squalane')).toEqual(
      new Set(['0.5%']),
    );
    expect(strengthMarkers('Anthelios SPF50')).toEqual(new Set(['spf50']));
  });

  it('rejects a different concentration of the same active', () => {
    // Retinol 0.5% must never fall back to Retinol 1%.
    expect(
      strengthConflict('Retinol 0.5% in Squalane', 'Retinol 1% in Squalane'),
    ).toBe(true);
    expect(strengthConflict('Anthelios SPF50', 'Anthelios SPF30')).toBe(true);
  });

  it('tolerates a brand abbreviating its own title', () => {
    // "Lactic Acid 5% + HA" omits the 2%; absence is not disagreement.
    expect(
      strengthConflict(
        'Lactic Acid 5% + Hyaluronic Acid 2%',
        'Lactic Acid 5% + HA',
      ),
    ).toBe(false);
    expect(strengthConflict('Squalane Cleanser', 'Squalane Cleanser')).toBe(
      false,
    );
  });

  it('rejects a different pack variant of the same line', () => {
    // The tinted fluid is a different product from the clear one.
    expect(
      modifierConflict(
        'Anthelios UVMune 400 Invisible Fluid SPF50',
        'Anthelios UVMune 400 Invisible Tinted Fluid SPF50',
      ),
    ).toBe(true);
    expect(
      modifierConflict(
        'CeraVe Moisturizing Cream',
        'CeraVe Baby Moisturizing Cream',
      ),
    ).toBe(true);
    expect(
      modifierConflict(
        'CeraVe Moisturizing Cream',
        'CeraVe Moisturising Cream',
      ),
    ).toBe(false);
  });
});

/* ==========================================================================
   Plan
   ========================================================================== */

describe('plan', () => {
  it('never leaves a description cut mid-word', () => {
    const cut =
      'CeraVe AM Facial Moisturising Lotion SPF50 is a daily lightweight moisturiser. It leaves sk';
    expect(toCompleteSentences(cut)).toBe(
      'CeraVe AM Facial Moisturising Lotion SPF50 is a daily lightweight moisturiser.',
    );
  });

  it('returns nothing rather than a fragment', () => {
    expect(toCompleteSentences('and leave sk')).toBeNull();
    expect(toCompleteSentences('')).toBeNull();
  });

  it('builds URL-safe slugs from names with symbols', () => {
    expect(slugify('The Ordinary Niacinamide 10% + Zinc 1%')).toBe(
      'the-ordinary-niacinamide-10-percent-plus-zinc-1-percent',
    );
    expect(slugify('CeraVe Blemish Control Gel with AHA & BHA')).toBe(
      'cerave-blemish-control-gel-with-aha-and-bha',
    );
    expect(slugify('  Spaced   Out  ')).toBe('spaced-out');
  });
});
