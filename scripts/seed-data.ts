import type { RoutineStep, SkinType } from '@/lib/db/schema';

/**
 * DEMONSTRATION CATALOGUE.
 *
 * Every brand, product, price, review and article below is FICTIONAL sample
 * content created to exercise the application. None of it represents real
 * Nordic Lux inventory, real stockist relationships, or approved marketing
 * copy, and no claim here has been reviewed by anyone.
 *
 * Rules this data follows (docs/PRODUCT.md § Content safety):
 *   - no medical or curative claims ("treats acne", "repairs damage")
 *   - no authenticity or guarantee wording
 *   - no invented testimonials attributed to real people
 *   - benefits are written as cosmetic experience, not efficacy
 *
 * Real catalogue, photography and copy are client-supplied production inputs.
 */

export const DEMO_NOTICE =
  'Sample catalogue for development. Not real Nordic Lux inventory.';

/* --- brands --------------------------------------------------------------- */

/**
 * How each demo brand's wordmark is set — see `generateBrandLogos` in
 * scripts/generate-media.ts. These brands are fictional, so the mark is drawn
 * rather than held; a real brand's logo is only ever its own published file.
 */
export const brands = [
  {
    slug: 'halvor-atelier',
    logo: { tracking: 0.02 },
    name: 'Halvør Atelier',
    tagline: 'Considered formulation, Oslo',
    originCountry: 'Norway',
    featured: true,
    description:
      'A small Oslo studio working in short ingredient lists and unhurried textures.',
    story:
      'Halvør Atelier began in a converted printworks near Akerselva, where its founders spent two winters refining a single cleansing oil before releasing anything at all. That patience still governs the studio: formulas are revised for years rather than months, and a product is only released when the texture, the scent and the ritual around it feel settled. The range is intentionally small.',
  },
  {
    slug: 'sund-copenhagen',
    logo: { caps: true, device: 'rule' as const },
    name: 'SUND Copenhagen',
    tagline: 'Minimal skincare, maximal restraint',
    originCountry: 'Denmark',
    featured: true,
    description:
      'Fragrance-free daily essentials built around comfort and consistency.',
    story:
      'SUND was founded on a simple frustration: routines that ask for eleven steps and deliver nine of them badly. The Copenhagen studio publishes a deliberately narrow range of fragrance-free essentials, each designed to be used daily without ceremony, and each formulated to sit comfortably under whatever comes next.',
  },
  {
    slug: 'bjork-and-linden',
    logo: { device: 'dot' as const },
    name: 'Björk & Linden',
    tagline: 'Botanical apothecary, Stockholm',
    originCountry: 'Sweden',
    featured: true,
    description: 'Plant-led body and hair care in refillable glass.',
    story:
      'Björk & Linden works from a Stockholm apothecary that has kept the same counter since 1954. The house style is botanical and unhurried: cold-pressed oils, familiar herbal notes, and refillable glass that is meant to stay on a shelf for years rather than be replaced each season.',
  },
  {
    slug: 'kvist',
    logo: { caps: true, tracking: 0.42 },
    name: 'KVIST',
    tagline: 'Fragrance as landscape',
    originCountry: 'Norway',
    featured: true,
    description: 'Eaux de parfum built around northern materials and cold air.',
    story:
      'KVIST composes fragrance the way a photographer composes weather. Each eau de parfum begins with a place — a treeline, a shoreline, a room with the window open in February — and the materials are chosen to hold that memory rather than to perform. The compositions are dry, airy and deliberately unsweet.',
  },
  {
    slug: 'aurora-supply-co',
    logo: { device: 'dot' as const, tracking: 0.03 },
    name: 'Aurora Supply Co.',
    tagline: 'Sun and daily protection',
    originCountry: 'Finland',
    featured: false,
    description:
      'Lightweight daily sun care designed to be worn, not tolerated.',
    story:
      'Aurora Supply Co. exists because most sun care is abandoned by March. The Helsinki team set out to make daily protection that behaves like skincare — light, unscented, invisible on the skin — on the theory that the product people actually reapply is the one that works.',
  },
  {
    slug: 'nordkap-wellness',
    logo: { caps: true },
    name: 'Nordkap Wellness',
    tagline: 'Rituals for the darker months',
    originCountry: 'Norway',
    featured: false,
    description: 'Bath, sleep and wind-down rituals for long northern winters.',
    story:
      'Nordkap Wellness makes objects for the end of the day: bath salts, pillow mists, a candle that smells like a cabin with the stove lit. The range is built around the northern winter, when the useful thing is rarely another activity and usually a way to stop.',
  },
  {
    slug: 'lume-studio',
    logo: { caps: true, device: 'dot' as const },
    name: 'Lume Studio',
    tagline: 'Colour, quietly',
    originCountry: 'Denmark',
    featured: false,
    description: 'A restrained makeup range built on skin-like finishes.',
    story:
      'Lume Studio makes colour for people who are not especially interested in makeup. The palette is narrow and skin-adjacent, the finishes are satin rather than matte, and every product is designed to be applied with fingers on the way out of the door.',
  },
] as const;

/* --- categories ----------------------------------------------------------- */

