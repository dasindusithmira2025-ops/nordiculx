import Link from 'next/link';
import { cn } from '@/lib/cn';
// Type-only imports, so the server-only marker on the query module is erased
// rather than pulled into any bundle.
import type { RoutineAnswers } from '@/lib/routine/engine';
import type { RoutineQuestionView } from '@/lib/routine';
import { CheckIcon } from '@/components/ui/icons';

/**
 * The questionnaire, one question per screen.
 *
 * State lives entirely in the query string, like every other listing in this
 * app: each choice is a `<Link>`, so the quiz works with no JavaScript, every
 * step is shareable, and Back undoes exactly one answer. There is no client
 * state machine to get out of step with the URL.
 *
 * Single-choice questions advance on selection. Multi-select ones must not —
 * advancing on the first tick would make a second choice unreachable — so they
 * toggle in place and carry an explicit confirmation in `confirmed`.
 */

type QuizUrlState = {
  answers: RoutineAnswers;
  confirmed: Set<string>;
};

/** Rebuilds the quiz URL from answers plus confirmations. */
function quizHref(
  state: QuizUrlState,
  patch: {
    answers?: Record<string, string[] | null>;
    confirm?: string;
    unconfirm?: string;
  } = {},
): string {
  const answers: RoutineAnswers = { ...state.answers };
  for (const [key, value] of Object.entries(patch.answers ?? {})) {
    if (value === null || value.length === 0) delete answers[key];
    else answers[key] = value;
  }

  const confirmed = new Set(state.confirmed);
  if (patch.confirm) confirmed.add(patch.confirm);
  if (patch.unconfirm) confirmed.delete(patch.unconfirm);
  // A confirmation for a question with no answer left is meaningless.
  for (const key of [...confirmed]) {
    if (!answers[key]?.length) confirmed.delete(key);
  }

  const params = new URLSearchParams();
  for (const [key, values] of Object.entries(answers)) {
    for (const value of values) params.append(key, value);
  }
  for (const key of confirmed) params.append('confirmed', key);

  const qs = params.toString();
  return qs ? `/routine-finder?${qs}` : '/routine-finder';
}

function Progress({ current, total }: { current: number; total: number }) {
  return (
    <div>
      <p className="eyebrow text-fg-subtle">
        Question {current} of {total}
      </p>
      <div
        role="progressbar"
        aria-valuenow={current}
        aria-valuemin={1}
        aria-valuemax={total}
        aria-label="Quiz progress"
        className="bg-line mt-4 flex h-px w-full gap-0"
      >
        <span
          className="bg-fg duration-standard ease-standard block h-px transition-[width]"
          style={{ width: `${(current / total) * 100}%` }}
        />
      </div>
    </div>
  );
}

export function RoutineQuiz({
  questions,
  answers,
  confirmed,
  question,
  index,
}: {
  questions: RoutineQuestionView[];
  answers: RoutineAnswers;
  confirmed: Set<string>;
  question: RoutineQuestionView;
  index: number;
}) {
  const state: QuizUrlState = { answers, confirmed };
  const selected = answers[question.key] ?? [];
  const multiple = question.kind === 'multiple';

  /**
   * Back clears this question's answer and un-satisfies the previous one. For a
   * multi-select that means dropping its confirmation but KEEPING the ticks, so
   * returning to it shows what was already chosen rather than a blank slate.
   */
  const previous = questions[index - 1];
  const backHref = previous
    ? quizHref(state, {
        answers: {
          [question.key]: null,
          ...(previous.kind === 'multiple' ? {} : { [previous.key]: null }),
        },
        ...(previous.kind === 'multiple' ? { unconfirm: previous.key } : {}),
      })
    : null;

  return (
    <div className="mx-auto max-w-2xl">
      <Progress current={index + 1} total={questions.length} />

      <fieldset className="mt-12">
        <legend className="font-display text-display-md text-fg">
          {question.prompt}
        </legend>
        {question.helpText ? (
          <p className="text-fg-muted mt-4 text-base">{question.helpText}</p>
        ) : null}

        <ul className="mt-10 space-y-3">
          {question.options.map((option) => {
            const isSelected = selected.includes(option.value);

            // Single choice replaces and moves on; multi-select toggles here.
            const href = multiple
              ? quizHref(state, {
                  answers: {
                    [question.key]: isSelected
                      ? selected.filter((v) => v !== option.value)
                      : [...selected, option.value],
                  },
                })
              : quizHref(state, {
                  answers: { [question.key]: [option.value] },
                });

            return (
              <li key={option.id}>
                <Link
                  href={href}
                  // `aria-pressed` is only valid on a button, and these are
                  // links because each choice is a navigation. Single choice
                  // uses aria-current; multi-select state is carried as
                  // visually-hidden text, which every screen reader announces
                  // as part of the link name.
                  aria-current={!multiple && isSelected ? 'true' : undefined}
                  className={cn(
                    'group flex items-start gap-4 border px-6 py-5 transition-colors',
                    isSelected
                      ? 'border-fg bg-accent-soft'
                      : 'border-line hover:border-fg-muted',
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      'mt-0.5 flex size-4 shrink-0 items-center justify-center border transition-colors',
                      multiple ? '' : 'rounded-full',
                      isSelected
                        ? 'border-fg bg-fg'
                        : 'border-line-strong group-hover:border-fg',
                    )}
                  >
                    {isSelected ? (
                      <CheckIcon
                        width={11}
                        height={11}
                        className="text-accent-fg"
                      />
                    ) : null}
                  </span>
                  <span>
                    <span className="text-fg block text-base">
                      {option.label}
                      {multiple && isSelected ? (
                        <span className="sr-only"> (selected)</span>
                      ) : null}
                    </span>
                    {option.description ? (
                      <span className="text-fg-muted mt-1 block text-sm">
                        {option.description}
                      </span>
                    ) : null}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </fieldset>

      <div className="mt-10 flex items-center justify-between gap-6">
        {backHref ? (
          <Link
            href={backHref}
            className="eyebrow text-fg-subtle hover:text-fg"
          >
            Back
          </Link>
        ) : (
          <span />
        )}

        {multiple ? (
          // Only offer forward motion once something is chosen — a Continue that
          // silently does nothing is worse than one that is visibly inert.
          selected.length > 0 ? (
            <Link
              href={quizHref(state, { confirm: question.key })}
              className="eyebrow bg-accent text-accent-fg hover:bg-fg hover:text-surface inline-flex h-12 items-center px-7 transition-colors"
            >
              Continue
            </Link>
          ) : (
            <span
              aria-disabled
              className="eyebrow border-line text-fg-subtle inline-flex h-12 cursor-not-allowed items-center border px-7 opacity-50"
            >
              Choose at least one
            </span>
          )
        ) : null}
      </div>
    </div>
  );
}
