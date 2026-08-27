import 'server-only';
import { asc, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  brands,
  products,
  routineAnswerOptions,
  routineQuestions,
  routineRecommendationRules,
} from '@/lib/db/schema';
import type { RoutineStep } from '@/lib/db/schema';

/** Routine Finder read models for the admin. */

export async function listRoutineQuestions() {
  const [questions, options] = await Promise.all([
    db.select().from(routineQuestions).orderBy(asc(routineQuestions.sortOrder)),
    db
      .select()
      .from(routineAnswerOptions)
      .orderBy(asc(routineAnswerOptions.sortOrder)),
  ]);

  return questions.map((question) => ({
    ...question,
    options: options.filter((option) => option.questionId === question.id),
  }));
}

export type AdminRoutineRule = {
  id: string;
  name: string;
  step: RoutineStep;
  productId: string;
  productName: string;
  brandName: string;
  conditions: Record<string, unknown>;
  weight: number;
  rationale: string | null;
  enabled: boolean;
};

export async function listRoutineRules(): Promise<AdminRoutineRule[]> {
  return db
    .select({
      id: routineRecommendationRules.id,
      name: routineRecommendationRules.name,
      step: routineRecommendationRules.step,
      productId: routineRecommendationRules.productId,
      productName: products.name,
      brandName: brands.name,
      conditions: routineRecommendationRules.conditions,
      weight: routineRecommendationRules.weight,
      rationale: routineRecommendationRules.rationale,
      enabled: routineRecommendationRules.enabled,
    })
    .from(routineRecommendationRules)
    .innerJoin(products, eq(products.id, routineRecommendationRules.productId))
    .innerJoin(brands, eq(brands.id, products.brandId))
    .orderBy(
      asc(routineRecommendationRules.step),
      asc(routineRecommendationRules.name),
    );
}

/**
 * Enabled rule counts per step.
 *
 * A step with none is a hole in every routine that reaches it, so the number
 * is worth showing next to the step rather than buried in the list.
 */
export async function routineRuleCoverage(): Promise<Record<string, number>> {
  const rows = await db
    .select({
      step: routineRecommendationRules.step,
      count: sql<number>`COUNT(*) FILTER (WHERE ${routineRecommendationRules.enabled})::int`,
    })
    .from(routineRecommendationRules)
    .groupBy(routineRecommendationRules.step);
  return Object.fromEntries(rows.map((row) => [row.step, row.count]));
}
