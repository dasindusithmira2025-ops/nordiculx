import 'server-only';
import { cache } from 'react';
import { and, asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  routineAnswerOptions,
  routineQuestions,
  routineRecommendationRules,
  routineResults,
} from '@/lib/db/schema';
import { generateShortCode } from '@/lib/tokens';
import type { RoutineAnswers, RoutineRuleInput } from './engine';

/**
 * Routine Finder data access.
 *
 * The questionnaire is content: questions, options and rules all live in the
 * database so merchandising can retune recommendations without a deploy. This
 * module only reads them and persists results — all the judgement lives in
 * `./engine.ts`, which is pure and unit-tested.
 */

export type RoutineQuestionView = {
  id: string;
  key: string;
  prompt: string;
  helpText: string | null;
  kind: 'single' | 'multiple' | 'scale';
  required: boolean;
  options: {
    id: string;
    value: string;
    label: string;
    description: string | null;
  }[];
};

/**
 * The enabled questionnaire, in order, with options attached.
 *
 * Two queries and a join in memory rather than one row-per-option query: the
 * questionnaire is tiny and fixed, and this keeps the option ordering explicit.
 */
export const getRoutineQuestions = cache(
  async (): Promise<RoutineQuestionView[]> => {
    const questions = await db
      .select()
      .from(routineQuestions)
      .where(eq(routineQuestions.enabled, true))
      .orderBy(asc(routineQuestions.sortOrder));

    if (questions.length === 0) return [];

    const options = await db
      .select()
      .from(routineAnswerOptions)
      .orderBy(asc(routineAnswerOptions.sortOrder));

    const byQuestion = new Map<string, RoutineQuestionView['options']>();
    for (const option of options) {
      const list = byQuestion.get(option.questionId) ?? [];
      list.push({
        id: option.id,
        value: option.value,
        label: option.label,
        description: option.description,
      });
      byQuestion.set(option.questionId, list);
    }

    return questions.map((question) => ({
      id: question.id,
      key: question.key,
      prompt: question.prompt,
      helpText: question.helpText,
      kind: question.kind,
      required: question.required,
      options: byQuestion.get(question.id) ?? [],
    }));
  },
);

export const getRoutineRules = cache(async (): Promise<RoutineRuleInput[]> => {
  const rows = await db
    .select({
      id: routineRecommendationRules.id,
      step: routineRecommendationRules.step,
      productId: routineRecommendationRules.productId,
      conditions: routineRecommendationRules.conditions,
      weight: routineRecommendationRules.weight,
      rationale: routineRecommendationRules.rationale,
    })
    .from(routineRecommendationRules)
    .where(eq(routineRecommendationRules.enabled, true));
  return rows;
});

/**
 * Parses answers out of the query string against the real questionnaire.
 *
 * Anything not offered by a question is dropped rather than trusted, so a
 * hand-edited URL cannot inject an answer value that no rule was written for —
 * and a single-choice question cannot be turned into a multi-select to make
 * every rule fire at once.
 */
export function parseAnswers(
  questions: RoutineQuestionView[],
  searchParams: Record<string, string | string[] | undefined>,
): RoutineAnswers {
  const answers: RoutineAnswers = {};

  for (const question of questions) {
    const raw = searchParams[question.key];
    if (raw === undefined) continue;

    const permitted = new Set(question.options.map((o) => o.value));
    const values = [
      ...new Set(
        (Array.isArray(raw) ? raw : [raw])
          .flatMap((v) => v.split(','))
          .map((v) => v.trim())
          .filter((v) => permitted.has(v)),
      ),
    ];

    if (values.length === 0) continue;
    // A single-choice question keeps only the first value, whatever arrived.
    answers[question.key] =
      question.kind === 'multiple' ? values : [values[0]!];
  }

  return answers;
}

/** True when every required question has an answer. */
export function isComplete(
  questions: RoutineQuestionView[],
  answers: RoutineAnswers,
): boolean {
  return questions.every(
    (question) =>
      !question.required || (answers[question.key]?.length ?? 0) > 0,
  );
}

/**
 * Multi-select questions the visitor has explicitly finished with.
 *
 * A multi-select cannot advance on selection — that would make a second choice
 * impossible, because the next render would already have moved past the
 * question. So "answered" is not enough for those; they also have to be
 * confirmed, and the confirmation lives in the URL like everything else.
 */
export function parseConfirmed(
  questions: RoutineQuestionView[],
  searchParams: Record<string, string | string[] | undefined>,
): Set<string> {
  const keys = new Set(questions.map((q) => q.key));
  const raw = searchParams.confirmed;
  const values = (Array.isArray(raw) ? raw : raw ? [raw] : [])
    .flatMap((v) => v.split(','))
    .map((v) => v.trim())
    .filter((v) => keys.has(v));
  return new Set(values);
}

/** Whether a question no longer needs the visitor's attention. */
function isSatisfied(
  question: RoutineQuestionView,
  answers: RoutineAnswers,
  confirmed: Set<string>,
): boolean {
  const answered = (answers[question.key]?.length ?? 0) > 0;
  if (!answered) return false;
  return question.kind !== 'multiple' || confirmed.has(question.key);
}

/**
 * Index of the question to show, or -1 when the questionnaire is done.
 *
 * Driven by "first unsatisfied" rather than a step counter in the URL, so a
 * hand-edited link cannot drop somebody onto question four with nothing filled
 * in.
 */
export function pendingQuestionIndex(
  questions: RoutineQuestionView[],
  answers: RoutineAnswers,
  confirmed: Set<string>,
): number {
  return questions.findIndex(
    (question) =>
      question.required && !isSatisfied(question, answers, confirmed),
  );
}

/**
 * Persists a completed routine and returns its shareable code.
 *
 * The recommendations are snapshotted alongside the answers: rules get retuned,
 * and a customer returning to their saved routine should see what they were
 * actually shown, not what the current rules would produce.
 */
export async function saveRoutineResult(input: {
  answers: RoutineAnswers;
  recommendations: { step: string; productId: string; rationale?: string }[];
  userId?: string | null;
  email?: string | null;
}): Promise<string> {
  const reference = generateShortCode();

  await db.insert(routineResults).values({
    reference,
    userId: input.userId ?? null,
    email: input.email ?? null,
    answers: input.answers,
    recommendations: input.recommendations,
  });

  return reference;
}

export const getRoutineResult = cache(async (reference: string) => {
  // Codes are fixed-length and from a known alphabet; anything else cannot be a
  // real reference, so there is no reason to ask the database.
  if (!/^[2-9A-Z]{8}$/.test(reference)) return null;

  const rows = await db
    .select()
    .from(routineResults)
    .where(and(eq(routineResults.reference, reference)))
    .limit(1);
  return rows[0] ?? null;
});
