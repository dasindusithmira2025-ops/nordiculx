import { describe, expect, it } from 'vitest';
import { brandLogoSvg } from '../../scripts/generate-media';

/**
 * The wordmarks drawn for the demo brands by `npm run db:seed`.
 *
 * The only thing that can really go wrong here is the box: the type run is
 * pinned to an exact `textLength`, so if the declared width stops matching
 * that pin the mark either clips its own last letter or floats in dead space
 * — on a page whose whole point is that a column of logos lines up.
 */

const box = (svg: string) => ({
  width: Number(/ width="(\d+)"/.exec(svg)![1]),
  run: Number(/textLength="(\d+)"/.exec(svg)![1]),
  x: Number(/<text x="(\d+)"/.exec(svg)![1]),
});

describe('brand wordmark', () => {
  it('declares a box the pinned type run fits exactly', () => {
    for (const request of [
      { key: 'a', name: 'Saga Pantry' },
      {
        key: 'b',
        name: 'SUND Copenhagen',
        caps: true,
        device: 'rule' as const,
      },
      { key: 'c', name: 'Björk & Linden', device: 'dot' as const },
      { key: 'd', name: 'KVIST', caps: true, tracking: 0.42 },
    ]) {
      const { width, run, x } = box(brandLogoSvg(request));
      expect(width).toBe(x + run);
    }
  });

  it('escapes the name in both the mark and its label', () => {
    const svg = brandLogoSvg({ key: 'x', name: 'Björk & Linden' });
    expect(svg).toContain('aria-label="Björk &amp; Linden"');
    expect(svg).toContain('>Björk &amp; Linden</text>');
    expect(svg).not.toMatch(/&(?!amp;|lt;|gt;|apos;|quot;)/);
  });

  it('gives every mark the same box height, whatever the case', () => {
    // The logo stage fits by height, so a mark that is taller than its
    // neighbours is a mark whose letterforms render smaller than theirs.
    for (const request of [
      { key: 'a', name: 'Saga Pantry' },
      { key: 'b', name: 'Lume Studio', caps: true, device: 'dot' as const },
      { key: 'c', name: 'Nordkap Wellness', caps: true },
    ]) {
      expect(brandLogoSvg(request)).toContain('height="40" viewBox=');
    }
  });
});
