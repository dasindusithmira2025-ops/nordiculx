import './load-env';
import { sql as raw } from 'drizzle-orm';
import { db, sql as connection } from '@/lib/db';
import * as s from '@/lib/db/schema';
import { hashPassword } from '@/lib/auth/password';
import { generateToken, hashToken, generateReference } from '@/lib/tokens';
import { generateProductMedia, vesselForStep } from './generate-media';
import * as data from './seed-data';

/**
 * Development seed.
 *
 * Populates a believable catalogue so every screen can be built and tested
 * against real data rather than mocks. ALL content is fictional sample data —
 * see the header of scripts/seed-data.ts.
 *
 *   npm run db:seed
 *
 * Refuses to run against NODE_ENV=production. The development credentials it
 * creates are printed at the end and exist only in seeded databases; they are
 * never created by a migration and never exist in production.
 */

if (process.env.NODE_ENV === 'production') {
  console.error('Refusing to seed a production database.');
  process.exit(1);
}

/**
 * `--no-demo-catalogue` seeds everything except the fictional sample brands
 * and products: taxonomy, concerns, ingredients, editorial, staff, customers
 * and sample orders still land, so the application is fully exercisable, but
 * the catalogue itself is left empty for the real one to be imported into
 * (`npm run migrate:catalogue`). Use it for any database a client will see.
 */
const DEMO_CATALOGUE = !process.argv.includes('--no-demo-catalogue');
const demoBrands = DEMO_CATALOGUE ? data.brands : [];
const demoProducts = DEMO_CATALOGUE ? data.products : [];

const DEV_STAFF_PASSWORD = 'DevOwner!2026';
const DEV_CUSTOMER_PASSWORD = 'DevCustomer!2026';

/** Every table, in dependency order, so TRUNCATE ... CASCADE is predictable. */
async function truncateAll() {
  await db.execute(raw`
    TRUNCATE TABLE
      analytics_events, chat_messages, chat_conversations, support_tickets,
      routine_results, routine_recommendation_rules, routine_answer_options,
      routine_questions, newsletter_subscribers, reviews,
      return_items, return_requests, tracking_events, shipments, payments,
      order_items, orders, cart_items, carts, wishlist_items, promotions,
      back_in_stock_subscriptions, inventory_movements, inventory_items,
      article_products, articles, article_topics, campaigns, homepage_sections,
      navigation_items, announcements, pages, faqs,
      product_relations, product_collections, product_ingredients,
      product_concerns, product_media, product_variants, products,
      collections, concerns, ingredients, categories, brands,
      audit_logs, verification_tokens, addresses, sessions, users
    RESTART IDENTITY CASCADE
  `);
}

