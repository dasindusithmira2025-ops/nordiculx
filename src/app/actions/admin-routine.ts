'use server';

import { revalidatePath } from 'next/cache';
import { and, eq, ne } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db';
import {
  products,
  routineAnswerOptions,
  routineQuestions,
  routineRecommendationRules,
  routineStepEnum,
} from '@/lib/db/schema';
import { requireStaff } from '@/lib/auth';
import { recordAudit } from '@/lib/admin/audit';
import {
  actionError,
  actionOk,
  uuidSchema,
  type ActionResult,
} from '@/lib/validation';

/**
 * Routine Finder configuration.
 *
 * The quiz engine (`src/lib/routine/engine.ts`) is pure and unit-tested;
 * nothing here re-implements scoring. What staff get is the ability to reword
 * a question, reorder answers, retune a rule's weight and switch a rule off.
 *
 * What they deliberately cannot change is a question `key` or an answer
 * `value`. Those are the identifiers every rule's `conditions` refer to by
 * name, and renaming one silently stops every rule that mentions it from ever
 * firing — a quiz that returns an empty routine and no error. Adding and
 * removing whole questions is likewise out of scope: a new question has no
 * rules written against it, so it can only ever narrow results.
 */

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === '' ? null : value));

/* --- questions ------------------------------------------------------------ */

const questionSchema = z.object({
  id: uuidSchema,
  prompt: z.string().trim().min(1, 'Write the question').max(300),
  helpText: optionalText(500),
  required: z.boolean(),
  enabled: z.boolean(),
  sortOrder: z.coerce.number().int().min(0).max(99),
});

export async function saveRoutineQuestion(
  formData: FormData,
): Promise<ActionResult> {
  const actor = await requireStaff('routine.manage');

  const parsed = questionSchema.safeParse({
    id: String(formData.get('id') ?? ''),
    prompt: String(formData.get('prompt') ?? ''),
    helpText: String(formData.get('helpText') ?? ''),
    required: formData.get('required') === 'on',
    enabled: formData.get('enabled') === 'on',
    sortOrder: String(formData.get('sortOrder') ?? '0'),
  });
  if (!parsed.success) return actionError('Check the question wording.');

  const { id, ...fields } = parsed.data;

  // A required question that is switched off can never be answered, so
  // `isComplete` never returns true and the quiz cannot finish.
  if (!fields.enabled && fields.required) {
    return actionError(
      'A required question cannot be hidden. Make it optional first.',
    );
  }

  const updated = await db
    .update(routineQuestions)
    .set({ ...fields, updatedAt: new Date() })
    .where(eq(routineQuestions.id, id))
    .returning({ id: routineQuestions.id });

  if (!updated[0]) return actionError('That question could not be found.');

  await recordAudit({
    actor,
    action: 'routine.question_saved',
    entityType: 'routine_question',
    entityId: id,
  });

  revalidatePath('/admin/routine-finder');
  revalidatePath('/routine-finder');
  return actionOk();
}

/* --- answer options ------------------------------------------------------- */

const optionSchema = z.object({
  id: uuidSchema,
  label: z.string().trim().min(1, 'Write the answer').max(120),
  description: optionalText(300),
  sortOrder: z.coerce.number().int().min(0).max(99),
});

export async function saveRoutineOption(
  formData: FormData,
): Promise<ActionResult> {
  const actor = await requireStaff('routine.manage');

  const parsed = optionSchema.safeParse({
    id: String(formData.get('id') ?? ''),
    label: String(formData.get('label') ?? ''),
    description: String(formData.get('description') ?? ''),
    sortOrder: String(formData.get('sortOrder') ?? '0'),
  });
  if (!parsed.success) return actionError('Check the answer wording.');

  const { id, ...fields } = parsed.data;
  const updated = await db
    .update(routineAnswerOptions)
    .set(fields)
    .where(eq(routineAnswerOptions.id, id))
    .returning({ id: routineAnswerOptions.id });

  if (!updated[0]) return actionError('That answer could not be found.');

  await recordAudit({
    actor,
    action: 'routine.option_saved',
    entityType: 'routine_answer_option',
    entityId: id,
  });

  revalidatePath('/admin/routine-finder');
  revalidatePath('/routine-finder');
  return actionOk();
}

/* --- recommendation rules ------------------------------------------------- */

const ruleSchema = z.object({
  id: z.string(),
  name: z.string().trim().min(1, 'Name the rule').max(160),
  step: z.enum(routineStepEnum.enumValues),
  productId: uuidSchema,
  weight: z.coerce.number().int().min(1).max(100),
  rationale: optionalText(300),
  enabled: z.boolean(),
  /** JSON, exactly as the engine reads it. */
  conditions: z.string().trim().max(4000),
});

/**
 * Conditions are stored as the engine's own shape.
 *
 * Parsed and shape-checked here rather than trusted: a malformed rule does not
 * throw at render time, it silently matches nobody or everybody, which is far
 * harder to notice than a rejected save.
 */
