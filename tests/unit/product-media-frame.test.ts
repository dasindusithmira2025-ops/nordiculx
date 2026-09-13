import { describe, expect, it } from 'vitest';
import { frameFor } from '../../scripts/normalize-product-media';

/**
 * The framing maths behind `npm run media:normalize`.
 *
 * This is the whole reason product photography looks like one set rather than
 * a jumble: whatever the source frame, the subject ends up against the same
 * safe area of the same 3:4 stage. Getting the tighter-axis choice backwards
 * would silently push subjects outside the frame, which is exactly the kind of
 * thing nobody notices until a client does.
 */

const SAFE_AREA = 0.88;
const RATIO = 3 / 4;

/** How much of the frame the subject occupies on each axis. */
function fill(width: number, height: number) {
  const frame = frameFor(width, height);
  return {
    ratio: frame.canvasWidth / frame.canvasHeight,
    across: width / frame.canvasWidth,
    down: height / frame.canvasHeight,
  };
}

describe('frameFor', () => {
  const subjects: [string, number, number][] = [
    ['tall narrow serum', 275, 757],
    ['squat jar', 820, 964],
    ['wide flat box', 1100, 400],
    ['tube', 449, 1004],
    ['square', 600, 600],
    ['smallest accepted source', 200, 260],
  ];

  it.each(subjects)('frames a %s at 3:4', (_label, width, height) => {
    expect(fill(width, height).ratio).toBeCloseTo(RATIO, 2);
  });

  it.each(subjects)(
    'seats a %s inside the safe area, touching it on one axis',
    (_label, width, height) => {
      const { across, down } = fill(width, height);

      // Never spills out of the safe area…
      expect(across).toBeLessThanOrEqual(SAFE_AREA + 0.01);
      expect(down).toBeLessThanOrEqual(SAFE_AREA + 0.01);
      // …and is never left floating well inside it either: the longer axis
      // must reach the safe area, which is what equalises apparent scale.
      // The tolerance is for whole-pixel canvas rounding, which is widest on
      // the smallest source we accept.
      expect(Math.abs(Math.max(across, down) - SAFE_AREA)).toBeLessThan(0.03);
    },
  );

  it('lets the tighter axis decide, so shapes are not stretched', () => {
    // A tall subject fills the height and leaves margin at the sides.
    const tall = fill(275, 757);
    expect(tall.down).toBeGreaterThan(tall.across);

    // A wide subject fills the width and letterboxes instead.
    const wide = fill(1100, 400);
    expect(wide.across).toBeGreaterThan(wide.down);
  });

  it('scales the canvas with the subject rather than resampling it', () => {
    // Same shape at twice the size must produce twice the canvas — the subject
    // is composited at its native resolution and is never enlarged to fit.
    const small = frameFor(300, 400);
    const large = frameFor(600, 800);
    expect(Math.abs(large.canvasWidth - small.canvasWidth * 2)).toBeLessThan(2);
    expect(Math.abs(large.canvasHeight - small.canvasHeight * 2)).toBeLessThan(
      2,
    );
  });
});
