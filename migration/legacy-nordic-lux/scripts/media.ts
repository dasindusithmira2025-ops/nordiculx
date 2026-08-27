import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { targetMediaUrl } from './map';

/**
 * Phase 8 — legacy imagery into the application's own media architecture.
 *
 * The app serves catalogue imagery from `public/media/products/*.webp` and
 * references it by path (there is no S3 code path in this codebase). Legacy
 * JPEGs are therefore converted in place to that convention. Nothing keeps a
 * pointer into the legacy repository, and no manufacturer URL is hot-linked.
 *
 * Content hashes are computed on the SOURCE bytes, so two legacy files that
 * are byte-identical are recognised as duplicates regardless of their names.
 */

const ROOT = join(import.meta.dirname, '..');
const SNAPSHOT_DIR = join(ROOT, 'archive', 'media', 'products');
const OUT_DIR = join(process.cwd(), 'public', 'media', 'products');

export type MediaResult = {
  legacyPath: string;
  targetUrl: string;
  sourceSha256: string;
  bytesIn: number;
  bytesOut: number;
  width: number;
  height: number;
  /** Set when another legacy path had identical bytes; the file is written once. */
  duplicateOf: string | null;
};

function sourceFileFor(legacyPath: string): string | null {
  const m = /^\/products\/(.+)$/.exec(legacyPath);
  if (!m) return null;
  const file = join(SNAPSHOT_DIR, m[1]!);
  return existsSync(file) ? file : null;
}

export function legacyImageExists(legacyPath: string): boolean {
  return sourceFileFor(legacyPath) !== null;
}

/**
 * Converts every referenced legacy image, skipping bytes already written.
 * Safe to re-run: identical input produces an identical file at the same path.
 */
export async function migrateImages(
  legacyPaths: string[],
  { dryRun = false } = {},
): Promise<MediaResult[]> {
  if (!dryRun) mkdirSync(OUT_DIR, { recursive: true });

  const seenHash = new Map<string, string>();
  const results: MediaResult[] = [];

  for (const legacyPath of [...new Set(legacyPaths)].sort()) {
    const source = sourceFileFor(legacyPath);
    if (!source) continue;

    const bytes = readFileSync(source);
    const sourceSha256 = createHash('sha256').update(bytes).digest('hex');
    const duplicateOf = seenHash.get(sourceSha256) ?? null;
    seenHash.set(sourceSha256, duplicateOf ?? legacyPath);

    const targetUrl = targetMediaUrl(legacyPath);
    const out = join(OUT_DIR, targetUrl.split('/').pop()!);

    // quality 82 matches what `scripts/generate-media.ts` writes, so migrated
    // and existing catalogue imagery are indistinguishable in weight. The
    // conversion runs in a dry run too — that is how a corrupt source image
    // surfaces before the import rather than during it.
    const { data, info } = await sharp(bytes)
      .webp({ quality: 82 })
      .toBuffer({ resolveWithObject: true });
    if (!dryRun) writeFileSync(out, data);

    results.push({
      legacyPath,
      targetUrl,
      sourceSha256,
      bytesIn: bytes.length,
      bytesOut: info.size,
      width: info.width,
      height: info.height,
      duplicateOf,
    });
  }

  return results;
}

/** Writes the source→target audit trail next to the archive. */
export function writeMediaMap(results: MediaResult[]) {
  const path = join(ROOT, 'archive', 'media-source-map.json');
  writeFileSync(
    path,
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        legacyRoot: 'public/products',
        targetRoot: 'public/media/products',
        count: results.length,
        files: results,
      },
      null,
      2,
    )}\n`,
    'utf8',
  );
}
