import type { Metadata } from 'next';
import Link from 'next/link';
import {
  getRoutineQuestions,
  getRoutineRules,
  isComplete,
  parseAnswers,
  parseConfirmed,
  pendingQuestionIndex,
} from '@/lib/routine';
import {
  candidateProductIds,
  rankCandidates,
  resolveRoutine,
} from '@/lib/routine/engine';
import { getProductsByIds } from '@/lib/catalogue/products';
import { currentUser } from '@/lib/auth';
import { trackEvent } from '@/lib/analytics';
import { getWishlistProductIds } from '@/lib/wishlist';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/ui/display';
import { ButtonLink } from '@/components/ui/button';
import { RoutineQuiz } from '@/components/routine/quiz';
import { RoutineResult } from '@/components/routine/result';
import { SaveRoutine } from '@/components/routine/save-routine';

export const metadata: Metadata = {
  title: 'Routine finder — Nordic Lux',
  description:
    'Four questions, and a routine built from what we actually carry — with the reasoning for each step.',
  alternates: { canonical: '/routine-finder' },
};

/**
 * Routine Finder.
 *
 * Answers live in the query string, so the quiz needs no client state, works
 * before hydration, and a completed routine is already a shareable URL. The
 * page shows the first unanswered question, or the result once every required
 * question has an answer.
 *
 * Nothing is written to the database just for viewing a result — the recommended
 * routine is a pure function of the answers. Saving is an explicit action, which
 * keeps `routine_results` free of rows from abandoned quizzes.
 */
export default async function RoutineFinderPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const questions = await getRoutineQuestions();

  if (questions.length === 0) {
    return (
      <>
        <PageHeader
          eyebrow="Guidance"
          title="Routine finder"
          trail={[{ label: 'Routine finder', href: '/routine-finder' }]}
        />
        <div className="page-x mx-auto max-w-(--container-page) pb-28">
          <EmptyState
            title="The questionnaire is not published yet"
            description="Browsing by concern gets you to the same place in the meantime."
            action={<ButtonLink href="/concern">Shop by concern</ButtonLink>}
          />
        </div>
      </>
    );
  }

  const answers = parseAnswers(questions, params);
  const confirmed = parseConfirmed(questions, params);

  // Completeness is judged on answers alone, so a shared link with every answer
  // in it goes straight to the routine rather than re-asking for confirmations
  // the recipient never gave.
  if (!isComplete(questions, answers)) {
    const index = pendingQuestionIndex(questions, answers, confirmed);
    const question = questions[index]!;

    // The start is the first question with nothing answered yet; later
    // questions are progress through the same quiz, not new starts.
    if (Object.keys(answers).length === 0) {
      await trackEvent('routine_finder_start', undefined, {
        path: '/routine-finder',
      });
    }

    return (
      <>
        <PageHeader
          eyebrow="Guidance"
          title="Routine finder"
          description="Four questions. We will suggest a routine from what we actually carry, and say why for each step."
          trail={[{ label: 'Routine finder', href: '/routine-finder' }]}
        />
        <div className="page-x mx-auto max-w-(--container-page) pb-28">
          <RoutineQuiz
            questions={questions}
            answers={answers}
            confirmed={confirmed}
            question={question}
            index={index}
          />
        </div>
      </>
    );
  }

  const rules = await getRoutineRules();
  const ranked = rankCandidates(rules, answers);
  const ids = candidateProductIds(ranked);

  const [candidates, user] = await Promise.all([
    ids.length > 0 ? getProductsByIds(ids) : Promise.resolve([]),
    currentUser(),
  ]);

  const byId = new Map(candidates.map((p) => [p.id, p]));

  // Availability means both "we resolved a product" and "it is sellable" — a
  // rule can point at a product that has since been unpublished.
  const routine = resolveRoutine(
    ranked,
    (id) => byId.get(id)?.inStock ?? false,
  );

  const steps = routine.flatMap(({ step, candidate }) => {
    const product = byId.get(candidate.productId);
    return product ? [{ step, product, rationale: candidate.rationale }] : [];
  });

  const total = steps.reduce((sum, s) => sum + s.product.effectivePrice, 0);

  // How many steps a completed routine produced — the number that says whether
  // the rules actually cover the catalogue. No answers are recorded: a full set
  // of them is close to a profile.
  await trackEvent(
    'routine_finder_complete',
    { steps: steps.length },
    { path: '/routine-finder' },
  );

  const wishlisted = user
    ? await getWishlistProductIds(user.id)
    : new Set<string>();

  return (
    <>
      <PageHeader
        eyebrow="Your routine"
        title="What we would suggest"
        description="Built from your answers and what is in stock. Each step says why it was chosen."
        trail={[{ label: 'Routine finder', href: '/routine-finder' }]}
        aside={
          <Link
            href="/routine-finder"
            className="eyebrow text-fg-subtle hover:text-fg link-underline"
          >
            Start again
          </Link>
        }
      />

      <div className="page-x mx-auto max-w-(--container-page) pb-28">
        <RoutineResult steps={steps} total={total} wishlisted={wishlisted} />

        {steps.length > 0 ? (
          <div className="border-line section-y border-t">
            <SaveRoutine
              answers={answers}
              recommendations={steps.map((s) => ({
                step: s.step,
                productId: s.product.id,
                ...(s.rationale ? { rationale: s.rationale } : {}),
              }))}
              defaultEmail={user?.email}
            />
          </div>
        ) : null}
      </div>
    </>
  );
}