async function main() {
  const started = Date.now();
  console.warn('Clearing existing data…');
  await truncateAll();

  /* --- brands ------------------------------------------------------------ */
  console.warn('Seeding brands…');
  const brandRows =
    demoBrands.length === 0
      ? []
      : await db
          .insert(s.brands)
          .values(
            demoBrands.map((b, i) => ({
              name: b.name,
              slug: b.slug,
              tagline: b.tagline,
              description: b.description,
              story: b.story,
              originCountry: b.originCountry,
              status: 'published' as const,
              featured: b.featured,
              sortOrder: i,
              heroImageUrl: `/media/editorial/brand-${b.slug}.webp`,
              seoTitle: `${b.name} at Nordic Lux`,
              seoDescription: b.description,
            })),
          )
          .returning({ id: s.brands.id, slug: s.brands.slug });
  const brandBySlug = new Map(brandRows.map((b) => [b.slug, b.id]));

  /* --- categories -------------------------------------------------------- */
  console.warn('Seeding categories…');
  const categoryBySlug = new Map<string, string>();
  // Parents first so children can resolve `parentId` in the same pass.
  for (const group of [
    data.categories.filter((c) => c.parent === null),
    data.categories.filter((c) => c.parent !== null),
  ]) {
    for (const c of group) {
      const [row] = await db
        .insert(s.categories)
        .values({
          name: c.name,
          slug: c.slug,
          parentId: c.parent ? categoryBySlug.get(c.parent) : null,
          status: 'published',
          showInNavigation: true,
          sortOrder: c.sortOrder,
          description: `${c.name} at Nordic Lux.`,
          heroImageUrl: `/media/editorial/category-${c.slug}.webp`,
          seoTitle: `${c.name} | Nordic Lux`,
          seoDescription: `Shop ${c.name.toLowerCase()} at Nordic Lux.`,
        })
        .returning({ id: s.categories.id });
      categoryBySlug.set(c.slug, row!.id);
    }
  }

  /* --- concerns and ingredients ----------------------------------------- */
  console.warn('Seeding concerns and ingredients…');
  const concernRows = await db
    .insert(s.concerns)
    .values(
      data.concerns.map((c, i) => ({
        name: c.name,
        slug: c.slug,
        description: c.description,
        guidance: c.guidance,
        status: 'published' as const,
        sortOrder: i,
        imageUrl: `/media/editorial/concern-${c.slug}.webp`,
      })),
    )
    .returning({ id: s.concerns.id, slug: s.concerns.slug });
  const concernBySlug = new Map(concernRows.map((c) => [c.slug, c.id]));

  const ingredientRows = await db
    .insert(s.ingredients)
    .values(data.ingredients.map((i) => ({ ...i })))
    .returning({ id: s.ingredients.id, slug: s.ingredients.slug });
  const ingredientBySlug = new Map(ingredientRows.map((i) => [i.slug, i.id]));

  /* --- collections ------------------------------------------------------- */
  console.warn('Seeding collections…');
  const collectionSpecs = [
    {
      slug: 'the-winter-edit',
      name: 'The Winter Edit',
      description:
        'The pieces we reach for when the air turns dry — richer textures, warmer scent, longer baths.',
      featured: true,
      productSlugs: [
        'sund-barrier-cream',
        'halvor-night-oil',
        'nordkap-bath-salts',
        'bjork-hand-balm',
        'nordkap-cabin-candle',
        'sund-overnight-mask',
      ],
    },
    {
      slug: 'quiet-essentials',
      name: 'Quiet Essentials',
      description:
        'Fragrance-free, unfussy, and designed to be used every day without thinking about it.',
      featured: true,
      productSlugs: [
        'sund-daily-gel-cleanser',
        'sund-light-gel-moisturiser',
        'aurora-daily-fluid-spf50',
        'halvor-hydrating-serum',
      ],
    },
    {
      slug: 'gifts-under-6000',
      name: 'Gifts Under $60',
      description:
        'Small, considered things that do not look like an afterthought.',
      featured: false,
      productSlugs: [
        'nordkap-pillow-mist',
        'lume-lip-balm',
        'saga-birch-tea',
        'bjork-hand-balm',
        'saga-forest-honey',
        'nordkap-bath-salts',
      ],
    },
  ];

  const collectionRows = await db
    .insert(s.collections)
    .values(
      collectionSpecs.map((c, i) => ({
        name: c.name,
        slug: c.slug,
        description: c.description,
        status: 'published' as const,
        featured: c.featured,
        sortOrder: i,
        heroImageUrl: `/media/editorial/collection-${c.slug}.webp`,
      })),
    )
    .returning({ id: s.collections.id, slug: s.collections.slug });
  const collectionBySlug = new Map(collectionRows.map((c) => [c.slug, c.id]));

  /* --- products ---------------------------------------------------------- */
  console.warn(
    `Generating catalogue imagery for ${demoProducts.length} products…`,
  );
  await generateProductMedia(
    demoProducts.map((p, i) => ({
      key: p.slug,
      shape: vesselForStep(p.routineStep),
      groundIndex: i % 5,
      label: p.name.split(' ')[0] ?? 'Nordic',
    })),
  );

  console.warn('Seeding products…');
  const productBySlug = new Map<string, string>();
  const variantBySku = new Map<string, string>();

  for (const p of demoProducts) {
    const brandId = brandBySlug.get(p.brand);
    const categoryId = categoryBySlug.get(p.category);
    if (!brandId || !categoryId) {
      throw new Error(
        `Product ${p.slug} references a missing brand or category`,
      );
    }

    const [product] = await db
      .insert(s.products)
      .values({
        name: p.name,
        slug: p.slug,
        brandId,
        categoryId,
        subtitle: p.subtitle,
        excerpt: p.excerpt,
        description: p.description,
        benefits: p.benefits,
        howToUse: p.howToUse,
        ingredientsList: p.ingredientsList,
        suitableSkinTypes: p.skinTypes,
        routineStep: p.routineStep,
        status: 'published',
        featured: p.featured ?? false,
        newUntil: p.isNew
          ? new Date(Date.now() + 1000 * 60 * 60 * 24 * 60)
          : null,
        seoTitle: `${p.name} | Nordic Lux`,
        seoDescription: p.excerpt,
      })
      .returning({ id: s.products.id });

    const productId = product!.id;
    productBySlug.set(p.slug, productId);

    // Media: primary shot plus the hover alternate.
    await db.insert(s.productMedia).values([
      {
        productId,
        url: `/media/products/${p.slug}.webp`,
        alt: `${p.name} by ${data.brands.find((b) => b.slug === p.brand)?.name}`,
        width: 1200,
        height: 1600,
        sortOrder: 0,
      },
      {
        productId,
        url: `/media/products/${p.slug}-alt.webp`,
        alt: `${p.name}, alternate view`,
        width: 1200,
        height: 1600,
        sortOrder: 1,
      },
    ]);

    // Variants, each with its own inventory row and an opening movement.
    for (const [index, v] of p.variants.entries()) {
      const [variant] = await db
        .insert(s.productVariants)
        .values({
          productId,
          sku: v.sku,
          name: v.name,
          price: v.price,
          salePrice: v.salePrice ?? null,
          volumeMl: v.volumeMl ?? null,
          weightGrams: v.weightGrams ?? null,
          status: 'published',
          isDefault: v.isDefault ?? index === 0,
          sortOrder: index,
          imageUrl: `/media/products/${p.slug}.webp`,
        })
        .returning({ id: s.productVariants.id });

      const variantId = variant!.id;
      variantBySku.set(v.sku, variantId);

      await db.insert(s.inventoryItems).values({
        variantId,
        onHand: v.onHand,
        reserved: 0,
        lowStockThreshold: 5,
      });

      // Opening balance, so stock history is explainable from the first unit.
      await db.insert(s.inventoryMovements).values({
        variantId,
        reason: 'received',
        onHandDelta: v.onHand,
        reservedDelta: 0,
        onHandAfter: v.onHand,
        reservedAfter: 0,
        note: 'Opening balance (seed)',
      });
    }

    if (p.concerns.length > 0) {
      await db.insert(s.productConcerns).values(
        p.concerns.flatMap((c) => {
          const concernId = concernBySlug.get(c.slug);
          return concernId
            ? [{ productId, concernId, relevance: c.relevance }]
            : [];
        }),
      );
    }

    if (p.keyIngredients.length > 0) {
      await db.insert(s.productIngredients).values(
        p.keyIngredients.flatMap((slug, i) => {
          const ingredientId = ingredientBySlug.get(slug);
          return ingredientId
            ? [{ productId, ingredientId, isKeyIngredient: true, sortOrder: i }]
            : [];
        }),
      );
    }
  }

  /* --- collection membership and cross-sell ------------------------------ */
  for (const c of collectionSpecs) {
    const collectionId = collectionBySlug.get(c.slug)!;
    const collectionMembers = c.productSlugs.flatMap((slug, i) => {
      const productId = productBySlug.get(slug);
      return productId ? [{ productId, collectionId, sortOrder: i }] : [];
    });
    if (collectionMembers.length)
      await db.insert(s.productCollections).values(collectionMembers);
  }

  // "Complete the Routine" — a genuine next step, not a random product.
  const routinePairs: [string, string[]][] = [
    [
      'halvor-cleansing-oil',
      [
        'sund-daily-gel-cleanser',
        'halvor-hydrating-serum',
        'sund-barrier-cream',
      ],
    ],
    [
      'halvor-hydrating-serum',
      [
        'sund-light-gel-moisturiser',
        'aurora-daily-fluid-spf50',
        'halvor-night-oil',
      ],
    ],
    [
      'sund-barrier-cream',
      [
        'halvor-cleansing-oil',
        'sund-overnight-mask',
        'aurora-daily-fluid-spf50',
      ],
    ],
    [
      'sund-daily-gel-cleanser',
      ['halvor-niacinamide-serum', 'sund-light-gel-moisturiser'],
    ],
    [
      'aurora-daily-fluid-spf50',
      ['aurora-mineral-stick-spf30', 'lume-skin-tint'],
    ],
    ['halvor-night-oil', ['sund-overnight-mask', 'nordkap-pillow-mist']],
    ['bjork-shampoo', ['bjork-conditioner', 'bjork-scalp-treatment']],
    ['bjork-body-wash', ['bjork-body-oil', 'bjork-hand-balm']],
    ['kvist-treeline', ['kvist-shoreline', 'nordkap-cabin-candle']],
  ];
  for (const [source, targets] of routinePairs) {
    const productId = productBySlug.get(source);
    if (!productId) continue;
    await db.insert(s.productRelations).values(
      targets.flatMap((t, i) => {
        const relatedProductId = productBySlug.get(t);
        return relatedProductId
          ? [
              {
                productId,
                relatedProductId,
                kind: 'routine' as const,
                sortOrder: i,
              },
            ]
          : [];
      }),
    );
  }

  /* --- accounts ---------------------------------------------------------- */
  console.warn('Seeding accounts…');
  const [staffPassword, customerPassword] = await Promise.all([
    hashPassword(DEV_STAFF_PASSWORD),
    hashPassword(DEV_CUSTOMER_PASSWORD),
  ]);

  const staffRows = await db
    .insert(s.users)
    .values([
      {
        email: 'owner@nordiclux.test',
        passwordHash: staffPassword,
        firstName: 'Dev',
        lastName: 'Owner',
        staffRole: 'owner' as const,
        emailVerifiedAt: new Date(),
      },
      {
        email: 'products@nordiclux.test',
        passwordHash: staffPassword,
        firstName: 'Dev',
        lastName: 'Product Manager',
        staffRole: 'product_manager' as const,
        emailVerifiedAt: new Date(),
      },
      {
        email: 'orders@nordiclux.test',
        passwordHash: staffPassword,
        firstName: 'Dev',
        lastName: 'Order Manager',
        staffRole: 'order_manager' as const,
        emailVerifiedAt: new Date(),
      },
      {
        email: 'support@nordiclux.test',
        passwordHash: staffPassword,
        firstName: 'Dev',
        lastName: 'Support',
        staffRole: 'support' as const,
        emailVerifiedAt: new Date(),
      },
      {
        email: 'editor@nordiclux.test',
        passwordHash: staffPassword,
        firstName: 'Dev',
        lastName: 'Editor',
        staffRole: 'content_editor' as const,
        emailVerifiedAt: new Date(),
      },
    ])
    .returning({ id: s.users.id, email: s.users.email });
  const ownerId = staffRows[0]!.id;

  const customerRows = await db
    .insert(s.users)
    .values([
      {
        email: 'customer@nordiclux.test',
        passwordHash: customerPassword,
        firstName: 'Amaya',
        lastName: 'Perera',
        phone: '+94771234567',
        emailVerifiedAt: new Date(),
        marketingOptInAt: new Date(),
      },
      {
        email: 'nuwan@nordiclux.test',
        passwordHash: customerPassword,
        firstName: 'Nuwan',
        lastName: 'Silva',
        phone: '+94777654321',
        emailVerifiedAt: new Date(),
      },
      {
        email: 'ishara@nordiclux.test',
        passwordHash: customerPassword,
        firstName: 'Ishara',
        lastName: 'Fernando',
        emailVerifiedAt: new Date(),
      },
    ])
    .returning({ id: s.users.id, email: s.users.email });
  const customerId = customerRows[0]!.id;

  await db.insert(s.addresses).values([
    {
      userId: customerId,
      label: 'Home',
      type: 'shipping',
      recipientName: 'Amaya Perera',
      phone: '+94771234567',
      line1: '42 Horton Place',
      line2: 'Apartment 5B',
      city: 'Colombo',
      district: 'Colombo',
      postalCode: '00700',
      country: 'LK',
      isDefault: true,
    },
    {
      userId: customerId,
      label: 'Office',
      type: 'shipping',
      recipientName: 'Amaya Perera',
      phone: '+94771234567',
      line1: '19 Union Place',
      city: 'Colombo',
      district: 'Colombo',
      postalCode: '00200',
      country: 'LK',
      isDefault: false,
    },
  ]);

  /* --- reviews ----------------------------------------------------------- */
  console.warn('Seeding reviews…');
  const reviewSpecs: {
    product: string;
    userIndex: number;
    rating: number;
    title: string;
    body: string;
    status: 'approved' | 'pending';
  }[] = [
    {
      product: 'halvor-cleansing-oil',
      userIndex: 0,
      rating: 5,
      title: 'Finally something that removes SPF properly',
      body: 'I have been using this every evening for about three months. It takes off sunscreen without any of the stinging I got from the balm I used before, and my skin does not feel tight afterwards.',
      status: 'approved',
    },
    {
      product: 'halvor-cleansing-oil',
      userIndex: 1,
      rating: 4,
      title: 'Lovely, but the pump is loose',
      body: 'No complaints about the oil itself — it does exactly what it says. The pump on mine arrived a bit loose and drips occasionally.',
      status: 'approved',
    },
    {
      product: 'sund-barrier-cream',
      userIndex: 0,
      rating: 5,
      title: 'Rescued my skin after I overdid the acids',
      body: 'I stripped my skin badly in December. Two weeks of just this and a gentle cleanser and things calmed down. It is thick but it does not pill under sunscreen.',
      status: 'approved',
    },
    {
      product: 'sund-barrier-cream',
      userIndex: 2,
      rating: 5,
      title: 'Worth the price',
      body: 'Expensive, but the 100ml lasts me about five months and I use it nightly.',
      status: 'approved',
    },
    {
      product: 'halvor-hydrating-serum',
      userIndex: 1,
      rating: 4,
      title: 'Good under everything',
      body: 'Very light, absorbs in seconds. I do not think it does much on its own but it makes my moisturiser work better in air conditioning.',
      status: 'approved',
    },
    {
      product: 'aurora-daily-fluid-spf50',
      userIndex: 0,
      rating: 5,
      title: 'The first SPF I actually reapply',
      body: 'No cast, no pilling, and it does not slide off in Colombo humidity. I have bought the twin pack twice.',
      status: 'approved',
    },
    {
      product: 'aurora-daily-fluid-spf50',
      userIndex: 2,
      rating: 4,
      title: 'Great, slight sheen',
      body: 'Leaves a very slight sheen on me which I do not mind, but oilier skin might want to powder over it.',
      status: 'approved',
    },
    {
      product: 'kvist-treeline',
      userIndex: 1,
      rating: 5,
      title: 'Not like anything else I own',
      body: 'Dry and cold and a bit strange for the first ten minutes, then it settles into something really comfortable. Lasts about six hours on me.',
      status: 'approved',
    },
    {
      product: 'nordkap-cabin-candle',
      userIndex: 0,
      rating: 5,
      title: 'Smells like a real fire',
      body: 'Genuinely smells like woodsmoke rather than a candle pretending to. Burns evenly too.',
      status: 'approved',
    },
    {
      product: 'halvor-night-oil',
      userIndex: 2,
      rating: 4,
      title: 'A little goes a long way',
      body: 'Three drops is plenty for my whole face. Warm and slightly nutty smelling. The bottle will clearly last a year.',
      status: 'approved',
    },
    {
      product: 'sund-light-gel-moisturiser',
      userIndex: 1,
      rating: 5,
      title: 'Perfect for humidity',
      body: 'The only moisturiser I have found that does not feel like a layer of plastic in this weather.',
      status: 'approved',
    },
    {
      product: 'bjork-body-wash',
      userIndex: 0,
      rating: 4,
      title: 'Beautiful scent, glass is heavy',
      body: 'The juniper is fantastic. Just be careful with the glass bottle in a wet shower — I switched to keeping the refill pouch in a plastic dispenser.',
      status: 'approved',
    },
    {
      product: 'lume-skin-tint',
      userIndex: 2,
      rating: 4,
      title: 'Very sheer',
      body: 'Manage your expectations — this evens things out but it will not cover anything. As a no-makeup makeup it is excellent.',
      status: 'approved',
    },
    {
      product: 'sund-overnight-mask',
      userIndex: 0,
      rating: 3,
      title: 'Good but too rich for me',
      body: 'Works exactly as described, I just find it too heavy for nightly use in this climate. Probably better in a dry winter.',
      status: 'pending',
    },
  ];

  for (const r of reviewSpecs) {
    const productId = productBySlug.get(r.product);
    const userId = customerRows[r.userIndex]?.id;
    if (!productId || !userId) continue;
    await db.insert(s.reviews).values({
      productId,
      userId,
      rating: r.rating,
      title: r.title,
      body: r.body,
      // Seeded reviews are marked verified only where a seeded order exists;
      // the recompute below reflects only approved rows.
      verifiedPurchase: r.status === 'approved' && r.userIndex === 0,
      status: r.status,
      moderatedBy: r.status === 'approved' ? ownerId : null,
      moderatedAt: r.status === 'approved' ? new Date() : null,
    });
  }

  // Recompute the denormalised rating aggregates from approved rows only.
  await db.execute(raw`
    UPDATE products p
       SET rating_average = COALESCE(agg.avg, 0),
           rating_count   = COALESCE(agg.count, 0)
      FROM (
        SELECT product_id, AVG(rating)::real AS avg, COUNT(*)::int AS count
          FROM reviews WHERE status = 'approved' GROUP BY product_id
      ) agg
     WHERE p.id = agg.product_id
  `);

  /* --- promotions -------------------------------------------------------- */
  console.warn('Seeding promotions…');
  await db.insert(s.promotions).values([
    {
      code: 'WELCOME10',
      name: 'Welcome — 10% off',
      description: 'Ten percent off a first order over $50.',
      type: 'percentage',
      scope: 'order',
      value: 10,
      minimumSubtotal: 5000,
      maximumDiscount: 300000,
      usageLimitPerCustomer: 1,
      enabled: true,
      startsAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 30),
    },
    {
      code: 'FREEDELIVERY',
      name: 'Free island-wide delivery',
      description: 'Free standard delivery on orders over $100.',
      type: 'free_shipping',
      scope: 'order',
      value: 0,
      minimumSubtotal: 10000,
      enabled: true,
    },
    {
      code: 'WINTER1500',
      name: 'The Winter Edit — $15 off',
      description: 'Fixed discount on The Winter Edit collection.',
      type: 'fixed_amount',
      scope: 'collection',
      value: 1500,
      minimumSubtotal: 8000,
      targetIds: [collectionBySlug.get('the-winter-edit')!],
      enabled: true,
      endsAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 45),
    },
    {
      code: 'EXPIRED20',
      name: 'Lapsed campaign code',
      description: 'Kept in the seed so expiry handling can be tested.',
      type: 'percentage',
      scope: 'order',
      value: 20,
      enabled: true,
      startsAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 60),
      endsAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 10),
    },
  ]);

  /* --- editorial --------------------------------------------------------- */
  console.warn('Seeding editorial and campaigns…');

  const topicRows = await db
    .insert(s.articleTopics)
    .values([
      {
        name: 'Routines',
        slug: 'routines',
        description: 'How to build one, and when to leave it alone.',
        sortOrder: 1,
      },
      {
        name: 'Ingredients',
        slug: 'ingredients',
        description: 'Plain-language explanations, no marketing.',
        sortOrder: 2,
      },
      {
        name: 'Brand Stories',
        slug: 'brand-stories',
        description: 'The people and studios behind the range.',
        sortOrder: 3,
      },
      {
        name: 'Guides',
        slug: 'guides',
        description: 'Seasonal and gifting edits.',
        sortOrder: 4,
      },
    ])
    .returning({ id: s.articleTopics.id, slug: s.articleTopics.slug });
  const topicBySlug = new Map(topicRows.map((t) => [t.slug, t.id]));

  const articleSpecs = [
    {
      slug: 'a-winter-routine-that-survives-air-conditioning',
      title: 'A winter routine that survives air conditioning',
      topic: 'routines',
      excerpt:
        'Sri Lanka does not have a winter, but offices do. A short guide to keeping skin comfortable in permanently conditioned air.',
      image: 'article-winter-routine',
      dark: false,
      featured: true,
      readingMinutes: 6,
      products: [
        'halvor-hydrating-serum',
        'sund-barrier-cream',
        'sund-light-gel-moisturiser',
      ],
      body: [
        {
          type: 'paragraph',
          text: 'Air conditioning is a dehydrating environment in the most literal sense: it removes water from the air, and the air takes it from wherever it can. Skin that behaves perfectly well on a humid evening can feel tight and flat after eight hours at a desk.',
        },
        {
          type: 'heading',
          level: 2,
          text: 'Hydration is not the same as moisture',
        },
        {
          type: 'paragraph',
          text: 'The distinction matters because it changes what you reach for. Dehydrated skin is short of water; dry skin is short of oil. Oily skin can be — and frequently is — dehydrated. If your skin is shiny by midday and still feels tight, you are probably in this group.',
        },
        {
          type: 'paragraph',
          text: 'The practical answer is to put water somewhere it can be held, then stop it evaporating. A humectant layer on damp skin, followed by something with a little occlusive weight.',
        },
        {
          type: 'quote',
          text: 'The product that works is the one you will actually use twice a day, every day.',
          attribution: 'Nordic Lux',
        },
        { type: 'heading', level: 2, text: 'What that looks like' },
        {
          type: 'list',
          items: [
            'Cleanse without stripping — if your skin squeaks, it is too much',
            'Apply a watery serum to skin that is still damp',
            'Seal with a moisturiser matched to the weather, not to the season on the calendar',
            'Sun protection every morning, regardless of whether you go outside',
          ],
        },
        { type: 'product_grid', productIds: [], title: 'What we would use' },
        {
          type: 'paragraph',
          text: 'None of this is complicated, and none of it needs to be expensive. The most common mistake we see is not using the wrong products but using too many of them, changed too often to ever tell what is working.',
        },
      ],
    },
    {
      slug: 'how-to-read-an-ingredient-list',
      title: 'How to read an ingredient list',
      topic: 'ingredients',
      excerpt:
        'INCI lists are legally precise and almost deliberately unhelpful. Here is how to get something useful out of one.',
      image: 'article-reading-inci',
      dark: false,
      featured: true,
      readingMinutes: 8,
      products: ['halvor-niacinamide-serum', 'sund-resurfacing-lactic'],
      body: [
        {
          type: 'paragraph',
          text: 'Every cosmetic sold in most of the world carries an INCI list — International Nomenclature of Cosmetic Ingredients. It is a standardised naming system, which is genuinely useful, and it is written in a register that puts most people off immediately, which is not.',
        },
        { type: 'heading', level: 2, text: 'Order tells you a great deal' },
        {
          type: 'paragraph',
          text: 'Ingredients are listed in descending order of concentration down to one percent. After that, they can appear in any order. This single rule does most of the work: if an ingredient a product is named after appears after the preservative, there is very little of it in there.',
        },
        { type: 'heading', level: 2, text: 'What the first five usually are' },
        {
          type: 'paragraph',
          text: 'Water, a humectant such as glycerin, an emollient, an emulsifier and a thickener. This is not a sign of a cheap formula — it is what a stable cream is made of. Interesting formulation happens in the space after that, not before it.',
        },
        {
          type: 'callout',
          title: 'A note on claims',
          text: 'Nordic Lux does not make medical claims about the products it sells, and neither should an ingredient list. If a product is described as treating a condition, that is a regulated claim and worth being sceptical about.',
        },
        {
          type: 'paragraph',
          text: 'The most useful habit is a boring one: when something works for you, read its list and note what it has in common with the last thing that worked. Patterns emerge faster than you would expect.',
        },
      ],
    },
    {
      slug: 'sunscreen-in-humidity',
      title: 'The sunscreen problem nobody solves',
      topic: 'routines',
      excerpt:
        'Reapplication is where every sun-care routine falls apart. Some honest options for a climate that makes it hard.',
      image: 'article-spf-humidity',
      dark: true,
      featured: false,
      readingMinutes: 5,
      products: ['aurora-daily-fluid-spf50', 'aurora-mineral-stick-spf30'],
      body: [
        {
          type: 'paragraph',
          text: 'Almost everybody applies sunscreen once. Almost nobody applies it again. In a climate where you are moving between air conditioning and direct equatorial sun several times a day, the second application is the one that matters.',
        },
        { type: 'heading', level: 2, text: 'Why it does not happen' },
        {
          type: 'paragraph',
          text: 'Reapplying a fluid SPF over makeup means redoing your face. That is the whole reason, and no amount of being told to reapply will change it. The answer is a format that goes over the top of what you are already wearing.',
        },
        {
          type: 'list',
          items: [
            'A stick, applied in two or three passes and pressed in with fingertips',
            'A powder, if you are already using one',
            'Or simply accepting a lower total and reapplying to the exposed areas only',
          ],
        },
        {
          type: 'paragraph',
          text: 'Perfect adherence is not the goal. Reapplying to your face and the backs of your hands at lunchtime is worth more than an ideal routine you abandon in a fortnight.',
        },
      ],
    },
    {
      slug: 'layering-fragrance-in-heat',
      title: 'Wearing fragrance in heat',
      topic: 'guides',
      excerpt:
        'Warm skin projects more and holds less. What that means for how you choose and apply a scent.',
      image: 'article-fragrance-layering',
      dark: true,
      featured: false,
      readingMinutes: 4,
      products: ['kvist-treeline', 'kvist-shoreline'],
      body: [
        {
          type: 'paragraph',
          text: 'Heat changes a fragrance twice over: it accelerates evaporation, so the opening is louder and shorter, and it raises skin temperature, so everything projects further than it would in cold air.',
        },
        { type: 'heading', level: 2, text: 'Practical adjustments' },
        {
          type: 'list',
          ordered: true,
          items: [
            'Use less than you would in a cold climate — one spray usually reads as two',
            'Apply to clothing or hair as well as skin, where the composition changes more slowly',
            'Choose drier, more mineral compositions over sweet ones, which amplify in heat',
          ],
        },
        {
          type: 'paragraph',
          text: 'This is also why the same bottle can smell like a different fragrance on holiday. It is not the bottle.',
        },
      ],
    },
    {
      slug: 'a-barrier-reset',
      title: 'A barrier reset, in four steps',
      topic: 'routines',
      excerpt:
        'What to do when a routine has gone wrong and everything stings. Mostly, it is doing less.',
      image: 'article-barrier-reset',
      dark: false,
      featured: false,
      readingMinutes: 5,
      products: [
        'sund-daily-gel-cleanser',
        'sund-barrier-cream',
        'sund-overnight-mask',
      ],
      body: [
        {
          type: 'paragraph',
          text: 'The most common cause of unhappy skin we hear about is not neglect. It is enthusiasm — three actives introduced in the same fortnight, and no way to tell which one caused the problem.',
        },
        { type: 'heading', level: 2, text: 'Stop everything' },
        {
          type: 'paragraph',
          text: 'Not most things. Everything except a gentle cleanser, a plain moisturiser and sun protection. Two weeks. This is dull and it works.',
        },
        { type: 'heading', level: 2, text: 'Reintroduce one thing' },
        {
          type: 'paragraph',
          text: 'One product, twice a week, for two weeks before adding anything else. If something stings, you now know exactly what it was — which you did not before.',
        },
        {
          type: 'callout',
          text: 'If skin is broken, weeping, painful or not improving after a few weeks, this is a conversation for a dermatologist rather than a shop.',
        },
      ],
    },
    {
      slug: 'the-gifting-edit',
      title: 'The gifting edit',
      topic: 'guides',
      excerpt:
        'Considered things at a range of prices, for people whose taste you are not entirely sure of.',
      image: 'article-gifting-guide',
      dark: false,
      featured: false,
      readingMinutes: 3,
      products: [
        'nordkap-cabin-candle',
        'saga-forest-honey',
        'nordkap-bath-salts',
        'lume-lip-balm',
      ],
      body: [
        {
          type: 'paragraph',
          text: 'The safest gift is not the most neutral one. It is the one that is obviously specific about something — a single honey from a single apiary, a candle that commits to smelling like woodsmoke — because specificity reads as thought.',
        },
        { type: 'heading', level: 2, text: 'What we would send' },
        {
          type: 'paragraph',
          text: 'Skip anything shade-matched, anything scented that you have not smelled, and anything that requires a routine to be useful. Consumables are almost always the right answer.',
        },
      ],
    },
  ] as const;

  for (const [i, a] of articleSpecs.entries()) {
    const [article] = await db
      .insert(s.articles)
      .values({
        title: a.title,
        slug: a.slug,
        excerpt: a.excerpt,
        topicId: topicBySlug.get(a.topic) ?? null,
        locale: 'en',
        heroImageUrl: `/media/editorial/${a.image}.webp`,
        heroImageAlt: a.title,
        heroDark: a.dark,
        // Product grid blocks get their ids filled from the article's products.
        body: a.body.map((block) =>
          block.type === 'product_grid'
            ? {
                ...block,
                productIds: a.products.flatMap((slug) => {
                  const id = productBySlug.get(slug);
                  return id ? [id] : [];
                }),
              }
            : block,
        ) as s.ContentBlock[],
        authorName: 'The Nordic Lux Edit',
        readingMinutes: a.readingMinutes,
        status: 'published',
        featured: a.featured,
        publishedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * (i * 9 + 3)),
        seoTitle: `${a.title} | The Nordic Lux Edit`,
        seoDescription: a.excerpt,
        createdBy: ownerId,
      })
      .returning({ id: s.articles.id });

    const articleLinks = a.products.flatMap((slug, order) => {
      const productId = productBySlug.get(slug);
      return productId
        ? [{ articleId: article!.id, productId, sortOrder: order }]
        : [];
    });
    if (articleLinks.length)
      await db.insert(s.articleProducts).values(articleLinks);
  }

  /* --- campaign ---------------------------------------------------------- */
  await db.insert(s.campaigns).values([
    {
      title: 'The Quiet Season',
      slug: 'the-quiet-season',
      subtitle:
        'Fewer things, used properly. Our edit for the months of long evenings.',
      heroImageUrl: '/media/editorial/campaign-winter-quiet.webp',
      heroImageAlt: 'The Quiet Season campaign',
      heroDark: true,
      status: 'published',
      startsAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 7),
      endsAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 60),
      body: [
        {
          type: 'paragraph',
          text: 'There is a stretch of the year when the useful thing is not another product but a shorter routine done properly. The Quiet Season is our edit for it: richer textures, warmer scent, and nothing that asks much of you.',
        },
        {
          type: 'product_grid',
          title: 'The edit',
          productIds: ['the-winter-edit'].flatMap(() =>
            collectionSpecs[0]!.productSlugs.flatMap((slug) => {
              const id = productBySlug.get(slug);
              return id ? [id] : [];
            }),
          ),
        },
        { type: 'quote', text: 'Fewer things, used properly.' },
      ] as s.ContentBlock[],
      seoTitle: 'The Quiet Season | Nordic Lux',
      seoDescription: 'Our edit for the months of long evenings.',
    },
    {
      title: 'Spring Preview',
      slug: 'spring-preview',
      subtitle: 'Scheduled, not yet live — used to verify campaign windows.',
      heroImageUrl: '/media/editorial/hero-secondary.webp',
      heroDark: false,
      status: 'published',
      // Deliberately in the future so scheduling can be verified end to end.
      startsAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
      endsAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 90),
      body: [],
    },
  ]);

  /* --- site chrome ------------------------------------------------------- */
  console.warn('Seeding navigation, homepage and support content…');
  await db.insert(s.announcements).values([
    {
      message: 'Complimentary island-wide delivery on orders over $100',
      href: '/shipping',
      enabled: true,
      sortOrder: 0,
    },
    {
      message: 'The Quiet Season — our edit for long evenings',
      href: '/campaigns/the-quiet-season',
      enabled: true,
      sortOrder: 1,
    },
  ]);

  await seedNavigation(categoryBySlug, collectionBySlug);
  await seedHomepage(collectionBySlug);
  await seedSupportContent();
  await seedRoutineFinder(productBySlug, concernBySlug);
  // Sample orders name demo SKUs. Without the demo catalogue they would land
  // with null product/variant ids and prices from a currency the shop no
  // longer uses — orphaned history in what should be the operating dataset.
  // `npm run seed:sample-orders`, run after the real catalogue import, builds
  // them from whatever is genuinely in the catalogue instead.
  if (DEMO_CATALOGUE) {
    await seedOrders(customerRows, variantBySku, productBySlug);
  } else {
    console.warn('Skipping sample orders (no demo catalogue).');
    await seedNewsletterSubscriber();
  }

  const elapsed = ((Date.now() - started) / 1000).toFixed(1);
  console.warn(`\nSeed complete in ${elapsed}s`);
  console.warn('─'.repeat(64));
  console.warn(
    'DEVELOPMENT CREDENTIALS — seeded databases only, never production',
  );
  console.warn('─'.repeat(64));
  console.warn(
    `  Staff (owner)        owner@nordiclux.test      ${DEV_STAFF_PASSWORD}`,
  );
  console.warn(
    `  Staff (products)     products@nordiclux.test   ${DEV_STAFF_PASSWORD}`,
  );
  console.warn(
    `  Staff (orders)       orders@nordiclux.test     ${DEV_STAFF_PASSWORD}`,
  );
  console.warn(
    `  Staff (support)      support@nordiclux.test    ${DEV_STAFF_PASSWORD}`,
  );
  console.warn(
    `  Staff (editor)       editor@nordiclux.test     ${DEV_STAFF_PASSWORD}`,
  );
  console.warn(
    `  Customer             customer@nordiclux.test   ${DEV_CUSTOMER_PASSWORD}`,
  );
  console.warn('─'.repeat(64));
}

