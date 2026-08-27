import { describe, expect, it } from 'vitest';
import {
  isComplete,
  parseAnswers,
  parseConfirmed,
  pendingQuestionIndex,
  type RoutineQuestionView,
} from '@/lib/routine';

/**
 * Quiz navigation and answer parsing.
 *
 * The whole quiz is driven by the query string, which means a hand-edited URL is
 * untrusted input. These pin both the trust boundary and the one piece of flow
 * logic that is easy to get wrong: a multi-select question must not advance the
 * moment its first option is ticked, or a second choice is unreachable.
 */

const question = (
  over: Partial<RoutineQuestionView> & Pick<RoutineQuestionView, 'key'>,
): RoutineQuestionView => ({
  id: over.key,
  prompt: over.key,
  helpText: null,
  kind: 'single',
  required: true,
  options: [],
  ...over,
});

const QUESTIONS: RoutineQuestionView[] = [
  question({
    key: 'skin_type',
    options: [
      { id: '1', value: 'dry', label: 'Dry', description: null },
      { id: '2', value: 'oily', label: 'Oily', description: null },
    ],
  }),
  question({
    key: 'concerns',
    kind: 'multiple',
    options: [
      { id: '3', value: 'dryness', label: 'Dryness', description: null },
      { id: '4', value: 'barrier', label: 'Barrier', description: null },
    ],
  }),
  question({
    key: 'routine_size',
    options: [{ id: '5', value: 'full', label: 'Full', description: null }],
  }),
];

describe('parseAnswers', () => {
  it('keeps only values the question actually offers', () => {
    const answers = parseAnswers(QUESTIONS, {
      skin_type: 'dry',
      concerns: ['dryness', 'invented'],
    });
    expect(answers).toEqual({ skin_type: ['dry'], concerns: ['dryness'] });
  });

  it('drops a question whose every value was invented', () => {
    expect(parseAnswers(QUESTIONS, { skin_type: 'purple' })).toEqual({});
  });

  it('collapses a single-choice question to one value', () => {
    // Otherwise a crafted URL could make every skin-type rule fire at once.
    const answers = parseAnswers(QUESTIONS, { skin_type: ['dry', 'oily'] });
    expect(answers.skin_type).toEqual(['dry']);
  });

  it('accepts a multi-select as repeats or as a comma list', () => {
    expect(
      parseAnswers(QUESTIONS, { concerns: ['dryness', 'barrier'] }).concerns,
    ).toEqual(['dryness', 'barrier']);
    expect(
      parseAnswers(QUESTIONS, { concerns: 'dryness,barrier' }).concerns,
    ).toEqual(['dryness', 'barrier']);
  });

  it('de-duplicates repeated values', () => {
    expect(
      parseAnswers(QUESTIONS, { concerns: ['dryness', 'dryness'] }).concerns,
    ).toEqual(['dryness']);
  });
});

describe('parseConfirmed', () => {
  it('keeps only real question keys', () => {
    const confirmed = parseConfirmed(QUESTIONS, {
      confirmed: ['concerns', 'not_a_question'],
    });
    expect([...confirmed]).toEqual(['concerns']);
  });

  it('is empty when absent', () => {
    expect(parseConfirmed(QUESTIONS, {}).size).toBe(0);
  });
});

describe('pendingQuestionIndex', () => {
  const none = new Set<string>();

  it('starts at the first question', () => {
    expect(pendingQuestionIndex(QUESTIONS, {}, none)).toBe(0);
  });

  it('advances past an answered single-choice question', () => {
    expect(pendingQuestionIndex(QUESTIONS, { skin_type: ['dry'] }, none)).toBe(
      1,
    );
  });

  it('stays on a multi-select until it is confirmed', () => {
    // The defect this exists for: advancing here made a second concern
    // impossible to choose.
    const answers = { skin_type: ['dry'], concerns: ['dryness'] };
    expect(pendingQuestionIndex(QUESTIONS, answers, none)).toBe(1);
    expect(
      pendingQuestionIndex(QUESTIONS, answers, new Set(['concerns'])),
    ).toBe(2);
  });

  it('returns -1 once every required question is satisfied', () => {
    expect(
      pendingQuestionIndex(
        QUESTIONS,
        {
          skin_type: ['dry'],
          concerns: ['dryness'],
          routine_size: ['full'],
        },
        new Set(['concerns']),
      ),
    ).toBe(-1);
  });

  it('ignores a confirmation for a question with no answer', () => {
    expect(
      pendingQuestionIndex(
        QUESTIONS,
        { skin_type: ['dry'] },
        new Set(['concerns']),
      ),
    ).toBe(1);
  });

  it('skips an optional question that was left blank', () => {
    const withOptional = [
      ...QUESTIONS,
      question({ key: 'extra', required: false }),
    ];
    expect(
      pendingQuestionIndex(
        withOptional,
        {
          skin_type: ['dry'],
          concerns: ['dryness'],
          routine_size: ['full'],
        },
        new Set(['concerns']),
      ),
    ).toBe(-1);
  });
});

describe('isComplete', () => {
  it('is true when every required question has an answer', () => {
    // Confirmation is deliberately not required here, so a shared link with all
    // the answers in it renders the routine instead of re-asking.
    expect(
      isComplete(QUESTIONS, {
        skin_type: ['dry'],
        concerns: ['dryness'],
        routine_size: ['full'],
      }),
    ).toBe(true);
  });

  it('is false while anything required is missing', () => {
    expect(isComplete(QUESTIONS, { skin_type: ['dry'] })).toBe(false);
  });
});
