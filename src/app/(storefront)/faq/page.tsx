import type { Metadata } from 'next';
import { getFaqs } from '@/lib/catalogue/taxonomy';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/ui/display';
import { ButtonLink } from '@/components/ui/button';
import { PlusIcon } from '@/components/ui/icons';

export const metadata: Metadata = {
  title: 'Frequently asked questions — Nordic Lux',
  description:
    'Delivery, returns, authenticity, payment and product questions, answered.',
  alternates: { canonical: '/faq' },
};

/** Turns the stored category key into a display heading. */
const CATEGORY_LABELS: Record<string, string> = {
  general: 'General',
  orders: 'Orders',
  delivery: 'Delivery',
  returns: 'Returns and refunds',
  products: 'Products',
  payment: 'Payment',
  account: 'Account',
  authenticity: 'Authenticity',
};

function labelFor(category: string) {
  return (
    CATEGORY_LABELS[category] ??
    category.charAt(0).toUpperCase() + category.slice(1)
  );
}

/**
 * FAQ.
 *
 * Each answer is a native `<details>` — the platform already implements the
 * disclosure, including keyboard operation and find-in-page expanding the right
 * one, which a JS accordion has to reimplement and usually gets wrong.
 *
 * `FAQPage` structured data is emitted so these can win the answer box; it is
 * built from the same rows that render, so the markup can never disagree with
 * the visible copy.
 */
export default async function FaqPage() {
  const faqs = await getFaqs();

  // Query is already ordered by (category, sortOrder), so grouping in one pass
  // preserves the editor's intended order within each group.
  const groups = new Map<string, typeof faqs>();
  for (const faq of faqs) {
    const existing = groups.get(faq.category);
    if (existing) existing.push(faq);
    else groups.set(faq.category, [faq]);
  }

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((faq) => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: { '@type': 'Answer', text: faq.answer },
    })),
  };

  return (
    <>
      {faqs.length > 0 ? (
        <script
          type="application/ld+json"
          // Built from our own rows, not from visitor input.
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      ) : null}

      <PageHeader
        eyebrow="Help"
        title="Frequently asked questions"
        description="If the answer you need is not here, the support team replies to messages within one working day."
        trail={[{ label: 'FAQ', href: '/faq' }]}
      />

      <div className="page-x mx-auto max-w-(--container-page) pb-28">
        {faqs.length === 0 ? (
          <EmptyState
            title="No questions published yet"
            description="Send us a message and we will answer directly."
            action={<ButtonLink href="/contact">Contact us</ButtonLink>}
          />
        ) : (
          <div className="grid gap-x-16 gap-y-16 lg:grid-cols-[14rem_1fr]">
            {/* In-page nav. Plain anchors, so it works with no JavaScript. */}
            <nav aria-label="FAQ categories" className="hidden lg:block">
              <p className="eyebrow text-fg-subtle mb-4">Sections</p>
              <ul className="space-y-2">
                {[...groups.keys()].map((category) => (
                  <li key={category}>
                    <a
                      href={`#${category}`}
                      className="text-fg-muted hover:text-fg link-underline text-sm"
                    >
                      {labelFor(category)}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>

            <div className="space-y-16">
              {[...groups.entries()].map(([category, items]) => (
                <section
                  key={category}
                  id={category}
                  // Anchored sections must not land under the sticky header.
                  className="scroll-mt-28"
                >
                  <h2 className="font-display text-display-sm text-fg mb-6">
                    {labelFor(category)}
                  </h2>
                  <ul className="border-line border-t">
                    {items.map((faq) => (
                      <li key={faq.id} className="border-line border-b">
                        <details className="group">
                          <summary className="text-fg hover:text-fg-muted flex cursor-pointer list-none items-start justify-between gap-6 py-5 text-base">
                            <span>{faq.question}</span>
                            <PlusIcon
                              width={14}
                              height={14}
                              className="text-fg-subtle duration-micro ease-standard mt-1.5 shrink-0 transition-transform group-open:rotate-45"
                            />
                          </summary>
                          <div className="text-fg-muted max-w-prose pb-6 text-sm leading-relaxed">
                            {faq.answer.split('\n\n').map((paragraph, i) => (
                              <p key={i} className="mb-3 last:mb-0">
                                {paragraph}
                              </p>
                            ))}
                          </div>
                        </details>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          </div>
        )}

        <div className="border-line section-y border-t text-center">
          <h2 className="font-display text-display-sm text-fg">Still stuck?</h2>
          <p className="text-fg-muted mx-auto mt-4 max-w-md text-sm">
            Send us the details and we will come back to you within one working
            day.
          </p>
          <div className="mt-8">
            <ButtonLink href="/contact">Contact us</ButtonLink>
          </div>
        </div>
      </div>
    </>
  );
}