/* ========================================================================== */

async function seedNavigation(
  categoryBySlug: Map<string, string>,
  _collectionBySlug: Map<string, string>,
) {
  const tree: {
    label: string;
    href: string;
    badge?: string;
    children?: { label: string; href: string; column?: string }[];
  }[] = [
    {
      label: 'New',
      href: '/shop?sort=newest',
      badge: 'New',
    },
    {
      label: 'Skincare',
      href: '/category/skincare',
      children: [
        {
          label: 'Cleansers',
          href: '/category/cleansers',
          column: 'Shop by step',
        },
        {
          label: 'Serums & Treatments',
          href: '/category/serums',
          column: 'Shop by step',
        },
        {
          label: 'Moisturisers',
          href: '/category/moisturisers',
          column: 'Shop by step',
        },
        {
          label: 'Sun Care',
          href: '/category/sun-care',
          column: 'Shop by step',
        },
        { label: 'Masks', href: '/category/masks', column: 'Shop by step' },
        {
          label: 'Dryness',
          href: '/concern/dryness',
          column: 'Shop by concern',
        },
        {
          label: 'Dehydration',
          href: '/concern/dehydration',
          column: 'Shop by concern',
        },
        {
          label: 'Sensitivity',
          href: '/concern/sensitivity',
          column: 'Shop by concern',
        },
        {
          label: 'Blemishes',
          href: '/concern/blemishes',
          column: 'Shop by concern',
        },
        {
          label: 'Barrier Support',
          href: '/concern/barrier-support',
          column: 'Shop by concern',
        },
        {
          label: 'Routine Finder',
          href: '/routine-finder',
          column: 'Discover',
        },
        {
          label: 'The Winter Edit',
          href: '/collection/the-winter-edit',
          column: 'Discover',
        },
        {
          label: 'Quiet Essentials',
          href: '/collection/quiet-essentials',
          column: 'Discover',
        },
      ],
    },
    {
      label: 'Body & Hair',
      href: '/category/body',
      children: [
        { label: 'Body Wash', href: '/category/body-wash', column: 'Body' },
        { label: 'Body Care', href: '/category/body-care', column: 'Body' },
        {
          label: 'Shampoo & Conditioner',
          href: '/category/shampoo',
          column: 'Hair',
        },
        {
          label: 'Hair Treatments',
          href: '/category/hair-treatments',
          column: 'Hair',
        },
      ],
    },
    {
      label: 'Fragrance',
      href: '/category/fragrance',
      children: [
        {
          label: 'Eau de Parfum',
          href: '/category/eau-de-parfum',
          column: 'Fragrance',
        },
        {
          label: 'Home',
          href: '/category/home-fragrance',
          column: 'Fragrance',
        },
      ],
    },
    {
      label: 'Makeup',
      href: '/category/makeup',
      children: [
        { label: 'Complexion', href: '/category/complexion', column: 'Makeup' },
        { label: 'Lips', href: '/category/lips', column: 'Makeup' },
      ],
    },
    {
      label: 'Wellness & Pantry',
      href: '/category/wellness',
      children: [
        { label: 'Bath & Ritual', href: '/category/bath', column: 'Wellness' },
        { label: 'Tea & Infusions', href: '/category/tea', column: 'Pantry' },
        {
          label: 'Honey & Preserves',
          href: '/category/preserves',
          column: 'Pantry',
        },
      ],
    },
    { label: 'Brands', href: '/brands' },
    { label: 'The Edit', href: '/edit' },
  ];

  for (const [i, item] of tree.entries()) {
    const [parent] = await db
      .insert(s.navigationItems)
      .values({
        location: 'header',
        label: item.label,
        href: item.href,
        badge: item.badge ?? null,
        sortOrder: i,
      })
      .returning({ id: s.navigationItems.id });

    if (item.children?.length) {
      await db.insert(s.navigationItems).values(
        item.children.map((child, j) => ({
          location: 'header' as const,
          parentId: parent!.id,
          label: child.label,
          href: child.href,
          columnGroup: child.column ?? null,
          sortOrder: j,
        })),
      );
    }
  }
  void categoryBySlug;

  const footer: { label: string; href: string; group: string }[] = [
    { label: 'About Nordic Lux', href: '/about', group: 'Nordic Lux' },
    { label: 'Authenticity', href: '/authenticity', group: 'Nordic Lux' },
    { label: 'The Edit', href: '/edit', group: 'Nordic Lux' },
    { label: 'Brands', href: '/brands', group: 'Nordic Lux' },
    { label: 'Contact', href: '/contact', group: 'Help' },
    { label: 'Shipping', href: '/shipping', group: 'Help' },
    { label: 'Returns', href: '/returns-policy', group: 'Help' },
    { label: 'FAQ', href: '/faq', group: 'Help' },
    { label: 'Track your order', href: '/track', group: 'Help' },
    { label: 'Privacy', href: '/privacy', group: 'Legal' },
    { label: 'Terms', href: '/terms', group: 'Legal' },
    { label: 'Cookies', href: '/cookies', group: 'Legal' },
  ];
  await db.insert(s.navigationItems).values(
    footer.map((f, i) => ({
      location: 'footer' as const,
      label: f.label,
      href: f.href,
      columnGroup: f.group,
      sortOrder: i,
    })),
  );
}

