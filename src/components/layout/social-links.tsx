import { cn } from '@/lib/cn';
import { getSocialLinks, type SocialLink } from '@/lib/social';
import { FacebookIcon, InstagramIcon, TikTokIcon } from '@/components/ui/icons';

const ICONS = {
  instagram: InstagramIcon,
  facebook: FacebookIcon,
  tiktok: TikTokIcon,
} as const;

/**
 * Social profile links.
 *
 * `feature` is the "Follow Nordic Lux" block used in the footer, on /contact
 * and in the mobile menu: labelled, tap-sized buttons that are meant to be
 * noticed. `header` is the compact icon group in the desktop header.
 *
 * Colours come from surface tokens, so the same markup works on the ink
 * footer and the paper pages without a colour variant. Hover and focus invert
 * the button, which reads clearly on both.
 */
export function SocialLinks({
  links = getSocialLinks(),
  className,
  variant = 'feature',
}: {
  /** Server-resolved profiles. Supplying these avoids repeat configuration work. */
  links?: SocialLink[];
  className?: string;
  variant?: 'feature' | 'header';
}) {
  if (links.length === 0) return null;

  if (variant === 'header') {
    return (
      <ul
        aria-label="Follow Nordic Lux"
        className={cn('flex items-center gap-1', className)}
      >
        {links.map((link) => {
          const Icon = ICONS[link.platform];
          return (
            <li key={link.platform}>
              <a
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={link.label}
                title={link.label}
                className="text-fg-muted hover:bg-accent-soft hover:text-fg focus-visible:bg-accent-soft focus-visible:text-fg duration-standard ease-standard grid size-9 place-items-center rounded-full transition-colors"
              >
                <Icon width={18} height={18} />
              </a>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <section aria-label="Follow Nordic Lux" className={className}>
      <p className="eyebrow text-fg-subtle">Social</p>
      <h2 className="font-display text-fg mt-2 text-2xl leading-tight">
        Follow Nordic Lux
      </h2>
      <p className="text-fg-muted mt-2 text-sm">
        New arrivals, rituals and edits — @thenordiclux
      </p>
      <ul className="mt-6 grid gap-3">
        {links.map((link) => {
          const Icon = ICONS[link.platform];
          return (
            <li key={link.platform}>
              <a
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={link.label}
                className="group border-line-strong text-fg hover:bg-fg hover:text-surface focus-visible:bg-fg focus-visible:text-surface duration-standard ease-standard flex min-h-14 items-center gap-4 border px-5 transition-colors"
              >
                <Icon width={24} height={24} className="shrink-0" />
                <span className="text-base tracking-wide">{link.name}</span>
                <span
                  aria-hidden
                  className="duration-standard ease-standard ml-auto text-lg transition-transform group-hover:translate-x-1 group-focus-visible:translate-x-1"
                >
                  ↗
                </span>
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
