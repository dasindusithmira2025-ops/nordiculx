import { describe, it, expect } from 'vitest';
import { blocksToText, canEditAsText, textToBlocks } from '@/lib/content/text';
import type { ContentBlock } from '@/lib/db/schema';

/**
 * The text editor is only safe if it round-trips. A block that survives
 * `blocksToText` but comes back different silently rewrites published policy
 * copy, which is the one place in the site where wording is legally load
 * bearing.
 */
describe('content text round trip', () => {
  const body: ContentBlock[] = [
    { type: 'heading', level: 2, text: 'How we work' },
    {
      type: 'paragraph',
      text: 'We buy from the manufacturer or an authorised distributor.',
    },
    { type: 'heading', level: 3, text: 'Returns' },
    { type: 'list', items: ['Unopened', 'Within 14 days'] },
    { type: 'list', ordered: true, items: ['Email us', 'Post it back'] },
    {
      type: 'quote',
      text: 'Fewer things, used properly.',
      attribution: 'Nordic Lux',
    },
    { type: 'divider' },
    {
      type: 'callout',
      title: 'Authenticity',
      text: 'Every batch is traceable.',
    },
    { type: 'callout', text: 'A plain note with no title.' },
  ];

  it('survives blocks → text → blocks unchanged', () => {
    expect(textToBlocks(blocksToText(body))).toEqual(body);
  });

  it('treats loose prose as paragraphs', () => {
    expect(textToBlocks('One.\n\nTwo.')).toEqual([
      { type: 'paragraph', text: 'One.' },
      { type: 'paragraph', text: 'Two.' },
    ]);
  });

  it('joins a soft-wrapped paragraph into one block', () => {
    expect(textToBlocks('One line\nand its wrap.')).toEqual([
      { type: 'paragraph', text: 'One line and its wrap.' },
    ]);
  });

  it('refuses bodies holding blocks it cannot represent', () => {
    expect(canEditAsText(body)).toBe(true);
    expect(canEditAsText([{ type: 'image', url: '/a.webp', alt: 'A' }])).toBe(
      false,
    );
    expect(canEditAsText([{ type: 'product_grid', productIds: ['x'] }])).toBe(
      false,
    );
  });

  it('ignores empty input rather than writing an empty paragraph', () => {
    expect(textToBlocks('   \n\n  ')).toEqual([]);
  });
});