async function seedHomepage(collectionBySlug: Map<string, string>) {
  await db.insert(s.homepageSections).values([
    {
      kind: 'hero',
      eyebrow: 'The Quiet Season',
      title: 'Fewer things,\nused properly.',
      description:
        'A considered edit of skincare, fragrance and pantry from small northern studios — chosen for how they are used, not for what they promise.',
      ctaLabel: 'Explore the edit',
      ctaHref: '/campaigns/the-quiet-season',
      imageUrl: '/media/editorial/hero-primary.webp',
      imageAlt: 'The Quiet Season',
      dark: true,
      sortOrder: 0,
    },
    {
      kind: 'featured_products',
      eyebrow: 'New & Noteworthy',
      title: 'Recently arrived',
      description: 'The most recent additions to the Nordic Lux range.',
      ctaLabel: 'View all new',
      ctaHref: '/shop?sort=newest',
      config: { limit: 4, filter: 'new' },
      sortOrder: 1,
    },
    {
      kind: 'concern_grid',
      eyebrow: 'Shop by concern',
      title: 'Start with what your skin is doing',
      description:
        'Grouped by how products are typically used, not by claims about results.',
      config: { limit: 6 },
      sortOrder: 2,
    },
    {
      kind: 'collection_spotlight',
      eyebrow: 'The Winter Edit',
      title: 'For the months of long evenings',
      description:
        'Richer textures, warmer scent, longer baths. The things we reach for when the air turns dry.',
      ctaLabel: 'Shop the edit',
      ctaHref: '/collection/the-winter-edit',
      imageUrl: '/media/editorial/collection-the-winter-edit.webp',
      imageAlt: 'The Winter Edit',
      dark: true,
      config: {
        collectionId: collectionBySlug.get('the-winter-edit'),
        limit: 4,
      },
      sortOrder: 3,
    },
    {
      kind: 'featured_products',
      eyebrow: 'Bestselling',
      title: 'What people come back for',
      ctaLabel: 'Shop all',
      ctaHref: '/shop',
      config: { limit: 8, filter: 'featured' },
      sortOrder: 4,
    },
    {
      kind: 'routine_finder_promo',
      eyebrow: 'Routine Finder',
      title: 'Four questions,\none honest routine.',
      description:
        'Answer a few questions about your skin and we will build a routine from what is actually in stock — with the reasoning shown for every step.',
      ctaLabel: 'Begin',
      ctaHref: '/routine-finder',
      imageUrl: '/media/editorial/routine-finder.webp',
      imageAlt: 'Routine Finder',
      dark: true,
      sortOrder: 5,
    },
    {
      kind: 'brand_marquee',
      eyebrow: 'The houses we carry',
      // Deliberately not a count: the brand list is catalogue-driven, and a
      // number baked into editorial copy goes stale the moment one is added.
      title: 'Chosen, not collected',
      ctaLabel: 'All brands',
      ctaHref: '/brands',
      sortOrder: 6,
    },
    {
      kind: 'article_row',
      eyebrow: 'The Nordic Lux Edit',
      title: 'Reading',
      description:
        'Plain-language writing on routines, ingredients and the studios we work with.',
      ctaLabel: 'All articles',
      ctaHref: '/edit',
      config: { limit: 3 },
      sortOrder: 7,
    },
    {
      kind: 'assurance_row',
      title: 'How we work',
      sortOrder: 8,
    },
    {
      kind: 'newsletter',
      eyebrow: 'Correspondence',
      title: 'Occasional letters',
      description:
        'New arrivals, restocks and the occasional piece of writing. Roughly twice a month, and easy to leave.',
      sortOrder: 9,
    },
  ]);
}