export const categories = [
  { slug: 'skincare', name: 'Skincare', parent: null, sortOrder: 1 },
  { slug: 'cleansers', name: 'Cleansers', parent: 'skincare', sortOrder: 1 },
  {
    slug: 'serums',
    name: 'Serums & Treatments',
    parent: 'skincare',
    sortOrder: 2,
  },
  {
    slug: 'moisturisers',
    name: 'Moisturisers',
    parent: 'skincare',
    sortOrder: 3,
  },
  { slug: 'sun-care', name: 'Sun Care', parent: 'skincare', sortOrder: 4 },
  { slug: 'masks', name: 'Masks', parent: 'skincare', sortOrder: 5 },

  { slug: 'body', name: 'Body', parent: null, sortOrder: 2 },
  { slug: 'body-wash', name: 'Body Wash', parent: 'body', sortOrder: 1 },
  { slug: 'body-care', name: 'Body Care', parent: 'body', sortOrder: 2 },

  { slug: 'hair', name: 'Hair', parent: null, sortOrder: 3 },
  {
    slug: 'shampoo',
    name: 'Shampoo & Conditioner',
    parent: 'hair',
    sortOrder: 1,
  },
  {
    slug: 'hair-treatments',
    name: 'Hair Treatments',
    parent: 'hair',
    sortOrder: 2,
  },

  { slug: 'fragrance', name: 'Fragrance', parent: null, sortOrder: 4 },
  {
    slug: 'eau-de-parfum',
    name: 'Eau de Parfum',
    parent: 'fragrance',
    sortOrder: 1,
  },
  { slug: 'home-fragrance', name: 'Home', parent: 'fragrance', sortOrder: 2 },

  { slug: 'makeup', name: 'Makeup', parent: null, sortOrder: 5 },
  { slug: 'complexion', name: 'Complexion', parent: 'makeup', sortOrder: 1 },
  { slug: 'lips', name: 'Lips', parent: 'makeup', sortOrder: 2 },

  { slug: 'wellness', name: 'Wellness', parent: null, sortOrder: 6 },
  { slug: 'bath', name: 'Bath & Ritual', parent: 'wellness', sortOrder: 1 },
] as const;

/* --- concerns ------------------------------------------------------------- */

export const concerns = [
  {
    slug: 'dryness',
    name: 'Dryness',
    description: 'Skin that feels tight, rough or thirsty by the afternoon.',
    guidance:
      'Look for richer textures and layered hydration — a cream cleanser, a humectant serum under an occlusive moisturiser. Products listed here are grouped by their texture and by the way they are typically used, not by any claim about results.',
  },
  {
    slug: 'dehydration',
    name: 'Dehydration',
    description: 'Skin lacking water rather than oil — dull, flat, thirsty.',
    guidance:
      'Dehydration and dryness are different things: oily skin can be dehydrated. Lightweight, water-based layers are the usual approach.',
  },
  {
    slug: 'sensitivity',
    name: 'Sensitivity',
    description: 'Skin that reacts easily to fragrance, actives or weather.',
    guidance:
      'Shorter ingredient lists and fragrance-free formulas tend to be easier to tolerate. Patch test anything new, and introduce one product at a time.',
  },
  {
    slug: 'redness',
    name: 'Redness',
    description:
      'Visible flushing or persistent colour, often across the cheeks.',
    guidance:
      'Calming, fragrance-free routines and consistent daily sun protection are the usual starting point. Persistent redness is worth discussing with a dermatologist.',
  },
  {
    slug: 'blemishes',
    name: 'Blemishes',
    description: 'Congestion and breakouts, whether occasional or ongoing.',
    guidance:
      'Gentle cleansing and a simple routine are easier to keep up than an aggressive one. Nordic Lux does not sell acne medication — persistent or painful breakouts are a conversation for a clinician.',
  },
  {
    slug: 'uneven-tone',
    name: 'Uneven Tone',
    description: 'Patchiness or marks left behind after blemishes.',
    guidance:
      'Daily sun protection is the single most useful habit here. Beyond that, products are grouped by ingredient family so you can choose what suits you.',
  },
  {
    slug: 'dullness',
    name: 'Dullness',
    description: 'Skin that looks flat or tired rather than luminous.',
    guidance:
      'Gentle exfoliation and consistent hydration are the usual approach. Frequency matters more than strength.',
  },
  {
    slug: 'barrier-support',
    name: 'Barrier Support',
    description:
      'Skin that has been over-exfoliated or is reacting to weather.',
    guidance:
      'Pare the routine back to a gentle cleanser and a comforting moisturiser until things settle. Less is genuinely more here.',
  },
  {
    slug: 'firmness',
    name: 'Firmness',
    description: 'Loss of bounce and definition over time.',
    guidance:
      'Products in this group are chosen for their textures and ingredient families. Nordic Lux makes no claims about reversing the appearance of ageing.',
  },
] as const;

/* --- ingredients ---------------------------------------------------------- */

export const ingredients = [
  {
    slug: 'squalane',
    name: 'Squalane',
    inciName: 'Squalane',
    benefitSummary:
      'A light, stable emollient that gives slip and softness without a heavy finish.',
  },
  {
    slug: 'niacinamide',
    name: 'Niacinamide',
    inciName: 'Niacinamide',
    benefitSummary:
      'A water-soluble vitamin B3 derivative, widely used in comfort-focused formulas.',
  },
  {
    slug: 'hyaluronic-acid',
    name: 'Hyaluronic Acid',
    inciName: 'Sodium Hyaluronate',
    benefitSummary:
      'A humectant that holds water in the upper layers of the skin.',
  },
  {
    slug: 'oat-extract',
    name: 'Oat Extract',
    inciName: 'Avena Sativa Kernel Extract',
    benefitSummary:
      'A traditional soothing botanical used in fragrance-free formulas.',
  },
  {
    slug: 'birch-sap',
    name: 'Birch Sap',
    inciName: 'Betula Alba Juice',
    benefitSummary:
      'A watery northern botanical harvested in early spring, used as a hydrating base.',
  },
  {
    slug: 'cloudberry',
    name: 'Cloudberry',
    inciName: 'Rubus Chamaemorus Seed Oil',
    benefitSummary: 'A Nordic berry oil with a light, non-greasy feel.',
  },
  {
    slug: 'sea-buckthorn',
    name: 'Sea Buckthorn',
    inciName: 'Hippophae Rhamnoides Oil',
    benefitSummary: 'A deep-orange coastal berry oil, rich and fast-absorbing.',
  },
  {
    slug: 'lactic-acid',
    name: 'Lactic Acid',
    inciName: 'Lactic Acid',
    benefitSummary:
      'A gentle alpha hydroxy acid often chosen for its comparatively mild feel.',
  },
  {
    slug: 'ceramides',
    name: 'Ceramides',
    inciName: 'Ceramide NP',
    benefitSummary:
      'Lipids naturally present in skin, used in barrier-focused creams.',
  },
  {
    slug: 'zinc-oxide',
    name: 'Zinc Oxide',
    inciName: 'Zinc Oxide',
    benefitSummary: 'A mineral UV filter that sits on the surface of the skin.',
  },
  {
    slug: 'pine-resin',
    name: 'Pine Resin',
    inciName: 'Pinus Sylvestris Resin',
    benefitSummary:
      'A resinous northern note used for its dry, woody character.',
  },
  {
    slug: 'juniper',
    name: 'Juniper',
    inciName: 'Juniperus Communis Fruit Oil',
    benefitSummary:
      'A crisp, gin-like botanical used in bath and fragrance products.',
  },
] as const;

