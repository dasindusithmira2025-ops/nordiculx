import type { Metadata } from 'next';
import Link from 'next/link';
import { currentUser } from '@/lib/auth';
import { whatsappGeneralLink } from '@/lib/whatsapp';
import { PageHeader } from '@/components/layout/page-header';
import { SocialLinks } from '@/components/layout/social-links';
import { ContactForm } from '@/components/support/contact-form';
import { ChatIcon, TruckIcon, WhatsAppIcon } from '@/components/ui/icons';

export const metadata: Metadata = {
  title: 'Contact — Nordic Lux',
  description:
    'Questions about an order, a return, or which product suits you. We reply within one working day.',
  alternates: { canonical: '/contact' },
};

/**
 * Contact page.
 *
 * A signed-in customer gets their name and email prefilled — asking somebody
 * who is already authenticated to retype their address is friction for no
 * benefit. The fields stay editable, because a customer may well be writing
 * about somebody else's delivery.
 */
export default async function ContactPage() {
  const user = await currentUser();

  return (
    <>
      <PageHeader
        eyebrow="Support"
        title="Contact us"
        description="Tell us what you need and we will come back to you within one working day."
        trail={[{ label: 'Contact', href: '/contact' }]}
      />

      <div className="page-x mx-auto max-w-(--container-page) pb-28">
        <div className="grid gap-x-16 gap-y-14 lg:grid-cols-[1fr_18rem]">
          <div>
            <ContactForm
              defaultName={
                user
                  ? [user.firstName, user.lastName].filter(Boolean).join(' ') ||
                    undefined
                  : undefined
              }
              defaultEmail={user?.email}
            />
          </div>

          <aside className="space-y-10">
            {/* First in the aside so it is the first thing seen beside the
                form, and directly under the form on mobile. */}
            <SocialLinks className="border-line-strong border p-6" />

            <div>
              <h2 className="eyebrow text-fg-subtle mb-4">Other ways</h2>
              <ul className="space-y-5 text-sm">
                <li className="flex items-start gap-3">
                  <WhatsAppIcon
                    width={18}
                    height={18}
                    className="text-fg-muted mt-0.5 shrink-0"
                  />
                  <span>
                    <a
                      href={whatsappGeneralLink()}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-fg link-underline"
                    >
                      WhatsApp
                    </a>
                    <span className="text-fg-subtle mt-1 block text-xs">
                      Fastest for a quick question.
                    </span>
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <ChatIcon
                    width={18}
                    height={18}
                    className="text-fg-muted mt-0.5 shrink-0"
                  />
                  <span>
                    <span className="text-fg">Live chat</span>
                    <span className="text-fg-subtle mt-1 block text-xs">
                      Use the button in the corner of any page.
                    </span>
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <TruckIcon
                    width={18}
                    height={18}
                    className="text-fg-muted mt-0.5 shrink-0"
                  />
                  <span>
                    <Link href="/track" className="text-fg link-underline">
                      Track an order
                    </Link>
                    <span className="text-fg-subtle mt-1 block text-xs">
                      No account needed — just your reference.
                    </span>
                  </span>
                </li>
              </ul>
            </div>

            <div className="border-line border-t pt-8">
              <h2 className="eyebrow text-fg-subtle mb-4">Before you write</h2>
              <p className="text-fg-muted text-sm">
                Delivery times, returns and authenticity are covered in the{' '}
                <Link href="/faq" className="text-fg link-underline">
                  FAQ
                </Link>
                , which is usually faster than waiting for a reply.
              </p>
            </div>
          </aside>
        </div>
      </div>
    </>
  );
}
