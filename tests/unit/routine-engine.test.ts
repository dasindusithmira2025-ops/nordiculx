import { describe, expect, it } from 'vitest';
import {
  candidateProductIds,
  rankCandidates,
  resolveRoutine,
  ruleMatches,
  type RoutineRuleInput,
} from '@/lib/routine/engine';

/**
 * The scoring rules are editable data, so this is where the semantics of that
 * data are pinned down. Every case below mirrors a rule shape that actually
 * exists in the seed.
 */

const rule = (
  overrides: Partial<RoutineRuleInput> & Pick<RoutineRuleInput, 'id'>,
): RoutineRuleInput => ({
  step: 'treat',
  productId: 'p1',
  conditions: {},
  weight: 10,
  rationale: null,
  ...overrides,
});

describe('ruleMatches', () => {
  it('matches everyone when there are no conditions', () => {
    // The daily-SPF rule.
    expect(ruleMatches(rule({ id: 'r' }), {})).toBe(true);
  });

  it('requires one of the listed values for each named question', () => {
    const r = rule({
      id: 'r',
      conditions: { answers: { skin_type: ['dry', 'normal'] } },
    });
    expect(ruleMatches(r, { skin_type: ['dry'] })).toBe(true);
    expect(ruleMatches(r, { skin_type: ['normal'] })).toBe(true);
    expect(ruleMatches(r, { skin_type: ['oily'] })).toBe(false);
  });

  it('does not fire when the question was never answered', () => {
    const r = rule({
      id: 'r',
      conditions: { answers: { sensitivity: ['high'] } },
    });
    expect(ruleMatches(r, { skin_type: ['dry'] })).toBe(false);
  });

  it('requires every condition, not just one', () => {
    // "Night oil for dryness": concern AND routine size.
    const r = rule({
      id: 'r',
      conditions: {
        answers: {
          concerns: ['dryness'],
          routine_size: ['considered', 'full'],
        },
      },
    });
    expect(
      ruleMatches(r, { concerns: ['dryness'], routine_size: ['full'] }),
    ).toBe(true);
    expect(
      ruleMatches(r, { concerns: ['dryness'], routine_size: ['minimal'] }),
    ).toBe(false);
    expect(ruleMatches(r, { routine_size: ['full'] })).toBe(false);
  });

  it('honours a multi-select answer intersecting the listed values', () => {
    const r = rule({
      id: 'r',
      conditions: { answers: { concerns: ['blemishes', 'uneven_tone'] } },
    });
    expect(ruleMatches(r, { concerns: ['dryness', 'blemishes'] })).toBe(true);
    expect(ruleMatches(r, { concerns: ['dryness', 'barrier'] })).toBe(false);
  });

  it('suppresses a rule on an excluded answer', () => {
    // "Weekly acid ... " is excluded for a minimal routine.
    const r = rule({
      id: 'r',
      conditions: {
        answers: { concerns: ['dullness'] },
        excludeAnswers: { routine_size: ['minimal'] },
      },
    });
    expect(
      ruleMatches(r, { concerns: ['dullness'], routine_size: ['full'] }),
    ).toBe(true);
    expect(
      ruleMatches(r, { concerns: ['dullness'], routine_size: ['minimal'] }),
    ).toBe(false);
  });

  it('treats an empty value list as unsatisfiable, not as a wildcard', () => {
    // A malformed rule must not quietly recommend to everybody.
    const r = rule({ id: 'r', conditions: { answers: { skin_type: [] } } });
    expect(ruleMatches(r, { skin_type: ['dry'] })).toBe(false);
  });
});

describe('rankCandidates', () => {
  it('sums the weights of every rule that fires for a product', () => {
    const ranked = rankCandidates(
      [
        rule({ id: 'a', productId: 'p1', weight: 10 }),
        rule({ id: 'b', productId: 'p1', weight: 15 }),
        rule({ id: 'c', productId: 'p2', weight: 20 }),
      ],
      {},
    );

    const treat = ranked.get('treat')!;
    // 10 + 15 beats a single 20 — two reasons outrank one.
    expect(treat[0]).toMatchObject({ productId: 'p1', score: 25 });
    expect(treat[1]).toMatchObject({ productId: 'p2', score: 20 });
  });

  it('reports the rationale of the strongest rule, not the last one', () => {
    const ranked = rankCandidates(
      [
        rule({ id: 'a', productId: 'p1', weight: 24, rationale: 'strongest' }),
        rule({ id: 'b', productId: 'p1', weight: 8, rationale: 'weaker' }),
      ],
      {},
    );
    expect(ranked.get('treat')![0]!.rationale).toBe('strongest');
  });

  it('ignores rules that do not fire', () => {
    const ranked = rankCandidates(
      [
        rule({
          id: 'a',
          productId: 'p1',
          conditions: { answers: { sensitivity: ['high'] } },
        }),
      ],
      { sensitivity: ['rarely'] },
    );
    expect(ranked.size).toBe(0);
  });

  it('groups candidates by step', () => {
    const ranked = rankCandidates(
      [
        rule({ id: 'a', step: 'cleanse', productId: 'p1' }),
        rule({ id: 'b', step: 'protect', productId: 'p2' }),
      ],
      {},
    );
    expect([...ranked.keys()].sort()).toEqual(['cleanse', 'protect']);
  });

  it('is deterministic when scores tie', () => {
    const rules = [
      rule({ id: 'a', productId: 'bbb', weight: 10 }),
      rule({ id: 'b', productId: 'aaa', weight: 10 }),
    ];
    // Same answers must always give the same routine, whatever the rule order.
    const first = rankCandidates(rules, {}).get('treat')!;
    const second = rankCandidates([...rules].reverse(), {}).get('treat')!;
    expect(first.map((c) => c.productId)).toEqual(['aaa', 'bbb']);
    expect(second.map((c) => c.productId)).toEqual(['aaa', 'bbb']);
  });
});

describe('resolveRoutine', () => {
  const ranked = rankCandidates(
    [
      rule({ id: 'a', step: 'cleanse', productId: 'sold-out', weight: 30 }),
      rule({ id: 'b', step: 'cleanse', productId: 'in-stock', weight: 20 }),
      rule({ id: 'c', step: 'protect', productId: 'spf', weight: 20 }),
    ],
    {},
  );

  it('prefers an available product over a higher-scoring sold-out one', () => {
    const routine = resolveRoutine(ranked, (id) => id !== 'sold-out');
    expect(routine.find((r) => r.step === 'cleanse')!.candidate.productId).toBe(
      'in-stock',
    );
  });

  it('still returns a step when nothing in it is available', () => {
    // A routine with a silent hole is worse than an honest out-of-stock card.
    const routine = resolveRoutine(ranked, () => false);
    expect(routine.find((r) => r.step === 'cleanse')!.candidate.productId).toBe(
      'sold-out',
    );
  });

  it('returns steps in the order a routine is applied', () => {
    const routine = resolveRoutine(ranked, () => true);
    expect(routine.map((r) => r.step)).toEqual(['cleanse', 'protect']);
  });

  it('collects every candidate id for one batched lookup', () => {
    expect(candidateProductIds(ranked).sort()).toEqual([
      'in-stock',
      'sold-out',
      'spf',
    ]);
  });
});