async function seedSupportContent() {
  await db.insert(s.faqs).values([
    {
      question: 'How long does delivery take?',
      answer:
        'Colombo and suburbs are typically delivered within 1–2 working days. Other areas usually arrive within 2–4 working days. You will receive tracking as soon as your order is dispatched.',
      category: 'delivery',
      sortOrder: 1,
    },
    {
      question: 'Do you deliver island-wide?',
      answer:
        'Yes. Standard delivery is available to all districts, and is complimentary on orders over $100.',
      category: 'delivery',
      sortOrder: 2,
    },
    {
      question: 'Can I change my delivery address after ordering?',
      answer:
        'If your order has not yet been dispatched, contact us as soon as possible and we will update it. Once an order is with the courier we cannot change the address.',
      category: 'delivery',
      sortOrder: 3,
    },
    {
      question: 'What is your returns window?',
      answer:
        'Unopened items in their original packaging may be returned within 14 days of delivery. Opened cosmetics cannot be returned for hygiene reasons unless the item is faulty.',
      category: 'returns',
      sortOrder: 1,
    },
    {
      question: 'My item arrived damaged. What now?',
      answer:
        'Start a return from your account within 48 hours of delivery and include a photograph. We will arrange a replacement or refund.',
      category: 'returns',
      sortOrder: 2,
    },
    {
      question: 'How do I know a product is genuine?',
      answer:
        'Nordic Lux sources directly from each brand or its appointed distributor. Batch codes on our stock match the manufacturer’s records.',
      category: 'products',
      sortOrder: 1,
    },
    {
      question: 'Can you advise on which product to choose?',
      answer:
        'We are happy to talk through textures, ingredients and how products are typically used. We cannot give medical advice or diagnose skin conditions — for that, please see a dermatologist.',
      category: 'products',
      sortOrder: 2,
    },
    {
      question: 'Do you offer samples?',
      answer:
        'We include a sample with most orders where the brand supplies them. You cannot currently choose which one.',
      category: 'products',
      sortOrder: 3,
    },
    {
      question: 'Which payment methods do you accept?',
      answer:
        'Card payments are processed by our payment provider. We never see or store your full card number.',
      category: 'payment',
      sortOrder: 1,
    },
    {
      question: 'Is my card information stored?',
      answer:
        'No. Card details are handled entirely by our payment provider. Nordic Lux stores only the last four digits and the card brand, for your reference on the order.',
      category: 'payment',
      sortOrder: 2,
    },
    {
      question: 'How do I delete my account?',
      answer:
        'You can request deletion from your account settings. We remove your personal details and keep only the order records we are required to retain for accounting purposes.',
      category: 'account',
      sortOrder: 1,
    },
  ]);

  const draft = (title: string, slug: string, paragraphs: string[]) => ({
    title,
    slug,
    status: 'published' as const,
    requiresLegalReview: true,
    body: paragraphs.map((text) => ({ type: 'paragraph' as const, text })),
    seoTitle: `${title} | Nordic Lux`,
  });

  await db.insert(s.pages).values([
    {
      title: 'About Nordic Lux',
      slug: 'about',
      status: 'published',
      requiresLegalReview: false,
      body: [
        {
          type: 'paragraph',
          text: 'Nordic Lux is a curated beauty and lifestyle house based in Weboda, Sri Lanka. We work with a deliberately small number of northern European studios and carry the products we would use ourselves.',
        },
        { type: 'heading', level: 2, text: 'What we look for' },
        {
          type: 'paragraph',
          text: 'Short ingredient lists, honest claims, and a texture worth returning to. We would rather carry eight brands properly than eighty carelessly.',
        },
        { type: 'heading', level: 2, text: 'How we describe products' },
        {
          type: 'paragraph',
          text: 'We describe how a product is used and how it feels. We do not make medical claims, and we do not promise results. Where a product suits a particular concern, that reflects how it is typically used — not a guarantee.',
        },
      ],
      seoTitle: 'About Nordic Lux',
      seoDescription:
        'A curated beauty and lifestyle house based in Weboda, Sri Lanka.',
    },
    {
      title: 'Authenticity',
      slug: 'authenticity',
      status: 'published',
      requiresLegalReview: true,
      body: [
        {
          type: 'paragraph',
          text: 'Nordic Lux sources stock directly from each brand or from its appointed regional distributor.',
        },
        {
          type: 'callout',
          title: 'Draft pending approval',
          text: 'The precise sourcing and authenticity wording on this page is a placeholder and must be confirmed by Nordic Lux before launch.',
        },
      ],
      seoTitle: 'Authenticity | Nordic Lux',
    },
    draft('Shipping', 'shipping', [
      'Standard island-wide delivery is typically 1–2 working days within Colombo and 2–4 working days elsewhere.',
      'Delivery is complimentary on orders over $100. Below that a flat standard rate applies, shown at checkout before payment.',
      'This page is a working draft. Final shipping terms, rates and courier partners must be confirmed by Nordic Lux before launch.',
    ]),
    draft('Returns', 'returns-policy', [
      'Unopened items in original packaging may be returned within 14 days of delivery.',
      'For hygiene reasons, opened cosmetics and fragrance cannot be returned unless faulty.',
      'This page is a working draft. Final returns terms must be reviewed and approved by Nordic Lux before launch.',
    ]),
    draft('Privacy Policy', 'privacy', [
      'This policy explains what personal data Nordic Lux collects, why, and how long it is kept.',
      'We collect the information needed to fulfil an order, to operate an account, and to answer support enquiries.',
      'This page is a working draft and is NOT legal advice. It must be reviewed and approved by Nordic Lux and its legal adviser before launch.',
    ]),
    draft('Terms of Service', 'terms', [
      'These terms govern the use of the Nordic Lux website and the purchase of products through it.',
      'This page is a working draft and is NOT legal advice. It must be reviewed and approved by Nordic Lux and its legal adviser before launch.',
    ]),
    draft('Cookies', 'cookies', [
      'Nordic Lux uses a small number of first-party cookies: one to keep you signed in, one to remember your shopping bag, and one to keep the site secure.',
      'We do not use third-party advertising or cross-site tracking cookies.',
      'This page is a working draft and must be confirmed against the final deployed configuration before launch.',
    ]),
  ]);
}

