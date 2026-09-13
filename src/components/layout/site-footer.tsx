import Link from 'next/link';
import { getNavigation } from '@/lib/catalogue/taxonomy';
import { SocialLinks } from './social-links';
import { Wordmark } from './wordmark';

/**
 * Site footer.
 *
 * Sits on the dark editorial surface so every page closes on ink, which gives
 * the long light commerce pages a definite termination point instead of
 * trailing off.
 * Company details are the registered ones supplied by the client.
 */
export async function SiteFooter() {
  const items = await getNavigation('footer');

  const groups = new Map<string, typeof items>();
  for (const item of items) {
    const key = item.columnGroup ?? 'Nordic Lux';
    const existing = groups.get(key);
    if (existing) existing.push(item);
    else groups.set(key, [item]);
  }

  return (
    <footer data-surface="ink" className="bg-surface text-fg">
      <div className="page-x mx-auto max-w-(--container-page) py-20 md:py-28">
        <div className="grid gap-14 lg:grid-cols-[1.4fr_2fr]">
          {/* Brand and newsletter */}
          <div className="max-w-md">
            <Wordmark size="lg" />
            <p className="text-fg-muted mt-6 text-sm">
              A curated house of beauty, wellness and pantry from small northern
              studios. Chosen for how they are used, not for what they promise.
            </p>

            {/* No newsletter form here: the homepage already ends with a
                dedicated newsletter section, and two capture forms on one
                screen reads as nagging rather than inviting. */}
            <p className="text-fg-muted mt-8 text-sm">
              Questions about a product or an order?{' '}
              <Link href="/contact" className="link-retract text-fg">
                Talk to us
              </Link>
              .
            </p>

            {/* Renders only the profiles that are actually configured. */}
            <SocialLinks label="Follow" className="mt-10" />
          </div>

          {/* Link columns */}
          <div className="grid gap-10 sm:grid-cols-3">
            {[...groups.entries()].map(([group, links]) => (
              <div key={group}>
                <p className="eyebrow text-fg-subtle mb-5">{group}</p>
                <ul className="space-y-3">
                  {links.map((link) => (
                    <li key={link.id}>
                      <Link
                        href={link.href}
                        className="link-underline text-fg-muted hover:text-fg text-sm transition-colors"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        {/* Registered details and credits */}
        <div className="border-line mt-20 border-t pt-10">
          <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:justify-between">
            <address className="text-fg-subtle text-xs leading-relaxed not-italic">
              <span className="text-fg-muted">The Nordic Lux (Pvt) Ltd</span>
              <br />
              Registration No. 003545508
              <br />
              22/A, Kirillawaththa, Weboda East, Weboda 11858, Sri Lanka
              <br />
              <a
                href="mailto:thenordiclux@gmail.com"
                className="link-underline text-fg-muted"
              >
                thenordiclux@gmail.com
              </a>
            </address>

            <p className="text-fg-subtle text-xs lg:text-right">
              © {new Date().getFullYear()} The Nordic Lux (Pvt) Ltd. All rights
              reserved.
              <br />
              Designed and built by{' '}
              <span className="text-fg-muted">Corelith Technologies</span>.
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
