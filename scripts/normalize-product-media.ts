import './load-env';
import { readdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import type { Metadata } from 'sharp';

/**
 * Normalises the framing of product photography.
 *
 * The problem this solves is not a CSS problem. Every card in the site already
 * uses one 3:4 stage with `object-contain` (`src/components/commerce/
 * product-media.tsx`), and it still looked wrong, because the *source* files
 * are framed by whoever shot them: a 900x900 photograph with a 275x757 bottle
 * floating in white, next to an 1100x532 photograph cropped tight to a box.
 * Contained in the same frame, one product fills the height and the other
 * becomes a stripe. No amount of per-card CSS fixes that — the frame was
 * already identical.
 *
 * So the normalisation happens once, in the asset:
 *
 *   1. trim the uniform studio border (this only ever removes background —
 *      `trim` stops at the first pixel that differs, so it cannot cut into
 *      packaging or crop label text)
 *   2. build a 3:4 canvas sized so the trimmed subject occupies SAFE_AREA of
 *      it, and centre the subject on it
 *   3. pad with the colour sampled from the source's own border, so the seam
 *      between original and added background is invisible on off-white studio
 *      backdrops
 *
 * The subject's pixels are never resampled and never enlarged: the canvas is
 * built around the content at its native resolution, and the finished frame is
 * only ever scaled *down*, and only if it exceeds MAX_WIDTH. Nothing is
 * stretched, nothing is cropped, no pixels are invented — this is framing, not
 * retouching, and it is emphatically not generation. Real product photography
 * stays authoritative.
 *
 * Full-bleed compositions are left completely alone — see FULL_WIDTH_BLEED.
 * A lifestyle frame or a graded campaign still is not a packshot, and it must
 * not have a flat block painted over the edges of its background.
 *
 * Rewrites in place, so every `product_media.url` keeps working. Originals are
 * recoverable from git — the files are tracked.
 *
 *   npx tsx scripts/normalize-product-media.ts [--dry-run] [--dir=<path>]
 */

const DEFAULT_DIR = join(process.cwd(), 'public', 'media', 'products');

/** Fraction of the 3:4 frame the subject's bounding box is allowed to fill. */
const SAFE_AREA = 0.88;
const FRAME_W = 3;
const FRAME_H = 4;
/** Above this the finished frame is scaled down; below it, left as shot. */
const MAX_WIDTH = 1200;
/**
 * How far a pixel may differ from the corner colour and still count as
 * background. Low enough to keep soft shadows, high enough to absorb the webp
 * noise a previous pass leaves behind — which is what makes this idempotent.
 */
const TRIM_THRESHOLD = 12;
/**
 * Content that spans the full width of its file is not a packshot floating on
 * a studio background — it is a full-bleed composition (a lifestyle frame, a
 * gradient campaign still, a wide banner crop). There is no horizontal safe
 * area to establish, and padding it vertically to 3:4 would turn it into a
 * stripe and paint a flat block over the edges of a graded background. Those
 * are left exactly as they are.
 *
 * Height is deliberately not part of this test: a tall bottle photographed
 * tight to the top and bottom of a square file is precisely the case that
 * needs reframing.
 */
const FULL_WIDTH_BLEED = 0.97;
/**
 * Tolerances for recognising a frame this script already produced.
 *
 * Without this the pass is only approximately idempotent: re-measuring a
 * re-encoded file drifts the subject box by a pixel or two, so every run would
 * recompose and re-encode, and a lossy format loses a little each time. A file
 * that is already 3:4 with its subject already against the safe area is left
 * untouched.
 */
const RATIO_TOLERANCE = 0.01;
const SAFE_AREA_TOLERANCE = 0.02;

export type Frame = { canvasWidth: number; canvasHeight: number };

/**
 * The 3:4 canvas that seats a `width`x`height` subject at SAFE_AREA.
 *
 * Whichever axis is tighter decides the canvas, so a tall narrow serum fills
 * the frame's height and a wide flat box fills its width — both ending up
 * against the same safe area, which is what makes a mixed grid look composed.
 */
export function frameFor(
  width: number,
  height: number,
  safeArea = SAFE_AREA,
): Frame {
  const neededHeight = height / safeArea;
  const neededWidth = width / safeArea;
  const canvasHeight = Math.ceil(
    Math.max(neededHeight, (neededWidth * FRAME_H) / FRAME_W),
  );
  return {
    canvasWidth: Math.round((canvasHeight * FRAME_W) / FRAME_H),
    canvasHeight,
  };
}

type Outcome =
  | { status: 'normalized'; file: string; from: string; to: string }
  | { status: 'skipped'; file: string; reason: string }
  | { status: 'failed'; file: string; reason: string };

/** The source's own background colour, read from its top-left pixel. */
async function borderColour(input: Buffer) {
  const { data } = await sharp(input)
    .flatten({ background: '#ffffff' })
    .extract({ left: 0, top: 0, width: 1, height: 1 })
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { r: data[0]!, g: data[1]!, b: data[2]! };
}

async function normalizeOne(
  path: string,
  file: string,
  dryRun: boolean,
): Promise<Outcome> {
  const input = await readFile(path);

  let meta: Metadata;
  try {
    meta = await sharp(input).metadata();
  } catch {
    return { status: 'skipped', file, reason: 'unreadable' };
  }
  if (!meta.width || !meta.height) {
    return { status: 'skipped', file, reason: 'no dimensions' };
  }
  if ((meta.pages ?? 1) > 1) {
    return { status: 'skipped', file, reason: 'animated' };
  }

  const background = await borderColour(input);

  const { data: subject, info } = await sharp(input)
    .flatten({ background })
    .trim({ threshold: TRIM_THRESHOLD })
    .toBuffer({ resolveWithObject: true });

  if (info.width / meta.width >= FULL_WIDTH_BLEED) {
    return { status: 'skipped', file, reason: 'full-bleed composition' };
  }

  const ratio = meta.width / meta.height;
  const fill = Math.max(info.width / meta.width, info.height / meta.height);
  if (
    Math.abs(ratio - FRAME_W / FRAME_H) <= RATIO_TOLERANCE &&
    Math.abs(fill - SAFE_AREA) <= SAFE_AREA_TOLERANCE
  ) {
    return { status: 'skipped', file, reason: 'already framed' };
  }

  const { canvasWidth, canvasHeight } = frameFor(info.width, info.height);
  const left = Math.round((canvasWidth - info.width) / 2);
  const top = Math.round((canvasHeight - info.height) / 2);

  let frame = sharp({
    create: {
      width: canvasWidth,
      height: canvasHeight,
      channels: 3,
      background,
    },
  }).composite([{ input: subject, left, top }]);

  // Only ever downscale. Enlarging the subject to hit a fixed output size is
  // how a normalisation pass turns a sharp photograph into a soft one.
  if (canvasWidth > MAX_WIDTH) {
    frame = sharp(await frame.webp({ quality: 82 }).toBuffer()).resize({
      width: MAX_WIDTH,
      kernel: 'lanczos3',
    });
  }

  const out = await frame.webp({ quality: 82 }).toBuffer();

  if (!dryRun) {
    // Write beside the original and rename, so an interrupted run cannot leave
    // a half-written image where a product photograph used to be.
    const tmp = `${path}.tmp`;
    await writeFile(tmp, out);
    await rename(tmp, path);
  }

  return {
    status: 'normalized',
    file,
    from: `${meta.width}x${meta.height} subject ${info.width}x${info.height}`,
    to: `${Math.min(canvasWidth, MAX_WIDTH)}x${Math.round(
      (Math.min(canvasWidth, MAX_WIDTH) * FRAME_H) / FRAME_W,
    )}`,
  };
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const dirArg = process.argv.find((a) => a.startsWith('--dir='));
  const dir = dirArg ? dirArg.slice('--dir='.length) : DEFAULT_DIR;

  const files = (await readdir(dir)).filter((f) =>
    /\.(webp|png|jpe?g)$/i.test(f),
  );

  const counts = { normalized: 0, skipped: 0, failed: 0 };

  for (const file of files) {
    const path = join(dir, file);
    try {
      const outcome = await normalizeOne(path, file, dryRun);
      counts[outcome.status]++;
      if (outcome.status === 'normalized') {
        console.warn(
          `  norm  ${file.padEnd(34)} ${outcome.from} -> ${outcome.to}`,
        );
      } else if (outcome.status === 'skipped') {
        console.warn(`  skip  ${file.padEnd(34)} ${outcome.reason}`);
      }
    } catch (error) {
      counts.failed++;
      console.error(`  FAIL  ${file}: ${String(error).slice(0, 120)}`);
    }
  }

  console.warn(
    `\n${files.length} files — ${counts.normalized} normalised, ${counts.skipped} left as-is, ${counts.failed} failed${dryRun ? ' (dry run, nothing written)' : ''}`,
  );
}

// Importable for tests; only runs the directory pass when invoked directly.
if (process.argv[1]?.includes('normalize-product-media')) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
