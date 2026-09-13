import { cn } from '@/lib/cn';
import { getSocialLinks, type SocialLink } from '@/lib/social';
import { FacebookIcon, InstagramIcon, TikTokIcon } from '@/components/ui/icons';

const ICONS = {
  instagram: InstagramIcon,
  facebook: FacebookIcon,
  tiktok: TikTokIcon,
} as const;

/**
 * Social profile row.
 *
 * Renders nothing at all when no profile is configured, which is deliberate:
 * an empty heading with a gap under it looks broken, and inventing a handle to
 * fill the space would link customers to an account we do not control.
 *
 * The icons inherit the surface's foreground colour, so the same component
 * works in the ink footer and on the paper contact page without a variant.
 */
export function SocialLinks({
  links = getSocialLinks(),
  label = 'Follow',
  className,
  size = 18,
  variant = 'default',
}: {
  /** Server-resolved profiles. Supplying these avoids repeat configuration work. */
  links?: SocialLink[];
  /** Rendered as an eyebrow above the row; pass null for icons only. */
  label?: string | null;
  className?: string;
  size?: number;
  /** The header is deliberately quieter and more compact than a page section. */
  variant?: 'default' | 'header';
}) {
  if (links.length === 0) return null;

  const headerVariant = variant === 'header';

  return (
    <div className={className}>
      {label ? <p className="eyebrow text-fg-subtle mb-4">{label}</p> : null}
      <ul
        className={cn('flex items-center', headerVariant ? 'gap-0.5' : 'gap-2')}
      >
        {links.map((link) => {
          const Icon = ICONS[link.platform];
          return (
            <li key={link.platform}>
              <a
                href={link.href}
                target="_blank"
                rel="noopener noreferrer me"
                aria-label={link.label}
                title={link.label}
                className={cn(
                  headerVariant
                    ? 'text-fg-subtle hover:bg-accent-soft hover:text-fg grid size-8 place-items-center'
                    : 'border-line text-fg-muted hover:border-line-strong hover:text-fg grid h-10 w-10 place-items-center border',
                  'duration-standard ease-standard transition-colors',
                )}
              >
                <Icon width={size} height={size} />
              </a>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