/* --- products ------------------------------------------------------------- */

export type SeedVariant = {
  name: string;
  sku: string;
  price: number;
  salePrice?: number;
  volumeMl?: number;
  weightGrams?: number;
  onHand: number;
  isDefault?: boolean;
};

export type SeedProduct = {
  slug: string;
  name: string;
  brand: string;
  category: string;
  subtitle: string;
  excerpt: string;
  description: string;
  benefits: string[];
  howToUse: string;
  ingredientsList: string;
  skinTypes: SkinType[];
  routineStep: RoutineStep;
  concerns: { slug: string; relevance: number }[];
  keyIngredients: string[];
  featured?: boolean;
  isNew?: boolean;
  variants: SeedVariant[];
};

/** Prices are USD in cents. 8900 = $89.00. */
export const products: SeedProduct[] = [
  {
    slug: 'halvor-cleansing-oil',
    name: 'Slow Cleansing Oil',
    brand: 'halvor-atelier',
    category: 'cleansers',
    subtitle: 'First cleanse for every skin type',
    excerpt:
      'A quiet oil cleanse that lifts sunscreen and the day without stripping.',
    description:
      'The product Halvør Atelier spent two winters on before releasing anything else. A blend of light plant oils that melts sunscreen and makeup on dry skin, then emulsifies to a soft milk with water. The finish is comfortable rather than squeaky — the studio takes the view that skin should feel like skin after cleansing.',
    benefits: [
      'Melts sunscreen and makeup on dry skin',
      'Rinses clean without a tight after-feel',
      'Unscented beyond the natural character of the oils',
    ],
    howToUse:
      'Warm two pumps in dry hands and massage over dry skin for around a minute. Add a little water to emulsify, then rinse. Follow with a second cleanse if you prefer.',
    ingredientsList:
      'Helianthus Annuus Seed Oil, Squalane, Caprylic/Capric Triglyceride, Polyglyceryl-4 Oleate, Rubus Chamaemorus Seed Oil, Tocopherol.',
    skinTypes: ['all'],
    routineStep: 'cleanse',
    concerns: [
      { slug: 'dryness', relevance: 8 },
      { slug: 'sensitivity', relevance: 7 },
    ],
    keyIngredients: ['squalane', 'cloudberry'],
    featured: true,
    variants: [
      {
        name: '100ml',
        sku: 'HAL-SCO-100',
        price: 890000,
        volumeMl: 100,
        weightGrams: 180,
        onHand: 42,
        isDefault: true,
      },
      {
        name: '200ml',
        sku: 'HAL-SCO-200',
        price: 1450000,
        volumeMl: 200,
        weightGrams: 320,
        onHand: 18,
      },
    ],
  },
  {
    slug: 'sund-daily-gel-cleanser',
    name: 'Daily Gel Cleanser',
    brand: 'sund-copenhagen',
    category: 'cleansers',
    subtitle: 'Fragrance-free morning cleanse',
    excerpt: 'A low-foam gel for mornings, or as a second cleanse at night.',
    description:
      'SUND’s everyday cleanser: a clear gel that produces very little foam and is designed to be unremarkable in the best sense. Fragrance-free, dye-free, and formulated to sit comfortably under actives.',
    benefits: [
      'Low-foam gel texture',
      'Fragrance-free and dye-free',
      'Rinses without residue',
    ],
    howToUse:
      'Massage a small amount over damp skin, then rinse thoroughly. Use morning and evening.',
    ingredientsList:
      'Aqua, Coco-Betaine, Glycerin, Sodium Cocoyl Isethionate, Avena Sativa Kernel Extract, Panthenol, Citric Acid, Sodium Benzoate.',
    skinTypes: ['normal', 'oily', 'combination', 'sensitive'],
    routineStep: 'cleanse',
    concerns: [
      { slug: 'sensitivity', relevance: 9 },
      { slug: 'blemishes', relevance: 6 },
    ],
    keyIngredients: ['oat-extract'],
    variants: [
      {
        name: '150ml',
        sku: 'SUN-DGC-150',
        price: 640000,
        volumeMl: 150,
        weightGrams: 200,
        onHand: 66,
        isDefault: true,
      },
    ],
  },
  {
    slug: 'sund-barrier-cream',
    name: 'Barrier Comfort Cream',
    brand: 'sund-copenhagen',
    category: 'moisturisers',
    subtitle: 'Rich, fragrance-free, for reactive days',
    excerpt: 'A cushioned cream for skin that has had enough.',
    description:
      'A dense, fragrance-free cream built around ceramides and glycerin, intended for the stretch after over-exfoliation or a hard winter. Thick in the jar, but it works into the skin without a waxy film.',
    benefits: [
      'Cushioned, non-waxy finish',
      'Fragrance-free',
      'Comfortable under sunscreen',
    ],
    howToUse:
      'Warm a small amount between fingertips and press into skin as the last step of your evening routine, or under sunscreen in the morning.',
    ingredientsList:
      'Aqua, Glycerin, Caprylic/Capric Triglyceride, Cetearyl Alcohol, Ceramide NP, Squalane, Panthenol, Avena Sativa Kernel Extract, Tocopherol.',
    skinTypes: ['dry', 'sensitive', 'normal'],
    routineStep: 'moisturise',
    concerns: [
      { slug: 'barrier-support', relevance: 10 },
      { slug: 'dryness', relevance: 9 },
      { slug: 'sensitivity', relevance: 8 },
      { slug: 'redness', relevance: 7 },
    ],
    keyIngredients: ['ceramides', 'squalane', 'oat-extract'],
    featured: true,
    variants: [
      {
        name: '50ml',
        sku: 'SUN-BCC-050',
        price: 1120000,
        volumeMl: 50,
        weightGrams: 140,
        onHand: 34,
        isDefault: true,
      },
      {
        name: '100ml',
        sku: 'SUN-BCC-100',
        price: 1780000,
        volumeMl: 100,
        weightGrams: 240,
        onHand: 4,
      },
    ],
  },
  {
    slug: 'halvor-hydrating-serum',
    name: 'Birch Hydrating Serum',
    brand: 'halvor-atelier',
    category: 'serums',
    subtitle: 'Watery hydration layer',
    excerpt: 'A near-weightless layer of hydration for under anything else.',
    description:
      'Built on birch sap rather than water, this is a thin, fast-absorbing serum meant to be applied to slightly damp skin and sealed with whatever comes next. It does very little on its own and a great deal underneath a moisturiser.',
    benefits: [
      'Watery, fast-absorbing texture',
      'Layers cleanly under cream or sunscreen',
      'Lightly scented by the sap itself',
    ],
    howToUse:
      'Apply two or three drops to damp skin after cleansing, then follow with a moisturiser to seal.',
    ingredientsList:
      'Betula Alba Juice, Aqua, Glycerin, Sodium Hyaluronate, Panthenol, Niacinamide, Sodium Benzoate.',
    skinTypes: ['all'],
    routineStep: 'treat',
    concerns: [
      { slug: 'dehydration', relevance: 10 },
      { slug: 'dullness', relevance: 7 },
      { slug: 'dryness', relevance: 6 },
    ],
    keyIngredients: ['birch-sap', 'hyaluronic-acid', 'niacinamide'],
    featured: true,
    isNew: true,
    variants: [
      {
        name: '30ml',
        sku: 'HAL-BHS-030',
        price: 980000,
        volumeMl: 30,
        weightGrams: 90,
        onHand: 51,
        isDefault: true,
      },
      {
        name: '50ml',
        sku: 'HAL-BHS-050',
        price: 1420000,
        salePrice: 1180000,
        volumeMl: 50,
        weightGrams: 130,
        onHand: 12,
      },
    ],
  },
  {
    slug: 'halvor-night-oil',
    name: 'Cloudberry Night Oil',
    brand: 'halvor-atelier',
    category: 'serums',
    subtitle: 'Evening facial oil',
    excerpt: 'A dry-touch berry oil for the last step of the evening.',
    description:
      'Cloudberry and sea buckthorn seed oils in a base of squalane — deep gold in the bottle, and lighter on the skin than it looks. Intended as the final step at night, over a serum or a cream.',
    benefits: [
      'Dry-touch finish, not greasy',
      'Warm berry character with no added fragrance',
      'A few drops covers the face',
    ],
    howToUse:
      'Press three to four drops over the face as the final step of your evening routine.',
    ingredientsList:
      'Squalane, Rubus Chamaemorus Seed Oil, Hippophae Rhamnoides Fruit Oil, Simmondsia Chinensis Seed Oil, Tocopherol.',
    skinTypes: ['dry', 'normal', 'combination'],
    routineStep: 'treat',
    concerns: [
      { slug: 'dryness', relevance: 9 },
      { slug: 'dullness', relevance: 8 },
      { slug: 'firmness', relevance: 6 },
    ],
    keyIngredients: ['cloudberry', 'sea-buckthorn', 'squalane'],
    featured: true,
    variants: [
      {
        name: '30ml',
        sku: 'HAL-CNO-030',
        price: 1650000,
        volumeMl: 30,
        weightGrams: 95,
        onHand: 27,
        isDefault: true,
      },
    ],
  },
  {
    slug: 'sund-resurfacing-lactic',
    name: 'Lactic Resurfacing Fluid 5%',
    brand: 'sund-copenhagen',
    category: 'serums',
    subtitle: 'Weekly gentle exfoliation',
    excerpt: 'A mild weekly acid for texture and dullness.',
    description:
      'A 5% lactic acid fluid at pH 3.8, formulated with glycerin and panthenol to keep the experience mild. SUND recommends once or twice a week rather than nightly — frequency does more harm than strength.',
    benefits: [
      'Low, deliberately conservative strength',
      'Buffered with glycerin and panthenol',
      'Fragrance-free',
    ],
    howToUse:
      'Apply to clean, dry skin in the evening, once or twice a week. Do not use alongside other exfoliants. Daily sun protection is essential when using acids.',
    ingredientsList:
      'Aqua, Lactic Acid, Glycerin, Panthenol, Sodium Hydroxide, Sodium Benzoate, Potassium Sorbate.',
    skinTypes: ['normal', 'oily', 'combination'],
    routineStep: 'treat',
    concerns: [
      { slug: 'dullness', relevance: 9 },
      { slug: 'uneven-tone', relevance: 8 },
      { slug: 'blemishes', relevance: 6 },
    ],
    keyIngredients: ['lactic-acid'],
    variants: [
      {
        name: '30ml',
        sku: 'SUN-LRF-030',
        price: 760000,
        volumeMl: 30,
        weightGrams: 85,
        onHand: 0,
        isDefault: true,
      },
    ],
  },
  {
    slug: 'aurora-daily-fluid-spf50',
    name: 'Daily Sun Fluid SPF 50',
    brand: 'aurora-supply-co',
    category: 'sun-care',
    subtitle: 'Invisible everyday protection',
    excerpt: 'A light daily SPF that behaves like skincare.',
    description:
      'Aurora’s core product: a fluid SPF 50 with no white cast and no heavy finish, designed to be reapplied without redoing your whole face. Unscented, and comfortable under makeup.',
    benefits: [
      'Lightweight fluid texture',
      'No white cast on application',
      'Unscented',
    ],
    howToUse:
      'Apply generously as the final step of your morning routine, before makeup. Reapply through the day when exposed to sun.',
    ingredientsList:
      'Aqua, Homosalate, Ethylhexyl Salicylate, Butyl Methoxydibenzoylmethane, Glycerin, Silica, Niacinamide, Tocopherol.',
    skinTypes: ['all'],
    routineStep: 'protect',
    concerns: [
      { slug: 'uneven-tone', relevance: 9 },
      { slug: 'firmness', relevance: 6 },
    ],
    keyIngredients: ['niacinamide'],
    featured: true,
    variants: [
      {
        name: '50ml',
        sku: 'AUR-DSF-050',
        price: 720000,
        volumeMl: 50,
        weightGrams: 120,
        onHand: 88,
        isDefault: true,
      },
      {
        name: '50ml — twin pack',
        sku: 'AUR-DSF-050X2',
        price: 1440000,
        salePrice: 1220000,
        volumeMl: 100,
        weightGrams: 240,
        onHand: 23,
      },
    ],
  },
  {
    slug: 'aurora-mineral-stick-spf30',
    name: 'Mineral Sun Stick SPF 30',
    brand: 'aurora-supply-co',
    category: 'sun-care',
    subtitle: 'Reapplication, solved',
    excerpt: 'A pocketable mineral stick for topping up over makeup.',
    description:
      'A zinc-based stick for the reapplication problem: it goes over makeup, it does not run, and it fits in a coat pocket. Slightly tinted so it disappears on most skin tones.',
    benefits: [
      'Applies cleanly over makeup',
      'Mineral filter',
      'Pocket format',
    ],
    howToUse:
      'Sweep two or three passes over exposed areas and blend with fingertips. Reapply through the day.',
    ingredientsList:
      'Zinc Oxide, Caprylic/Capric Triglyceride, Cera Alba, Squalane, Iron Oxides, Tocopherol.',
    skinTypes: ['all'],
    routineStep: 'protect',
    concerns: [{ slug: 'sensitivity', relevance: 7 }],
    keyIngredients: ['zinc-oxide'],
    isNew: true,
    variants: [
      {
        name: '18g',
        sku: 'AUR-MSS-018',
        price: 540000,
        weightGrams: 40,
        onHand: 61,
        isDefault: true,
      },
    ],
  },
  {
    slug: 'bjork-body-wash',
    name: 'Juniper Body Wash',
    brand: 'bjork-and-linden',
    category: 'body-wash',
    subtitle: 'Cold, green, bracing',
    excerpt: 'A crisp juniper wash in refillable glass.',
    description:
      'A gel wash scented with juniper, pine and a little black pepper — closer to a cold walk than to a spa. Sold in glass, with a refill pouch that costs meaningfully less than the bottle.',
    benefits: [
      'Crisp juniper and pine character',
      'Refillable glass bottle',
      'Rinses without a film',
    ],
    howToUse: 'Massage over wet skin in the shower and rinse.',
    ingredientsList:
      'Aqua, Coco-Betaine, Sodium Cocoyl Isethionate, Glycerin, Juniperus Communis Fruit Oil, Pinus Sylvestris Leaf Oil, Citric Acid, Parfum.',
    skinTypes: ['all'],
    routineStep: 'body',
    concerns: [],
    keyIngredients: ['juniper', 'pine-resin'],
    variants: [
      {
        name: '300ml — glass',
        sku: 'BJL-JBW-300',
        price: 620000,
        volumeMl: 300,
        weightGrams: 620,
        onHand: 44,
        isDefault: true,
      },
      {
        name: '500ml — refill',
        sku: 'BJL-JBW-500R',
        price: 780000,
        volumeMl: 500,
        weightGrams: 540,
        onHand: 31,
      },
    ],
  },
  {
    slug: 'bjork-body-oil',
    name: 'Linden Body Oil',
    brand: 'bjork-and-linden',
    category: 'body-care',
    subtitle: 'For skin still damp from the shower',
    excerpt: 'A fast-absorbing body oil with a soft linden-blossom scent.',
    description:
      'A light blend of sunflower, jojoba and sweet almond oils, scented with linden blossom. Designed to be applied to damp skin so it absorbs rather than sits.',
    benefits: [
      'Absorbs quickly on damp skin',
      'Soft floral scent',
      'Non-greasy finish',
    ],
    howToUse:
      'Apply to damp skin straight after showering and let it settle for a minute before dressing.',
    ingredientsList:
      'Helianthus Annuus Seed Oil, Simmondsia Chinensis Seed Oil, Prunus Amygdalus Dulcis Oil, Tilia Cordata Flower Extract, Parfum, Tocopherol.',
    skinTypes: ['dry', 'normal'],
    routineStep: 'body',
    concerns: [{ slug: 'dryness', relevance: 8 }],
    keyIngredients: ['squalane'],
    variants: [
      {
        name: '150ml',
        sku: 'BJL-LBO-150',
        price: 840000,
        volumeMl: 150,
        weightGrams: 260,
        onHand: 29,
        isDefault: true,
      },
    ],
  },
  {
    slug: 'bjork-hand-balm',
    name: 'Apothecary Hand Balm',
    brand: 'bjork-and-linden',
    category: 'body-care',
    subtitle: 'For hands that are washed too often',
    excerpt: 'A thick balm in a tube, for winter hands.',
    description:
      'A dense balm formulated for hands that are washed constantly. It sinks in faster than its thickness suggests and does not leave the keyboard greasy.',
    benefits: [
      'Dense, protective texture',
      'Absorbs faster than it looks',
      'Lightly scented',
    ],
    howToUse: 'Work a small amount into hands and cuticles as often as needed.',
    ingredientsList:
      'Aqua, Glycerin, Butyrospermum Parkii Butter, Cetearyl Alcohol, Squalane, Ceramide NP, Parfum, Tocopherol.',
    skinTypes: ['dry', 'normal'],
    routineStep: 'body',
    concerns: [
      { slug: 'dryness', relevance: 9 },
      { slug: 'barrier-support', relevance: 7 },
    ],
    keyIngredients: ['ceramides', 'squalane'],
    variants: [
      {
        name: '75ml',
        sku: 'BJL-AHB-075',
        price: 380000,
        volumeMl: 75,
        weightGrams: 110,
        onHand: 96,
        isDefault: true,
      },
    ],
  },
  {
    slug: 'bjork-shampoo',
    name: 'Everyday Shampoo',
    brand: 'bjork-and-linden',
    category: 'shampoo',
    subtitle: 'Gentle enough for daily use',
    excerpt: 'A mild shampoo that does not strip colour.',
    description:
      'A sulphate-free shampoo with a soft, low lather. Formulated for frequent washing and safe for colour-treated hair.',
    benefits: [
      'Sulphate-free',
      'Suitable for colour-treated hair',
      'Soft, low lather',
    ],
    howToUse: 'Massage into wet hair and scalp, rinse, and repeat if needed.',
    ingredientsList:
      'Aqua, Sodium Cocoyl Isethionate, Coco-Betaine, Glycerin, Panthenol, Betula Alba Juice, Citric Acid, Parfum.',
    skinTypes: ['all'],
    routineStep: 'hair',
    concerns: [],
    keyIngredients: ['birch-sap'],
    variants: [
      {
        name: '250ml',
        sku: 'BJL-EDS-250',
        price: 560000,
        volumeMl: 250,
        weightGrams: 300,
        onHand: 52,
        isDefault: true,
      },
    ],
  },
  {
    slug: 'bjork-conditioner',
    name: 'Everyday Conditioner',
    brand: 'bjork-and-linden',
    category: 'shampoo',
    subtitle: 'Weightless slip',
    excerpt: 'A light conditioner that detangles without flattening.',
    description:
      'Formulated to match the Everyday Shampoo — enough slip to detangle, little enough weight that fine hair keeps its body.',
    benefits: [
      'Detangles without weighing hair down',
      'Rinses clean',
      'Matches the Everyday Shampoo',
    ],
    howToUse:
      'Work through mid-lengths and ends, leave for a minute, and rinse.',
    ingredientsList:
      'Aqua, Cetearyl Alcohol, Behentrimonium Chloride, Glycerin, Panthenol, Tilia Cordata Flower Extract, Parfum.',
    skinTypes: ['all'],
    routineStep: 'hair',
    concerns: [],
    keyIngredients: [],
    variants: [
      {
        name: '250ml',
        sku: 'BJL-EDC-250',
        price: 560000,
        volumeMl: 250,
        weightGrams: 300,
        onHand: 47,
        isDefault: true,
      },
    ],
  },
  {
    slug: 'bjork-scalp-treatment',
    name: 'Weekly Scalp Treatment',
    brand: 'bjork-and-linden',
    category: 'hair-treatments',
    subtitle: 'A pre-wash ritual',
    excerpt: 'A pre-wash oil for scalps that get tight in winter.',
    description:
      'A pre-wash treatment oil to be massaged into the scalp and left for twenty minutes before shampooing. Comes with a wooden applicator.',
    benefits: [
      'Pre-wash format',
      'Includes a wooden applicator',
      'Rinses out cleanly',
    ],
    howToUse:
      'Part dry hair in sections, apply along the scalp, and massage. Leave for twenty minutes, then shampoo as normal.',
    ingredientsList:
      'Helianthus Annuus Seed Oil, Ricinus Communis Seed Oil, Rosmarinus Officinalis Leaf Oil, Menthol, Tocopherol.',
    skinTypes: ['all'],
    routineStep: 'hair',
    concerns: [{ slug: 'dryness', relevance: 6 }],
    keyIngredients: [],
    variants: [
      {
        name: '100ml',
        sku: 'BJL-WST-100',
        price: 690000,
        volumeMl: 100,
        weightGrams: 180,
        onHand: 3,
        isDefault: true,
      },
    ],
  },
  {
    slug: 'kvist-treeline',
    name: 'Treeline Eau de Parfum',
    brand: 'kvist',
    category: 'eau-de-parfum',
    subtitle: 'Pine resin, cold air, dry cedar',
    excerpt: 'The edge of a forest in February.',
    description:
      'KVIST’s signature: pine resin and juniper over a dry cedar base, with an opening cold enough to feel like weather. It wears close to the skin and lasts most of a day without ever announcing itself.',
    benefits: [
      'Dry, resinous character',
      'Wears close to the skin',
      'Unsweetened composition',
    ],
    howToUse: 'Spray once at the base of the throat and once on a wrist.',
    ingredientsList:
      'Alcohol Denat., Parfum, Aqua, Limonene, Linalool, Tocopherol.',
    skinTypes: ['all'],
    routineStep: 'fragrance',
    concerns: [],
    keyIngredients: ['pine-resin', 'juniper'],
    featured: true,
    variants: [
      {
        name: '50ml',
        sku: 'KVI-TRL-050',
        price: 2450000,
        volumeMl: 50,
        weightGrams: 320,
        onHand: 19,
        isDefault: true,
      },
      {
        name: '100ml',
        sku: 'KVI-TRL-100',
        price: 3850000,
        volumeMl: 100,
        weightGrams: 520,
        onHand: 7,
      },
      {
        name: '10ml — travel',
        sku: 'KVI-TRL-010',
        price: 890000,
        volumeMl: 10,
        weightGrams: 80,
        onHand: 38,
      },
    ],
  },
  {
    slug: 'kvist-shoreline',
    name: 'Shoreline Eau de Parfum',
    brand: 'kvist',
    category: 'eau-de-parfum',
    subtitle: 'Salt, driftwood, cold mineral',
    excerpt: 'A mineral, saline composition with no sweetness at all.',
    description:
      'Salt and wet stone over driftwood, with a faint green thread running underneath. Shoreline is the coldest thing KVIST makes and the one people either love immediately or never.',
    benefits: [
      'Saline, mineral character',
      'Genuinely unisex',
      'Moderate projection',
    ],
    howToUse: 'Spray once or twice on pulse points.',
    ingredientsList: 'Alcohol Denat., Parfum, Aqua, Limonene, Linalool.',
    skinTypes: ['all'],
    routineStep: 'fragrance',
    concerns: [],
    keyIngredients: [],
    isNew: true,
    variants: [
      {
        name: '50ml',
        sku: 'KVI-SHL-050',
        price: 2450000,
        volumeMl: 50,
        weightGrams: 320,
        onHand: 14,
        isDefault: true,
      },
      {
        name: '10ml — travel',
        sku: 'KVI-SHL-010',
        price: 890000,
        volumeMl: 10,
        weightGrams: 80,
        onHand: 0,
      },
    ],
  },
  {
    slug: 'nordkap-bath-salts',
    name: 'Long Night Bath Salts',
    brand: 'nordkap-wellness',
    category: 'bath',
    subtitle: 'Magnesium, juniper, pine',
    excerpt: 'Coarse salts for the end of a long week.',
    description:
      'Coarse magnesium salts with juniper and pine, in a weight that makes a bath feel like an event. Two handfuls is a dose.',
    benefits: [
      'Coarse magnesium salt',
      'Juniper and pine',
      'Roughly twelve baths per jar',
    ],
    howToUse: 'Add two generous handfuls to a warm bath and let them dissolve.',
    ingredientsList:
      'Magnesium Sulfate, Sodium Chloride, Juniperus Communis Fruit Oil, Pinus Sylvestris Leaf Oil.',
    skinTypes: ['all'],
    routineStep: 'wellness',
    concerns: [],
    keyIngredients: ['juniper', 'pine-resin'],
    variants: [
      {
        name: '600g',
        sku: 'NKW-LNB-600',
        price: 480000,
        weightGrams: 620,
        onHand: 58,
        isDefault: true,
      },
    ],
  },
  {
    slug: 'nordkap-pillow-mist',
    name: 'Pillow Mist',
    brand: 'nordkap-wellness',
    category: 'bath',
    subtitle: 'A wind-down cue',
    excerpt: 'A quiet linen mist for the last ten minutes of the day.',
    description:
      'Lavender softened with vetiver, so it reads calm rather than floral. Nordkap is careful to describe this as a cue rather than a sleep aid — it is a scent you learn to associate with stopping.',
    benefits: [
      'Soft lavender and vetiver',
      'Linen-safe formula',
      'Part of a wind-down routine',
    ],
    howToUse: 'Mist over bedding a few minutes before you get in.',
    ingredientsList:
      'Aqua, Alcohol Denat., Parfum, Lavandula Angustifolia Oil, Linalool.',
    skinTypes: ['all'],
    routineStep: 'wellness',
    concerns: [],
    keyIngredients: [],
    variants: [
      {
        name: '100ml',
        sku: 'NKW-PLM-100',
        price: 420000,
        volumeMl: 100,
        weightGrams: 180,
        onHand: 71,
        isDefault: true,
      },
    ],
  },
  {
    slug: 'nordkap-cabin-candle',
    name: 'Cabin Candle',
    brand: 'nordkap-wellness',
    category: 'home-fragrance',
    subtitle: 'Woodsmoke and dry timber',
    excerpt: 'A candle that smells like a stove that has just been lit.',
    description:
      'Woodsmoke, dry timber and a little birch tar, in a reusable stoneware vessel. Roughly fifty hours of burn.',
    benefits: [
      'Approximately 50 hours burn time',
      'Reusable stoneware vessel',
      'Cotton wick',
    ],
    howToUse:
      'On the first burn, allow the pool to reach the edge. Trim the wick to 5mm before each use.',
    ingredientsList: 'Vegetable Wax Blend, Parfum, Cotton Wick.',
    skinTypes: ['all'],
    routineStep: 'wellness',
    concerns: [],
    keyIngredients: ['pine-resin'],
    featured: true,
    variants: [
      {
        name: '220g',
        sku: 'NKW-CBC-220',
        price: 680000,
        weightGrams: 640,
        onHand: 26,
        isDefault: true,
      },
    ],
  },
  {
    slug: 'lume-skin-tint',
    name: 'Skin Tint',
    brand: 'lume-studio',
    category: 'complexion',
    subtitle: 'Sheer, satin, finger-applied',
    excerpt: 'A sheer tint that evens without covering.',
    description:
      'A light, satin-finish tint designed to be applied with fingers. It evens tone without hiding skin, and it does not sit in texture.',
    benefits: [
      'Sheer, buildable coverage',
      'Satin finish',
      'Applies cleanly with fingers',
    ],
    howToUse:
      'Dot over the face and blend outward with fingertips. Build where needed.',
    ingredientsList:
      'Aqua, Glycerin, Caprylic/Capric Triglyceride, Squalane, Iron Oxides, Titanium Dioxide, Tocopherol.',
    skinTypes: ['all'],
    routineStep: 'protect',
    concerns: [{ slug: 'uneven-tone', relevance: 7 }],
    keyIngredients: ['squalane'],
    variants: [
      {
        name: '01 — Porcelain',
        sku: 'LUM-SKT-01',
        price: 780000,
        volumeMl: 30,
        weightGrams: 70,
        onHand: 22,
        isDefault: true,
      },
      {
        name: '04 — Sand',
        sku: 'LUM-SKT-04',
        price: 780000,
        volumeMl: 30,
        weightGrams: 70,
        onHand: 31,
      },
      {
        name: '07 — Amber',
        sku: 'LUM-SKT-07',
        price: 780000,
        volumeMl: 30,
        weightGrams: 70,
        onHand: 18,
      },
      {
        name: '10 — Umber',
        sku: 'LUM-SKT-10',
        price: 780000,
        volumeMl: 30,
        weightGrams: 70,
        onHand: 0,
      },
    ],
  },
  {
    slug: 'lume-lip-balm',
    name: 'Tinted Lip Treatment',
    brand: 'lume-studio',
    category: 'lips',
    subtitle: 'Colour that behaves like balm',
    excerpt: 'A soft-focus tinted balm in three quiet shades.',
    description:
      'A balm first and a colour second: comfortable enough to wear absent-mindedly, with just enough pigment to read as intentional.',
    benefits: ['Balm texture', 'Sheer wash of colour', 'No stickiness'],
    howToUse: 'Apply directly, and reapply whenever you think of it.',
    ingredientsList:
      'Ricinus Communis Seed Oil, Cera Alba, Butyrospermum Parkii Butter, Squalane, Iron Oxides, Tocopherol.',
    skinTypes: ['all'],
    routineStep: 'moisturise',
    concerns: [{ slug: 'dryness', relevance: 5 }],
    keyIngredients: ['squalane'],
    isNew: true,
    variants: [
      {
        name: 'Bare',
        sku: 'LUM-TLT-BR',
        price: 420000,
        weightGrams: 30,
        onHand: 64,
        isDefault: true,
      },
      {
        name: 'Rosehip',
        sku: 'LUM-TLT-RH',
        price: 420000,
        weightGrams: 30,
        onHand: 55,
      },
      {
        name: 'Clay',
        sku: 'LUM-TLT-CL',
        price: 420000,
        weightGrams: 30,
        onHand: 2,
      },
    ],
  },
  {
    slug: 'sund-overnight-mask',
    name: 'Overnight Recovery Mask',
    brand: 'sund-copenhagen',
    category: 'masks',
    subtitle: 'A once-a-week reset',
    excerpt: 'A thick sleeping mask for the night after a hard week.',
    description:
      'A rich, fragrance-free sleeping mask meant for occasional use rather than nightly. Apply as the last step and expect to wake up with a slightly cushioned face.',
    benefits: ['Rich occlusive finish', 'Fragrance-free', 'Weekly use'],
    howToUse:
      'Apply a generous layer as the final step of your evening routine, once or twice a week. Rinse in the morning if you prefer.',
    ingredientsList:
      'Aqua, Glycerin, Squalane, Cetearyl Alcohol, Ceramide NP, Panthenol, Avena Sativa Kernel Extract, Sodium Hyaluronate.',
    skinTypes: ['dry', 'normal', 'sensitive'],
    routineStep: 'mask',
    concerns: [
      { slug: 'dryness', relevance: 9 },
      { slug: 'barrier-support', relevance: 8 },
      { slug: 'dehydration', relevance: 7 },
    ],
    keyIngredients: ['ceramides', 'hyaluronic-acid', 'squalane'],
    variants: [
      {
        name: '60ml',
        sku: 'SUN-ORM-060',
        price: 1280000,
        volumeMl: 60,
        weightGrams: 160,
        onHand: 16,
        isDefault: true,
      },
    ],
  },
  {
    slug: 'halvor-niacinamide-serum',
    name: 'Niacinamide Balancing Serum',
    brand: 'halvor-atelier',
    category: 'serums',
    subtitle: 'For congestion and shine',
    excerpt: 'A light serum for skin that gets shiny by lunchtime.',
    description:
      'Five percent niacinamide in a light aqueous base, with zinc PCA. Intended for combination and oily skin, and mild enough to use twice a day.',
    benefits: ['5% niacinamide', 'Light, non-tacky finish', 'Fragrance-free'],
    howToUse:
      'Apply a few drops to clean skin morning and evening, before moisturiser.',
    ingredientsList:
      'Aqua, Niacinamide, Glycerin, Zinc PCA, Panthenol, Sodium Hyaluronate, Sodium Benzoate.',
    skinTypes: ['oily', 'combination', 'normal'],
    routineStep: 'treat',
    concerns: [
      { slug: 'blemishes', relevance: 9 },
      { slug: 'uneven-tone', relevance: 7 },
      { slug: 'redness', relevance: 6 },
    ],
    keyIngredients: ['niacinamide'],
    variants: [
      {
        name: '30ml',
        sku: 'HAL-NBS-030',
        price: 820000,
        volumeMl: 30,
        weightGrams: 90,
        onHand: 43,
        isDefault: true,
      },
    ],
  },
  {
    slug: 'sund-light-gel-moisturiser',
    name: 'Light Gel Moisturiser',
    brand: 'sund-copenhagen',
    category: 'moisturisers',
    subtitle: 'Weightless daily hydration',
    excerpt: 'A gel-cream for humid days and oilier skin.',
    description:
      'A weightless gel-cream that hydrates without any of the weight of the Barrier Comfort Cream. The one SUND recommends for Colombo humidity.',
    benefits: [
      'Weightless gel-cream',
      'Fragrance-free',
      'Sits well under sunscreen',
    ],
    howToUse: 'Apply to clean skin morning and evening.',
    ingredientsList:
      'Aqua, Glycerin, Sodium Hyaluronate, Panthenol, Niacinamide, Squalane, Sodium Benzoate.',
    skinTypes: ['oily', 'combination', 'normal'],
    routineStep: 'moisturise',
    concerns: [
      { slug: 'dehydration', relevance: 9 },
      { slug: 'blemishes', relevance: 6 },
    ],
    keyIngredients: ['hyaluronic-acid', 'niacinamide'],
    featured: true,
    variants: [
      {
        name: '50ml',
        sku: 'SUN-LGM-050',
        price: 890000,
        volumeMl: 50,
        weightGrams: 130,
        onHand: 57,
        isDefault: true,
      },
      {
        name: '100ml',
        sku: 'SUN-LGM-100',
        price: 1440000,
        volumeMl: 100,
        weightGrams: 230,
        onHand: 21,
      },
    ],
  },
];
