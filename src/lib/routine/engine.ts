import type { RoutineStep } from '@/lib/db/schema';

/**
 * Routine Finder scoring.
 *
 * Deliberately pure and free of database access: the questionnaire and its
 * rules are editable data, so the part that turns answers into products is the
 * part most likely to be retuned and the part that most needs to be testable
 * without a database.
 *
 * The model, from `routine_recommendation_rules`:
 *
 *   conditions.answers        every listed question must be satisfied, and a
 *                             question is satisfied when the visitor chose at
 *                             least one of its listed values
 *   conditions.excludeAnswers the rule is suppressed if the visitor chose any
 *                             listed value
 *   {}                        matches everyone (the daily-SPF rule)
 *
 * Weights from every firing rule are SUMMED per product per step, so two weak
 * reasons can legitimately outrank one strong one — that is what lets
 * merchandising express "this suits dry skin AND is fine when reactive".
 */

export type RoutineAnswers = Record<string, string[]>;

export type RoutineRuleInput = {
  id: string;
  step: RoutineStep;
  productId: string;
  conditions: {
    answers?: Record<string, string[]>;
    excludeAnswers?: Record<string, string[]>;
  };
  weight: number;
  rationale: string | null;
};

export type RoutineCandidate = {
  productId: string;
  score: number;
  /** Rationale from the highest-weighted rule that fired for this product. */
  rationale: string | null;
};

/** The order a routine is actually applied in. Drives display order. */
export const ROUTINE_STEP_ORDER: RoutineStep[] = [
  'cleanse',
  'tone',
  'treat',
  'moisturise',
  'protect',
  'mask',
  'body',
  'hair',
  'fragrance',
  'wellness',
];

export const ROUTINE_STEP_LABELS: Record<RoutineStep, string> = {
  cleanse: 'Cleanse',
  tone: 'Tone',
  treat: 'Treat',
  moisturise: 'Moisturise',
  protect: 'Protect',
  mask: 'Weekly',
  body: 'Body',
  hair: 'Hair',
  fragrance: 'Fragrance',
  wellness: 'Wellness',
};

function chosen(answers: RoutineAnswers, key: string): string[] {
  return answers[key] ?? [];
}

function intersects(a: string[], b: string[]): boolean {
  return a.some((value) => b.includes(value));
}

/**
 * Whether a rule fires for these answers.
 *
 * An unanswered question fails a positive condition — a rule that asks about
 * sensitivity must not fire for somebody who never said. It cannot, however,
 * trigger an exclusion: there is nothing to exclude on.
 */
export function ruleMatches(
  rule: RoutineRuleInput,
  answers: RoutineAnswers,
): boolean {
  const { answers: required, excludeAnswers: excluded } = rule.conditions;

  for (const [key, values] of Object.entries(required ?? {})) {
    // An empty value list is a malformed rule; treat it as unsatisfiable rather
    // than as "matches anything", which would silently recommend everything.
    if (values.length === 0) return false;
    if (!intersects(chosen(answers, key), values)) return false;
  }

  for (const [key, values] of Object.entries(excluded ?? {})) {
    if (intersects(chosen(answers, key), values)) return false;
  }

  return true;
}

/**
 * Ranked product candidates per step, best first.
 *
 * Returns candidates rather than one winner per step because the caller has to
 * apply availability: recommending something out of stock wastes the whole
 * exercise, and only the query layer knows what is sellable.
 *
 * Ordering is fully deterministic — score descending, then product id — so the
 * same answers always produce the same routine. A quiz that returned a
 * different result on a refresh would look broken.
 */
export function rankCandidates(
  rules: RoutineRuleInput[],
  answers: RoutineAnswers,
): Map<RoutineStep, RoutineCandidate[]> {
  type Accumulator = {
    score: number;
    bestWeight: number;
    rationale: string | null;
  };

  const byStep = new Map<RoutineStep, Map<string, Accumulator>>();

  for (const rule of rules) {
    if (!ruleMatches(rule, answers)) continue;

    let products = byStep.get(rule.step);
    if (!products) {
      products = new Map();
      byStep.set(rule.step, products);
    }

    const existing = products.get(rule.productId);
    if (!existing) {
      products.set(rule.productId, {
        score: rule.weight,
        bestWeight: rule.weight,
        rationale: rule.rationale,
      });
      continue;
    }

    existing.score += rule.weight;
    // The customer sees one reason, so it should be the strongest one.
    if (rule.weight > existing.bestWeight) {
      existing.bestWeight = rule.weight;
      existing.rationale = rule.rationale;
    }
  }

  const out = new Map<RoutineStep, RoutineCandidate[]>();
  for (const [step, products] of byStep) {
    const candidates = [...products.entries()]
      .map(([productId, acc]) => ({
        productId,
        score: acc.score,
        rationale: acc.rationale,
      }))
      .sort(
        (a, b) => b.score - a.score || a.productId.localeCompare(b.productId),
      );
    out.set(step, candidates);
  }
  return out;
}

/** Every product id any step might use, for a single batched lookup. */
export function candidateProductIds(
  ranked: Map<RoutineStep, RoutineCandidate[]>,
): string[] {
  const ids = new Set<string>();
  for (const candidates of ranked.values()) {
    for (const candidate of candidates) ids.add(candidate.productId);
  }
  return [...ids];
}

/**
 * Resolves one product per step, in routine order.
 *
 * `isAvailable` lets the caller prefer sellable stock. When nothing for a step
 * is available the top candidate is still returned: the card shows it as out of
 * stock, which is more useful than a routine with a silent hole in it.
 */
export function resolveRoutine(
  ranked: Map<RoutineStep, RoutineCandidate[]>,
  isAvailable: (productId: string) => boolean,
): { step: RoutineStep; candidate: RoutineCandidate }[] {
  const out: { step: RoutineStep; candidate: RoutineCandidate }[] = [];

  for (const step of ROUTINE_STEP_ORDER) {
    const candidates = ranked.get(step);
    if (!candidates || candidates.length === 0) continue;

    const pick = candidates.find((c) => isAvailable(c.productId));
    out.push({ step, candidate: pick ?? candidates[0]! });
  }

  return out;
}
