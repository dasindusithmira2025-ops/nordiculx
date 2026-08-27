import './load-env';
import { drizzle } from 'drizzle-orm/postgres-js';
import { and, eq, isNotNull, isNull, sql as raw } from 'drizzle-orm';
import postgres from 'postgres';
import * as s from '@/lib/db/schema';

/**
 * Derives Routine Finder rules from the catalogue's own classification.
 *
 * The seeded rules named demo products by slug, so importing the real
 * catalogue left `routine_recommendation_rules` empty and the quiz returned an
 * empty routine — a customer-facing dead end that no test caught, because the
 * tests ran against the demo catalogue.
 *
 * Nothing here is invented: every rule reads `products.routine_step`,
 * `products.suitable_skin_types` and the `product_concerns` links that the
 * migration already established. Staff retune the result in
 * /admin/routine-finder; this only guarantees a working baseline.
 *
 *   npm run routine:rules            replace generated rules
 *   npm run routine:rules -- --dry-run
 *
 * Generated rules are marked in `name` so a re-run replaces only its own
 * output and never a rule a member of staff wrote by hand.
 */
const GENERATED = '[auto]';

/** Concern slugs the questionnaire actually offers, keyed by its answer value. */
const CONCERN_FOR_ANSWER: Record<string, string> = {
  dehydration: 'dehydration',
  dryness: 'dryness',
  blemishes: 'blemishes',
  dullness: 'dullness',
  uneven_tone: 'uneven-tone',
  barrier: 'barrier-support',
};

/**
 * How much of a routine each step belongs to. A minimal routine is cleanse /
 * moisturise / protect; extras only appear once the visitor asked for them.
 */
const SIZE_FOR_STEP: Record<string, string[] | null> = {
  cleanse: null,
  moisturise: null,
  protect: null,
  treat: ['considered', 'full'],
  tone: ['considered', 'full'],
  mask: ['full'],
  body: ['full'],
  hair: ['full'],
  fragrance: ['full'],
  wellness: ['full'],
};

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set.');
  process.exit(1);
}
const connection = postgres(url, { max: 1 });
const db = drizzle(connection, { schema: s, casing: 'snake_case' });

const DRY_RUN = process.argv.includes('--dry-run');

type Rule = typeof s.routineRecommendationRules.$inferInsert;

async function main() {
  const products = await db
    .select({
      id: s.products.id,
      name: s.products.name,
      step: s.products.routineStep,
      skinTypes: s.products.suitableSkinTypes,
    })
    .from(s.products)
    .where(
      and(
        eq(s.products.status, 'published'),
        isNull(s.products.deletedAt),
        isNotNull(s.products.routineStep),
      ),
    );

  const concernLinks = await db
    .select({ productId: s.productConcerns.productId, slug: s.concerns.slug })
    .from(s.productConcerns)
    .innerJoin(s.concerns, eq(s.concerns.id, s.productConcerns.concernId));

  const concernsByProduct = new Map<string, Set<string>>();
  for (const link of concernLinks) {
    if (!concernsByProduct.has(link.productId))
      concernsByProduct.set(link.productId, new Set());
    concernsByProduct.get(link.productId)!.add(link.slug);
  }

  const rules: Rule[] = [];

  for (const product of products) {
    const step = product.step!;
    const size = SIZE_FOR_STEP[step] ?? null;
    /** Applied to every rule for this product so a step cannot leak into a
     *  routine the visitor did not ask for. */
    const sizeCondition: Record<string, string[]> = size
      ? { routine_size: size }
      : {};

    // Baseline: the product is a valid choice for its step. Low weight, so any
    // concern or skin-type match outranks it — but never zero candidates.
    rules.push({
      name: `${GENERATED} ${product.name} — ${step}`,
      step,
      productId: product.id,
      conditions: { answers: sizeCondition },
      weight: 5,
      rationale: null,
      enabled: true,
    });

    if (product.skinTypes.length > 0) {
      rules.push({
        name: `${GENERATED} ${product.name} — skin type`,
        step,
        productId: product.id,
        conditions: {
          answers: {
            ...sizeCondition,
            skin_type: [...product.skinTypes] as string[],
          },
        },
        weight: 12,
        rationale: 'Formulated for how your skin behaves day to day.',
        enabled: true,
      });
    }

    const concerns = concernsByProduct.get(product.id) ?? new Set<string>();

    for (const [answer, slug] of Object.entries(CONCERN_FOR_ANSWER)) {
      if (!concerns.has(slug)) continue;
      rules.push({
        name: `${GENERATED} ${product.name} — ${answer}`,
        step,
        productId: product.id,
        conditions: { answers: { ...sizeCondition, concerns: [answer] } },
        weight: 20,
        rationale: 'Chosen for the concern you told us about.',
        enabled: true,
      });
    }

    // Sensitivity is a catalogue concern but not a quiz concern: it maps onto
    // the separate "does your skin react easily" question instead.
    if (concerns.has('sensitivity')) {
      rules.push({
        name: `${GENERATED} ${product.name} — sensitivity`,
        step,
        productId: product.id,
        conditions: {
          answers: { ...sizeCondition, sensitivity: ['high', 'some'] },
        },
        weight: 16,
        rationale: 'Gentle enough for skin that reacts easily.',
        enabled: true,
      });
    }
  }

  const byStep = new Map<string, number>();
  for (const rule of rules)
    byStep.set(rule.step, (byStep.get(rule.step) ?? 0) + 1);

  if (DRY_RUN) {
    console.warn(
      [
        '[dry run] no rows written',
        `  products classified: ${products.length}`,
        `  rules planned:       ${rules.length}`,
        ...[...byStep].map(([step, n]) => `    ${step.padEnd(12)} ${n}`),
      ].join('\n'),
    );
    await connection.end();
    return;
  }

  await db.transaction(async (tx) => {
    await tx
      .delete(s.routineRecommendationRules)
      .where(raw`${s.routineRecommendationRules.name} LIKE ${GENERATED + '%'}`);
    if (rules.length)
      await tx.insert(s.routineRecommendationRules).values(rules);
  });

  console.warn(
    [
      `Generated ${rules.length} routine rules for ${products.length} products`,
      ...[...byStep].map(([step, n]) => `  ${step.padEnd(12)} ${n}`),
    ].join('\n'),
  );
  await connection.end();
}

main().catch(async (error) => {
  console.error(error);
  await connection.end();
  process.exit(1);
});
