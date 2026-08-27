import { requireStaff } from '@/lib/auth';
import {
  listRoutineQuestions,
  listRoutineRules,
  routineRuleCoverage,
} from '@/lib/admin/routine';
import {
  deleteRoutineRule,
  saveRoutineOption,
  saveRoutineQuestion,
  saveRoutineRule,
} from '@/app/actions/admin-routine';
import { getPromotionTargets } from '@/lib/admin/promotions';
import { routineStepEnum } from '@/lib/db/schema';
import { ROUTINE_STEP_LABELS } from '@/lib/routine/engine';
import { Badge } from '@/components/ui/display';
import {
  adminField,
  Cell,
  NoRows,
  PageHeader,
  TabNav,
} from '@/components/admin/admin-ui';
import { RowForm } from '@/components/admin/row-form';

/**
 * Routine Finder configuration.
 *
 * Two tabs, matching the two things staff actually change: the wording of the
 * quiz, and which product wins each step. The scoring itself is code and is
 * unit-tested; this only edits its inputs.
 *
 * Question keys and answer values are shown but never editable — every rule
 * refers to them by name, and renaming one turns its rules into rules that
 * quietly never fire.
 */

const TABS = [
  { value: 'questions', label: 'Questions' },
  { value: 'rules', label: 'Recommendations' },
] as const;

const row = 'border-line border-b py-4 last:border-b-0';

export default async function AdminRoutinePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  await requireStaff('routine.manage');

  const params = await searchParams;
  const raw = Array.isArray(params.tab) ? params.tab[0] : params.tab;
  const tab = TABS.some((t) => t.value === raw) ? raw! : 'questions';

  const coverage = await routineRuleCoverage();
  const uncovered = routineStepEnum.enumValues.filter(
    (step) => !coverage[step],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Discovery"
        title="Routine Finder"
        description="The questions customers answer, and the rules that turn those answers into a routine."
        stats={[
          {
            label: 'Steps covered',
            value: `${routineStepEnum.enumValues.length - uncovered.length}/${routineStepEnum.enumValues.length}`,
          },
        ]}
      />

      <TabNav
        label="Routine sections"
        current={tab}
        items={TABS.map((t) => ({
          value: t.value,
          label: t.label,
          href: `/admin/routine-finder?tab=${t.value}`,
        }))}
      />

      {tab === 'questions' ? <Questions /> : <Rules coverage={coverage} />}
    </div>
  );
}

/* --- questions ------------------------------------------------------------ */

