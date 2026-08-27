'use server';

import { z } from 'zod';
import { currentUser } from '@/lib/auth';
import { rateLimit } from '@/lib/rate-limit';
import {
  getRoutineQuestions,
  getRoutineRules,
  parseAnswers,
  saveRoutineResult,
} from '@/lib/routine';
import {
  candidateProductIds,
  rankCandidates,
  resolveRoutine,
} from '@/lib/routine/engine';
import { getProductsByIds } from '@/lib/catalogue/products';
import {
  actionError,
  actionOk,
  emailSchema,
  type ActionResult,
} from '@/lib/validation';

const payloadSchema = z.object({
  /** The answers, serialised as a query string by the form. */
  answers: z.string().max(2000),
  email: z.union([emailSchema, z.literal('')]).optional(),
});

/**
 * Saves a routine and returns its shareable code.
 *
 * The recommendations are RECOMPUTED here from the submitted answers rather than
 * accepted from the form. A client-supplied list of products would let anyone
 * write arbitrary product ids into `routine_results` — the answers are the only
 * thing the visitor is trusted to provide, and they are themselves filtered
 * against the real questionnaire by `parseAnswers`.
 */
export async function saveRoutine(
  _prev: ActionResult<{ reference: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ reference: string }>> {
  const limit = await rateLimit('routine-save', {
    limit: 10,
    windowSeconds: 600,
  });
  if (!limit.allowed) {
    return actionError('Too many saves just now. Please try again shortly.');
  }

  const parsed = payloadSchema.safeParse({
    answers: formData.get('answers') ?? '',
    email: formData.get('email') ?? '',
  });
  if (!parsed.success) {
    return actionError('That routine could not be saved.');
  }

  const questions = await getRoutineQuestions();
  const answers = parseAnswers(
    questions,
    // URLSearchParams collapses repeats; getAll preserves multi-select answers.
    Object.fromEntries(
      [...new URLSearchParams(parsed.data.answers).keys()].map((key) => [
        key,
        new URLSearchParams(parsed.data.answers).getAll(key),
      ]),
    ),
  );

  if (Object.keys(answers).length === 0) {
    return actionError('That routine could not be saved.');
  }

  const rules = await getRoutineRules();
  const ranked = rankCandidates(rules, answers);
  const ids = candidateProductIds(ranked);
  const products = ids.length > 0 ? await getProductsByIds(ids) : [];
  const byId = new Map(products.map((p) => [p.id, p]));

  const recommendations = resolveRoutine(
    ranked,
    (id) => byId.get(id)?.inStock ?? false,
  ).flatMap(({ step, candidate }) =>
    byId.has(candidate.productId)
      ? [
          {
            step,
            productId: candidate.productId,
            ...(candidate.rationale ? { rationale: candidate.rationale } : {}),
          },
        ]
      : [],
  );

  if (recommendations.length === 0) {
    return actionError('There is no routine to save yet.');
  }

  const user = await currentUser();
  const email = parsed.data.email || undefined;

  const reference = await saveRoutineResult({
    answers,
    recommendations,
    userId: user?.id ?? null,
    // A signed-in customer's account email is used in preference to whatever
    // was typed, so a saved routine is always reachable from their account.
    email: user?.email ?? email ?? null,
  });

  return actionOk({ reference });
}