function parseConditions(
  raw: string,
):
  | { ok: true; value: Record<string, Record<string, string[]>> }
  | { ok: false; message: string } {
  if (raw === '') return { ok: true, value: {} };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, message: 'Conditions must be valid JSON.' };
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { ok: false, message: 'Conditions must be a JSON object.' };
  }

  const out: Record<string, Record<string, string[]>> = {};
  for (const [key, group] of Object.entries(parsed)) {
    if (key !== 'answers' && key !== 'excludeAnswers') {
      return {
        ok: false,
        message: `Unknown key "${key}". Use "answers" or "excludeAnswers".`,
      };
    }
    if (typeof group !== 'object' || group === null || Array.isArray(group)) {
      return { ok: false, message: `"${key}" must be an object.` };
    }

    const bucket: Record<string, string[]> = {};
    for (const [question, values] of Object.entries(group)) {
      if (
        !Array.isArray(values) ||
        values.length === 0 ||
        values.some((value) => typeof value !== 'string')
      ) {
        // An empty list is unsatisfiable in the engine, which reads as a rule
        // that quietly never fires — reject it rather than store it.
        return {
          ok: false,
          message: `"${question}" needs a non-empty list of answer values.`,
        };
      }
      bucket[question] = values as string[];
    }
    out[key] = bucket;
  }

  return { ok: true, value: out };
}

export async function saveRoutineRule(
  formData: FormData,
): Promise<ActionResult> {
  const actor = await requireStaff('routine.manage');

  const parsed = ruleSchema.safeParse({
    id: String(formData.get('id') ?? ''),
    name: String(formData.get('name') ?? ''),
    step: formData.get('step'),
    productId: formData.get('productId'),
    weight: String(formData.get('weight') ?? '10'),
    rationale: String(formData.get('rationale') ?? ''),
    enabled: formData.get('enabled') === 'on',
    conditions: String(formData.get('conditions') ?? ''),
  });
  if (!parsed.success) {
    return actionError('Check the rule — a field is missing or out of range.');
  }

  const conditions = parseConditions(parsed.data.conditions);
  if (!conditions.ok) return actionError(conditions.message);

  // Answer keys and values are validated against the live questionnaire, so a
  // typo cannot produce a rule that never fires.
  const questions = await db
    .select({ id: routineQuestions.id, key: routineQuestions.key })
    .from(routineQuestions);
  const options = await db
    .select({
      questionId: routineAnswerOptions.questionId,
      value: routineAnswerOptions.value,
    })
    .from(routineAnswerOptions);

  const valuesByKey = new Map<string, Set<string>>();
  for (const question of questions) {
    valuesByKey.set(
      question.key,
      new Set(
        options
          .filter((option) => option.questionId === question.id)
          .map((option) => option.value),
      ),
    );
  }

  for (const group of Object.values(conditions.value)) {
    for (const [key, values] of Object.entries(group)) {
      const allowed = valuesByKey.get(key);
      if (!allowed) {
        return actionError(`No question is keyed "${key}".`);
      }
      const unknown = values.find((value) => !allowed.has(value));
      if (unknown) {
        return actionError(`"${key}" has no answer "${unknown}".`);
      }
    }
  }

  const product = await db
    .select({ id: products.id })
    .from(products)
    .where(eq(products.id, parsed.data.productId))
    .limit(1);
  if (!product[0]) return actionError('Choose a product that exists.');

  const { id, conditions: _raw, ...fields } = parsed.data;
  const row = { ...fields, conditions: conditions.value };

  if (id === '') {
    const inserted = await db
      .insert(routineRecommendationRules)
      .values(row)
      .returning({ id: routineRecommendationRules.id });
    await recordAudit({
      actor,
      action: 'routine.rule_created',
      entityType: 'routine_rule',
      entityId: inserted[0]!.id,
    });
  } else {
    if (!uuidSchema.safeParse(id).success) {
      return actionError('That rule could not be found.');
    }
    const updated = await db
      .update(routineRecommendationRules)
      .set({ ...row, updatedAt: new Date() })
      .where(eq(routineRecommendationRules.id, id))
      .returning({ id: routineRecommendationRules.id });
    if (!updated[0]) return actionError('That rule could not be found.');
    await recordAudit({
      actor,
      action: 'routine.rule_saved',
      entityType: 'routine_rule',
      entityId: id,
    });
  }

  revalidatePath('/admin/routine-finder');
  revalidatePath('/routine-finder');
  return actionOk();
}

export async function deleteRoutineRule(
  formData: FormData,
): Promise<ActionResult> {
  const actor = await requireStaff('routine.manage');

  const id = String(formData.get('id') ?? '');
  if (!uuidSchema.safeParse(id).success) {
    return actionError('That rule could not be found.');
  }

  const rows = await db
    .select({ step: routineRecommendationRules.step })
    .from(routineRecommendationRules)
    .where(eq(routineRecommendationRules.id, id))
    .limit(1);
  if (!rows[0]) return actionError('That rule could not be found.');

  // A step with no enabled rules left produces a routine with a hole in it,
  // which reads to a customer as a broken quiz rather than a merchandising
  // decision. Deleting the last one is refused; disabling it is not.
  const siblings = await db
    .select({ id: routineRecommendationRules.id })
    .from(routineRecommendationRules)
    .where(
      and(
        eq(routineRecommendationRules.step, rows[0].step),
        eq(routineRecommendationRules.enabled, true),
        ne(routineRecommendationRules.id, id),
      ),
    )
    .limit(1);

  if (!siblings[0]) {
    return actionError(
      `That is the last rule for "${rows[0].step}". Disable it instead, or add a replacement first.`,
    );
  }

  await db
    .delete(routineRecommendationRules)
    .where(eq(routineRecommendationRules.id, id));

  await recordAudit({
    actor,
    action: 'routine.rule_deleted',
    entityType: 'routine_rule',
    entityId: id,
  });

  revalidatePath('/admin/routine-finder');
  revalidatePath('/routine-finder');
  return actionOk();
}
