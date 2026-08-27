import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

/**
 * Class merging, taught this project's design tokens.
 *
 * tailwind-merge resolves conflicts by mapping a class to a "group" and keeping
 * the last class in each group. It only knows Tailwind's DEFAULT scales, so a
 * custom token whose name it does not recognise falls through to the catch-all
 * for that prefix — and for `text-*` that catch-all is *colour*.
 *
 * That silently broke real pairings. `text-read text-fg-muted` looked like two
 * colours, so the font size was dropped and long-form copy rendered at
 * `--text-base` (15px) instead of `--text-read` (18px). The same collision hit
 * `[&_h2]:text-display-sm [&_h2]:text-fg` in `Prose`, which is why editorial
 * headings came out smaller than the paragraphs under them.
 *
 * Listing the custom values explicitly puts them in the right group, so a size
 * and a colour no longer evict one another. Any new `--text-*` or `--shadow-*`
 * token whose name is not one of Tailwind's defaults has to be added here too.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [
        {
          text: [
            '2xs',
            'read',
            'display-sm',
            'display-md',
            'display-lg',
            'display-xl',
          ],
        },
      ],
      // Named shadows would otherwise be read as shadow *colours*, so
      // `shadow-overlay` and a colour utility would fight over one slot.
      shadow: [{ shadow: ['overlay', 'drawer', 'lift'] }],
    },
  },
});

/** Conditional class names with later Tailwind utilities winning conflicts. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
