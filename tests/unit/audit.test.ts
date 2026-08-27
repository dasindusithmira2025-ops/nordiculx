import { describe, expect, it } from 'vitest';
import { diff } from '@/lib/admin/audit';

/**
 * The audit trail records what changed, not what was submitted. A diff that
 * reports untouched fields makes the log unreadable, and one that misses a real
 * change makes it untrustworthy.
 */
describe('diff', () => {
  it('records only fields that actually changed', () => {
    const changes = diff(
      { status: 'confirmed', note: 'x' },
      { status: 'packed', note: 'x' },
    );
    expect(changes).toEqual({ status: { from: 'confirmed', to: 'packed' } });
  });

  it('is empty when nothing moved', () => {
    expect(diff({ a: 1 }, { a: 1 })).toEqual({});
  });

  it('ignores fields the update did not mention', () => {
    const changes = diff({ a: 1, b: 2 }, { a: 9 });
    expect(Object.keys(changes)).toEqual(['a']);
  });

  it('records a value being cleared', () => {
    // A field being emptied is exactly the kind of change an audit trail exists
    // to capture, so it must not be treated as "unchanged".
    const changes = diff<{ a: string | null }>({ a: 'x' }, { a: null });
    expect(changes).toEqual({ a: { from: 'x', to: null } });
  });
});
