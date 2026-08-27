import type { ContentBlock } from '@/lib/db/schema';

/**
 * Plain text ⇄ content blocks.
 *
 * Policy and About copy arrives from the business as a document, and staff
 * need to paste it in without learning a block editor. This converts the
 * prose block types both ways so the stored structure stays structured while
 * the editing surface stays a textarea.
 *
 * Blocks that carry more than text — images, product references — are NOT
 * representable here. `canEditAsText` is the guard: a body containing one is
 * left alone rather than round-tripped through a format that would silently
 * drop it.
 *
 *   ## Heading            heading, level 2
 *   ### Heading           heading, level 3
 *   > Quoted — Attributed quote
 *   - item                list item (consecutive lines group into one list)
 *   1. item               ordered list item
 *   ---                   divider
 *   !! Note               callout
 *   anything else         paragraph
 */

const TEXT_BLOCK_TYPES = new Set([
  'paragraph',
  'heading',
  'quote',
  'list',
  'divider',
  'callout',
]);

/** Whether every block in a body survives a text round trip. */
export function canEditAsText(body: ContentBlock[]): boolean {
  return body.every((block) => TEXT_BLOCK_TYPES.has(block.type));
}

export function blocksToText(body: ContentBlock[]): string {
  const chunks: string[] = [];

  for (const block of body) {
    switch (block.type) {
      case 'heading':
        chunks.push(`${'#'.repeat(block.level)} ${block.text}`);
        break;
      case 'quote':
        chunks.push(
          block.attribution
            ? `> ${block.text} — ${block.attribution}`
            : `> ${block.text}`,
        );
        break;
      case 'list':
        chunks.push(
          block.items
            .map((item, i) =>
              block.ordered ? `${i + 1}. ${item}` : `- ${item}`,
            )
            .join('\n'),
        );
        break;
      case 'divider':
        chunks.push('---');
        break;
      case 'callout':
        chunks.push(
          block.title
            ? `!! ${block.title} — ${block.text}`
            : `!! ${block.text}`,
        );
        break;
      case 'paragraph':
        chunks.push(block.text);
        break;
      default:
        // Unreachable for a body that passed `canEditAsText`; kept so a new
        // block type is dropped loudly in review rather than silently at runtime.
        break;
    }
  }

  return chunks.join('\n\n');
}

/** Splits on an em dash surrounded by spaces, which is how both forms write it. */
function splitAttribution(text: string): [string, string | undefined] {
  const at = text.lastIndexOf(' — ');
  if (at === -1) return [text, undefined];
  return [text.slice(0, at).trim(), text.slice(at + 3).trim() || undefined];
}

export function textToBlocks(input: string): ContentBlock[] {
  const blocks: ContentBlock[] = [];

  // Paragraphs are blank-line separated; a list is one chunk of `- ` lines.
  for (const chunk of input.split(/\r?\n\s*\r?\n/)) {
    const trimmed = chunk.trim();
    if (!trimmed) continue;

    if (/^-{3,}$/.test(trimmed)) {
      blocks.push({ type: 'divider' });
      continue;
    }

    const heading = /^(#{2,3})\s+(.*)$/s.exec(trimmed);
    if (heading) {
      blocks.push({
        type: 'heading',
        level: heading[1]!.length === 3 ? 3 : 2,
        text: heading[2]!.trim(),
      });
      continue;
    }

    const lines = trimmed.split(/\r?\n/).map((line) => line.trim());

    if (lines.every((line) => /^[-*]\s+/.test(line))) {
      blocks.push({
        type: 'list',
        items: lines.map((line) => line.replace(/^[-*]\s+/, '')),
      });
      continue;
    }

    if (lines.every((line) => /^\d+[.)]\s+/.test(line))) {
      blocks.push({
        type: 'list',
        ordered: true,
        items: lines.map((line) => line.replace(/^\d+[.)]\s+/, '')),
      });
      continue;
    }

    if (trimmed.startsWith('> ')) {
      const [text, attribution] = splitAttribution(
        lines.map((line) => line.replace(/^>\s?/, '')).join(' '),
      );
      blocks.push({
        type: 'quote',
        text,
        ...(attribution ? { attribution } : {}),
      });
      continue;
    }

    if (trimmed.startsWith('!! ')) {
      const [text, title] = splitAttribution(trimmed.slice(3).trim());
      // `!! Title — body` reads title-first, so the halves swap back here.
      blocks.push(
        title
          ? { type: 'callout', title: text, text: title }
          : { type: 'callout', text },
      );
      continue;
    }

    // A single paragraph may still be soft-wrapped; joining keeps it one block.
    blocks.push({ type: 'paragraph', text: lines.join(' ') });
  }

  return blocks;
}
