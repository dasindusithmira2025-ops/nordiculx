import { describe, expect, it } from 'vitest';
import { cn } from '@/lib/cn';

/**
 * These guard a real defect, not a hypothetical one.
 *
 * tailwind-merge only knows Tailwind's default scales. Every custom token below
 * was previously classified as a *colour* because its name is not one Tailwind
 * ships, so pairing it with an actual colour dropped it — long-form copy
 * silently rendered at 15px and editorial headings came out smaller than their
 * body text. See src/lib/cn.ts.
 */
describe('cn', () => {
  it('keeps a custom font size alongside a colour', () => {
    const result = cn('text-read', 'text-fg-muted');
    expect(result).toContain('text-read');
    expect(result).toContain('text-fg-muted');
  });

  it.each([
    'display-sm',
    'display-md',
    'display-lg',
    'display-xl',
    '2xs',
    'read',
  ])('keeps text-%s when a colour follows it', (size) => {
    const result = cn(`text-${size}`, 'text-fg');
    expect(result).toContain(`text-${size}`);
    expect(result).toContain('text-fg');
  });

  it('keeps custom sizes inside an arbitrary variant', () => {
    // The exact pairing used by Prose for editorial headings.
    const result = cn('[&_h2]:text-display-sm', '[&_h2]:text-fg');
    expect(result).toContain('[&_h2]:text-display-sm');
    expect(result).toContain('[&_h2]:text-fg');
  });

  it('keeps a named shadow alongside a colour', () => {
    const result = cn('shadow-overlay', 'text-fg');
    expect(result).toContain('shadow-overlay');
  });

  it('still collapses genuine conflicts, last one winning', () => {
    expect(cn('text-read', 'text-display-md')).toBe('text-display-md');
    expect(cn('text-fg', 'text-fg-muted')).toBe('text-fg-muted');
    expect(cn('px-2', 'px-4')).toBe('px-4');
  });

  it('drops falsy values and keeps conditional classes', () => {
    expect(cn('a', false && 'b', undefined, 'c')).toBe('a c');
  });
});