async function seedRoutineFinder(
  productBySlug: Map<string, string>,
  concernBySlug: Map<string, string>,
) {
  const questions = [
    {
      key: 'skin_type',
      prompt: 'How does your skin usually behave?',
      helpText: 'Think about a normal day, a few hours after cleansing.',
      kind: 'single' as const,
      options: [
        {
          value: 'dry',
          label: 'Dry',
          description: 'Tight or rough, rarely shiny',
          skinType: 'dry' as const,
        },
        {
          value: 'normal',
          label: 'Balanced',
          description: 'Comfortable most of the time',
          skinType: 'normal' as const,
        },
        {
          value: 'combination',
          label: 'Combination',
          description: 'Shiny through the centre, drier elsewhere',
          skinType: 'combination' as const,
        },
        {
          value: 'oily',
          label: 'Oily',
          description: 'Shiny across most of the face by midday',
          skinType: 'oily' as const,
        },
      ],
    },
    {
      key: 'concerns',
      prompt: 'What would you most like to work on?',
      helpText: 'Choose up to three.',
      kind: 'multiple' as const,
      options: [
        { value: 'dehydration', label: 'Dehydration', concern: 'dehydration' },
        { value: 'dryness', label: 'Dryness', concern: 'dryness' },
        { value: 'blemishes', label: 'Blemishes', concern: 'blemishes' },
        { value: 'dullness', label: 'Dullness', concern: 'dullness' },
        { value: 'uneven_tone', label: 'Uneven tone', concern: 'uneven-tone' },
        {
          value: 'barrier',
          label: 'Barrier support',
          concern: 'barrier-support',
        },
      ],
    },
    {
      key: 'sensitivity',
      prompt: 'Does your skin react easily?',
      helpText: 'To fragrance, active ingredients, or changes in weather.',
      kind: 'single' as const,
      options: [
        {
          value: 'high',
          label: 'Often',
          description: 'I stay away from fragrance and strong actives',
        },
        {
          value: 'some',
          label: 'Sometimes',
          description: 'Certain things bother me',
        },
        {
          value: 'rarely',
          label: 'Rarely',
          description: 'I can use most things',
        },
      ],
    },
    {
      key: 'routine_size',
      prompt: 'How much of a routine do you actually want?',
      helpText: 'Be honest — the routine you keep up beats the ideal one.',
      kind: 'single' as const,
      options: [
        {
          value: 'minimal',
          label: 'The essentials',
          description: 'Cleanse, moisturise, protect',
        },
        {
          value: 'considered',
          label: 'A considered routine',
          description: 'Room for one treatment step',
        },
        {
          value: 'full',
          label: 'The full ritual',
          description: 'I enjoy the process',
        },
      ],
    },
  ];

  const optionByKey = new Map<string, string>();
  for (const [i, q] of questions.entries()) {
    const [question] = await db
      .insert(s.routineQuestions)
      .values({
        key: q.key,
        prompt: q.prompt,
        helpText: q.helpText,
        kind: q.kind,
        required: true,
        enabled: true,
        sortOrder: i,
      })
      .returning({ id: s.routineQuestions.id });

    await db.insert(s.routineAnswerOptions).values(
      q.options.map((o, j) => ({
        questionId: question!.id,
        value: o.value,
        label: o.label,
        description: 'description' in o ? o.description : null,
        impliesSkinType: 'skinType' in o ? o.skinType : null,
        impliesConcernId:
          'concern' in o && o.concern
            ? (concernBySlug.get(o.concern) ?? null)
            : null,
        sortOrder: j,
      })),
    );
    for (const o of q.options)
      optionByKey.set(`${q.key}:${o.value}`, question!.id);
  }

  type Rule = {
    name: string;
    step: s.RoutineStep;
    product: string;
    conditions: {
      answers?: Record<string, string[]>;
      excludeAnswers?: Record<string, string[]>;
    };
    weight: number;
    rationale: string;
  };

  const rules: Rule[] = [
    // Cleanse
    {
      name: 'Oil cleanse for dry and balanced skin',
      step: 'cleanse',
      product: 'halvor-cleansing-oil',
      conditions: { answers: { skin_type: ['dry', 'normal', 'combination'] } },
      weight: 20,
      rationale:
        'A first cleanse that removes sunscreen without leaving skin tight — the usual starting point for drier or balanced skin.',
    },
    {
      name: 'Gel cleanse for oily and sensitive skin',
      step: 'cleanse',
      product: 'sund-daily-gel-cleanser',
      conditions: { answers: { skin_type: ['oily', 'combination'] } },
      weight: 22,
      rationale:
        'A low-foam, fragrance-free gel that suits skin which gets shiny through the day.',
    },
    {
      name: 'Gel cleanse when sensitivity is high',
      step: 'cleanse',
      product: 'sund-daily-gel-cleanser',
      conditions: { answers: { sensitivity: ['high'] } },
      weight: 26,
      rationale:
        'Fragrance-free and dye-free, which is easier to tolerate on reactive skin.',
    },

    // Treat
    {
      name: 'Hydration layer for dehydration',
      step: 'treat',
      product: 'halvor-hydrating-serum',
      conditions: { answers: { concerns: ['dehydration', 'dullness'] } },
      weight: 24,
      rationale:
        'A watery humectant layer, applied to damp skin and sealed with a moisturiser.',
    },
    {
      name: 'Niacinamide for blemishes and tone',
      step: 'treat',
      product: 'halvor-niacinamide-serum',
      conditions: { answers: { concerns: ['blemishes', 'uneven_tone'] } },
      weight: 24,
      rationale:
        'A light serum chosen for combination and oily skin that gets shiny and congested.',
    },
    {
      name: 'Night oil for dryness',
      step: 'treat',
      product: 'halvor-night-oil',
      conditions: {
        answers: {
          concerns: ['dryness'],
          routine_size: ['considered', 'full'],
        },
      },
      weight: 22,
      rationale:
        'A dry-touch berry oil as a final evening step, for skin that stays thirsty overnight.',
    },
    {
      name: 'No acids when sensitivity is high',
      step: 'treat',
      product: 'halvor-hydrating-serum',
      conditions: { answers: { sensitivity: ['high'] } },
      weight: 18,
      rationale:
        'Kept deliberately gentle — a hydrating layer rather than an exfoliant.',
    },
    {
      name: 'Weekly acid for dullness on tolerant skin',
      step: 'treat',
      product: 'sund-resurfacing-lactic',
      conditions: {
        answers: {
          concerns: ['dullness', 'uneven_tone'],
          sensitivity: ['rarely'],
        },
        excludeAnswers: { routine_size: ['minimal'] },
      },
      weight: 20,
      rationale:
        'A conservative weekly acid, suggested only where skin rarely reacts.',
    },

    // Moisturise
    {
      name: 'Barrier cream for dry and reactive skin',
      step: 'moisturise',
      product: 'sund-barrier-cream',
      conditions: { answers: { skin_type: ['dry'] } },
      weight: 24,
      rationale: 'A cushioned, fragrance-free cream for skin that runs dry.',
    },
    {
      name: 'Barrier cream for barrier support',
      step: 'moisturise',
      product: 'sund-barrier-cream',
      conditions: { answers: { concerns: ['barrier'] } },
      weight: 26,
      rationale:
        'Chosen for the stretch after over-exfoliation, when the useful thing is doing less.',
    },
    {
      name: 'Gel cream for oily and combination skin',
      step: 'moisturise',
      product: 'sund-light-gel-moisturiser',
      conditions: { answers: { skin_type: ['oily', 'combination', 'normal'] } },
      weight: 22,
      rationale:
        'A weightless gel-cream that hydrates without weight — the one we recommend in humidity.',
    },

    // Protect
    {
      name: 'Daily fluid SPF for everyone',
      step: 'protect',
      product: 'aurora-daily-fluid-spf50',
      conditions: {},
      weight: 20,
      rationale:
        'Daily sun protection is the single most useful habit in any routine.',
    },
    {
      name: 'Mineral stick where sensitivity is high',
      step: 'protect',
      product: 'aurora-mineral-stick-spf30',
      conditions: { answers: { sensitivity: ['high'] } },
      weight: 22,
      rationale:
        'A mineral filter in a format that makes reapplication over makeup realistic.',
    },

    // Mask — full routines only
    {
      name: 'Overnight mask for the full ritual',
      step: 'mask',
      product: 'sund-overnight-mask',
      conditions: {
        answers: { routine_size: ['full'], concerns: ['dryness', 'barrier'] },
      },
      weight: 18,
      rationale: 'A weekly rich layer, for routines with room for one.',
    },
  ];

  const routineRules = rules.flatMap((r) => {
    const productId = productBySlug.get(r.product);
    return productId
      ? [
          {
            name: r.name,
            step: r.step,
            productId,
            conditions: r.conditions,
            weight: r.weight,
            rationale: r.rationale,
            enabled: true,
          },
        ]
      : [];
  });
  if (routineRules.length)
    await db.insert(s.routineRecommendationRules).values(routineRules);
}

