// Default seed categories for Nordic Lux
// These are shown on the homepage "Shop by Category" section

function makeId(slug: string): string {
  return `cat-${slug}`;
}

const now = new Date().toISOString();

export const SEED_CATEGORIES = [
  {
    id: makeId('serums'),
    name: 'Serums',
    slug: 'serums',
    description: 'Targeted serums for every skin concern — hydration, brightening, anti-aging and more.',
    image: 'https://theordinary.com/dw/image/v2/BFKJ_PRD/on/demandware.static/-/Sites-deciem-master/default/dw2a8a9c9a/Images/products/The%20Ordinary/rdn-niacinamide-10pct-zinc-1pct-30ml.png?sw=800&sh=800&sm=fit',
    count: 0,
    createdAt: now,
  },
  {
    id: makeId('moisturizers'),
    name: 'Moisturizers',
    slug: 'moisturizers',
    description: 'Rich creams and lightweight lotions to keep your skin hydrated all day.',
    image: 'https://www.cerave.com/-/media/project/loreal/brand-sites/cerave/americas/us/products/moisturizing-cream/moisturizing-cream_front.jpg?rev=a5e3e3e3&w=900',
    count: 0,
    createdAt: now,
  },
  {
    id: makeId('cleansers'),
    name: 'Cleansers',
    slug: 'cleansers',
    description: 'Gentle and effective cleansers for all skin types.',
    image: 'https://www.cerave.com/-/media/project/loreal/brand-sites/cerave/americas/us/products/hydrating-facial-cleanser/hydrating-facial-cleanser_front.jpg?rev=c6e3e3e3&w=900',
    count: 0,
    createdAt: now,
  },
  {
    id: makeId('treatments'),
    name: 'Treatments',
    slug: 'treatments',
    description: 'Targeted treatments for acne, dark spots, and skin texture.',
    image: 'https://theordinary.com/dw/image/v2/BFKJ_PRD/on/demandware.static/-/Sites-deciem-master/default/dw3f4a5b6c/Images/products/The%20Ordinary/rdn-aha-30pct-bha-2pct-peeling-solution-30ml.png?sw=800&sh=800&sm=fit',
    count: 0,
    createdAt: now,
  },
  {
    id: makeId('sunscreen'),
    name: 'Sunscreen',
    slug: 'sunscreen',
    description: 'Daily sun protection with lightweight, non-greasy formulas.',
    image: 'https://theordinary.com/dw/image/v2/BFKJ_PRD/on/demandware.static/-/Sites-deciem-master/default/dw7d8e9f0a/Images/products/The%20Ordinary/rdn-uv-filters-spf-45-serum-30ml.png?sw=800&sh=800&sm=fit',
    count: 0,
    createdAt: now,
  },
  {
    id: makeId('eye-care'),
    name: 'Eye Care',
    slug: 'eye-care',
    description: 'Specialized formulas for the delicate eye area.',
    image: 'https://theordinary.com/dw/image/v2/BFKJ_PRD/on/demandware.static/-/Sites-deciem-master/default/dw5b6c7d8e/Images/products/The%20Ordinary/rdn-multi-peptide-eye-serum-15ml.png?sw=800&sh=800&sm=fit',
    count: 0,
    createdAt: now,
  },
];