async function Questions() {
  const questions = await listRoutineQuestions();

  return (
    <section aria-label="Questions">
      <p className="text-fg-subtle mb-4 text-xs">
        Wording and order only. The key beside each question and the value
        beside each answer are what the recommendation rules refer to, so they
        are fixed.
      </p>

      {questions.map((question) => (
        <div key={question.id} className={row}>
          <RowForm id={question.id} action={saveRoutineQuestion}>
            <div className="mb-2 flex flex-wrap items-center gap-3">
              <code className="text-fg-subtle text-xs">{question.key}</code>
              <Badge tone="neutral">{question.kind}</Badge>
              {question.enabled ? null : <Badge tone="out">Hidden</Badge>}
            </div>

            <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,2fr)_5rem]">
              <Cell label="Question">
                <input
                  name="prompt"
                  required
                  maxLength={300}
                  defaultValue={question.prompt}
                  className={adminField}
                />
              </Cell>
              <Cell label="Help text">
                <input
                  name="helpText"
                  maxLength={500}
                  defaultValue={question.helpText ?? ''}
                  className={adminField}
                />
              </Cell>
              <Cell label="Order">
                <input
                  name="sortOrder"
                  type="number"
                  min={0}
                  defaultValue={question.sortOrder}
                  className={adminField}
                />
              </Cell>
            </div>

            <div className="mt-3 flex gap-6 text-sm">
              <label className="text-fg flex items-center gap-2">
                <input
                  type="checkbox"
                  name="enabled"
                  defaultChecked={question.enabled}
                  className="size-4"
                />
                Shown
              </label>
              <label className="text-fg flex items-center gap-2">
                <input
                  type="checkbox"
                  name="required"
                  defaultChecked={question.required}
                  className="size-4"
                />
                Must be answered
              </label>
            </div>
          </RowForm>

          <ul className="border-line mt-4 ml-4 border-l pl-4">
            {question.options.map((option) => (
              <li key={option.id} className="py-2">
                <RowForm id={option.id} action={saveRoutineOption}>
                  <div className="grid gap-4 lg:grid-cols-[6rem_minmax(0,1fr)_minmax(0,2fr)_5rem]">
                    <Cell label="Value">
                      <code className="text-fg-subtle block py-1.5 text-xs">
                        {option.value}
                      </code>
                    </Cell>
                    <Cell label="Answer">
                      <input
                        name="label"
                        required
                        maxLength={120}
                        defaultValue={option.label}
                        className={adminField}
                      />
                    </Cell>
                    <Cell label="Description">
                      <input
                        name="description"
                        maxLength={300}
                        defaultValue={option.description ?? ''}
                        className={adminField}
                      />
                    </Cell>
                    <Cell label="Order">
                      <input
                        name="sortOrder"
                        type="number"
                        min={0}
                        defaultValue={option.sortOrder}
                        className={adminField}
                      />
                    </Cell>
                  </div>
                </RowForm>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

/* --- rules ---------------------------------------------------------------- */

async function Rules({ coverage }: { coverage: Record<string, number> }) {
  // The same published-product list the promotion target picker uses, so a
  // rule can never name a product the storefront will not show.
  const [rules, targets] = await Promise.all([
    listRoutineRules(),
    getPromotionTargets(),
  ]);

  const fields = (rule?: (typeof rules)[number]) => (
    <>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_9rem_minmax(0,2fr)_5rem]">
        <Cell label="Rule name">
          <input
            name="name"
            required
            maxLength={160}
            defaultValue={rule?.name ?? ''}
            className={adminField}
          />
        </Cell>
        <Cell label="Step">
          <select
            name="step"
            defaultValue={rule?.step ?? 'cleanse'}
            className={adminField}
          >
            {routineStepEnum.enumValues.map((step) => (
              <option key={step} value={step}>
                {ROUTINE_STEP_LABELS[step]}
              </option>
            ))}
          </select>
        </Cell>
        <Cell label="Product">
          <select
            name="productId"
            required
            defaultValue={rule?.productId ?? ''}
            className={adminField}
          >
            <option value="">Choose a product</option>
            {targets.product.map((product) => (
              <option key={product.id} value={product.id}>
                {product.label}
              </option>
            ))}
          </select>
        </Cell>
        <Cell label="Weight" hint="Higher wins.">
          <input
            name="weight"
            type="number"
            min={1}
            max={100}
            defaultValue={rule?.weight ?? 10}
            className={adminField}
          />
        </Cell>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Cell
          label="Conditions"
          hint='Blank matches everyone. e.g. {"answers":{"concerns":["dryness"]}}'
        >
          <input
            name="conditions"
            maxLength={4000}
            defaultValue={
              rule && Object.keys(rule.conditions).length > 0
                ? JSON.stringify(rule.conditions)
                : ''
            }
            className={`${adminField} font-mono text-xs`}
          />
        </Cell>
        <Cell label="Why we chose it" hint="Shown on the result card.">
          <input
            name="rationale"
            maxLength={300}
            defaultValue={rule?.rationale ?? ''}
            className={adminField}
          />
        </Cell>
      </div>
    </>
  );

  return (
    <section aria-label="Recommendation rules">
      <p className="text-fg-subtle mb-4 text-xs">
        Every rule that matches adds its weight to a product, and the highest
        total wins its step. A step with no enabled rule is simply missing from
        the routine.
      </p>

      <ul className="mb-6 flex flex-wrap gap-2">
        {routineStepEnum.enumValues.map((step) => (
          <li key={step}>
            <Badge tone={coverage[step] ? 'neutral' : 'low'}>
              {ROUTINE_STEP_LABELS[step]} {coverage[step] ?? 0}
            </Badge>
          </li>
        ))}
      </ul>

      {rules.length === 0 ? <NoRows>No rules yet.</NoRows> : null}

      {rules.map((rule) => (
        <RowForm
          key={rule.id}
          id={rule.id}
          action={saveRoutineRule}
          remove={deleteRoutineRule}
          className={row}
        >
          {fields(rule)}
          <label className="text-fg mt-3 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="enabled"
              defaultChecked={rule.enabled}
              className="size-4"
            />
            Active
            <span className="text-fg-subtle ml-3 text-xs">
              {rule.brandName}
            </span>
          </label>
        </RowForm>
      ))}

      <details className="border-line mt-6 border">
        <summary className="text-fg cursor-pointer px-4 py-3 text-sm">
          New rule
        </summary>
        <div className="border-line border-t p-4">
          <RowForm id="" action={saveRoutineRule} saveLabel="Add">
            {fields()}
            <label className="text-fg mt-3 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="enabled"
                defaultChecked
                className="size-4"
              />
              Active
            </label>
          </RowForm>
        </div>
      </details>
    </section>
  );
}