async function seedOrders(
  customers: { id: string; email: string }[],
  variantBySku: Map<string, string>,
  productBySlug: Map<string, string>,
) {
  console.warn('Seeding sample orders…');

  const address = {
    recipientName: 'Amaya Perera',
    phone: '+94771234567',
    line1: '42 Horton Place',
    line2: 'Apartment 5B',
    city: 'Colombo',
    district: 'Colombo',
    postalCode: '00700',
    country: 'LK',
  };

  const specs: {
    customerIndex: number;
    status: s.OrderStatus;
    paymentStatus: s.PaymentStatus;
    daysAgo: number;
    lines: {
      sku: string;
      productSlug: string;
      name: string;
      variant: string;
      brand: string;
      price: number;
      qty: number;
    }[];
  }[] = [
    {
      customerIndex: 0,
      status: 'delivered',
      paymentStatus: 'paid',
      daysAgo: 26,
      lines: [
        {
          sku: 'HAL-SCO-100',
          productSlug: 'halvor-cleansing-oil',
          name: 'Slow Cleansing Oil',
          variant: '100ml',
          brand: 'Halvør Atelier',
          price: 890000,
          qty: 1,
        },
        {
          sku: 'SUN-BCC-050',
          productSlug: 'sund-barrier-cream',
          name: 'Barrier Comfort Cream',
          variant: '50ml',
          brand: 'SUND Copenhagen',
          price: 1120000,
          qty: 1,
        },
      ],
    },
    {
      customerIndex: 0,
      status: 'dispatched',
      paymentStatus: 'paid',
      daysAgo: 3,
      lines: [
        {
          sku: 'AUR-DSF-050',
          productSlug: 'aurora-daily-fluid-spf50',
          name: 'Daily Sun Fluid SPF 50',
          variant: '50ml',
          brand: 'Aurora Supply Co.',
          price: 720000,
          qty: 2,
        },
      ],
    },
    {
      customerIndex: 1,
      status: 'preparing',
      paymentStatus: 'paid',
      daysAgo: 1,
      lines: [
        {
          sku: 'KVI-TRL-050',
          productSlug: 'kvist-treeline',
          name: 'Treeline Eau de Parfum',
          variant: '50ml',
          brand: 'KVIST',
          price: 2450000,
          qty: 1,
        },
        {
          sku: 'NKW-CBC-220',
          productSlug: 'nordkap-cabin-candle',
          name: 'Cabin Candle',
          variant: '220g',
          brand: 'Nordkap Wellness',
          price: 680000,
          qty: 1,
        },
      ],
    },
    {
      customerIndex: 2,
      status: 'confirmed',
      paymentStatus: 'paid',
      daysAgo: 0,
      lines: [
        {
          sku: 'SUN-LGM-050',
          productSlug: 'sund-light-gel-moisturiser',
          name: 'Light Gel Moisturiser',
          variant: '50ml',
          brand: 'SUND Copenhagen',
          price: 890000,
          qty: 1,
        },
        {
          sku: 'HAL-BHS-030',
          productSlug: 'halvor-hydrating-serum',
          name: 'Birch Hydrating Serum',
          variant: '30ml',
          brand: 'Halvør Atelier',
          price: 980000,
          qty: 1,
        },
        {
          sku: 'BJL-AHB-075',
          productSlug: 'bjork-hand-balm',
          name: 'Apothecary Hand Balm',
          variant: '75ml',
          brand: 'Björk & Linden',
          price: 380000,
          qty: 2,
        },
      ],
    },
  ];

  const statusTimeline: s.OrderStatus[] = [
    'confirmed',
    'preparing',
    'packed',
    'dispatched',
    'in_transit',
    'out_for_delivery',
    'delivered',
  ];

  for (const spec of specs) {
    const customer = customers[spec.customerIndex]!;
    const subtotal = spec.lines.reduce((sum, l) => sum + l.price * l.qty, 0);
    const shipping = subtotal >= 10000 ? 0 : 4500;
    const grandTotal = subtotal + shipping;
    const placedAt = new Date(Date.now() - spec.daysAgo * 24 * 60 * 60 * 1000);

    const [order] = await db
      .insert(s.orders)
      .values({
        reference: generateReference(),
        userId: customer.id,
        email: customer.email,
        phone: address.phone,
        status: spec.status,
        paymentStatus: spec.paymentStatus,
        subtotal,
        shippingTotal: shipping,
        grandTotal,
        shippingAddress: address,
        billingAddress: address,
        shippingMethod: 'standard',
        placedAt,
        deliveredAt:
          spec.status === 'delivered'
            ? new Date(placedAt.getTime() + 3 * 86400000)
            : null,
        createdAt: placedAt,
      })
      .returning({ id: s.orders.id });

    await db.insert(s.orderItems).values(
      spec.lines.map((l) => ({
        orderId: order!.id,
        productId: productBySlug.get(l.productSlug) ?? null,
        variantId: variantBySku.get(l.sku) ?? null,
        productName: l.name,
        variantName: l.variant,
        brandName: l.brand,
        sku: l.sku,
        imageUrl: `/media/products/${l.productSlug}.webp`,
        unitPrice: l.price,
        quantity: l.qty,
        lineTotal: l.price * l.qty,
      })),
    );

    await db.insert(s.payments).values({
      orderId: order!.id,
      provider: 'mock',
      providerReference: `mock_${generateToken().slice(0, 18)}`,
      status: spec.paymentStatus,
      amount: grandTotal,
      method: 'card',
      last4: '4242',
      capturedAt: placedAt,
    });

    // Build the tracking timeline up to whatever status the order has reached.
    const reached = statusTimeline.slice(
      0,
      statusTimeline.indexOf(spec.status) + 1,
    );
    if (reached.length > 0) {
      await db.insert(s.trackingEvents).values(
        reached.map((status, i) => ({
          orderId: order!.id,
          status,
          message: trackingMessage(status),
          location: i >= 3 ? 'Colombo' : 'Weboda',
          source: 'staff',
          occurredAt: new Date(placedAt.getTime() + i * 14 * 60 * 60 * 1000),
        })),
      );
    }

    if (
      ['dispatched', 'in_transit', 'out_for_delivery', 'delivered'].includes(
        spec.status,
      )
    ) {
      await db.insert(s.shipments).values({
        orderId: order!.id,
        carrier: 'domex',
        trackingNumber: `DMX${generateToken().slice(0, 10).toUpperCase()}`,
        dispatchedAt: new Date(placedAt.getTime() + 2 * 86400000),
        deliveredAt:
          spec.status === 'delivered'
            ? new Date(placedAt.getTime() + 3 * 86400000)
            : null,
      });
    }
  }

  await seedNewsletterSubscriber();
}

/** A newsletter subscriber, so the unsubscribe path has something to act on. */
async function seedNewsletterSubscriber() {
  const unsubToken = generateToken();
  await db.insert(s.newsletterSubscribers).values({
    email: 'reader@nordiclux.test',
    source: 'footer',
    unsubscribeTokenHash: hashToken(unsubToken),
  });
}

function trackingMessage(status: s.OrderStatus): string {
  switch (status) {
    case 'confirmed':
      return 'Order confirmed and payment received.';
    case 'preparing':
      return 'Being prepared at our Weboda studio.';
    case 'packed':
      return 'Packed and awaiting collection.';
    case 'dispatched':
      return 'Handed to the courier.';
    case 'in_transit':
      return 'In transit.';
    case 'out_for_delivery':
      return 'Out for delivery.';
    case 'delivered':
      return 'Delivered.';
    default:
      return '';
  }
}

try {
  await main();
} catch (error) {
  console.error('\nSeed failed:', error);
  process.exitCode = 1;
} finally {
  await connection.end();
}
