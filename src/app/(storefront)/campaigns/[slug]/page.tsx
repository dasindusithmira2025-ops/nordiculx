import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { trackEvent } from '@/lib/analytics';
import { getCampaignBySlug } from '@/lib/catalogue/taxonomy';
import { getProductsByIds } from '@/lib/catalogue/products';
import { Hero } from '@/components/home/hero';
import { Breadcrumbs } from '@/components/layout/page-header';
import { ContentBlocks, collectProductIds } from '@/components/content/blocks';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const campaign = await getCampaignBySlug(slug);
  if (!campaign) return { title: 'Not found — Nordic Lux' };

  return {
    title: campaign.seoTitle ?? `${campaign.title} — Nordic Lux`,
    description: campaign.seoDescription ?? campaign.subtitle ?? undefined,
    alternates: { canonical: `/campaigns/${campaign.slug}` },
    openGraph: campaign.heroImageUrl
      ? { images: [{ url: campaign.heroImageUrl }] }
      : undefined,
  };
}

/**
 * Campaign page.
 *
 * `getCampaignBySlug` only returns a campaign inside its publish window, so a
 * campaign that has ended 404s rather than lingering as a live page with expired
 * offers on it. Seasonal URLs get shared and re-shared long after the season, so
 * this is the behaviour that matters most here.
 *
 * The hero is the same component the homepage uses — a campaign is exactly the
 * "one loud thing" that component exists for.
 */
export default async function CampaignPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const campaign = await getCampaignBySlug(slug);
  if (!campaign) notFound();

  await trackEvent(
    'campaign_view',
    { campaignId: campaign.id },
    { path: `/campaigns/${slug}` },
  );

  const blocks = campaign.body;
  const ids = collectProductIds(blocks);
  const products = ids.length > 0 ? await getProductsByIds(ids) : [];

  return (
    <>
      <Hero
        eyebrow="Campaign"
        title={campaign.title}
        description={campaign.subtitle}
        imageUrl={campaign.heroImageUrl}
        imageAlt={campaign.heroImageAlt}
        dark={campaign.heroDark}
      />

      <div className="page-x mx-auto max-w-(--container-page) pt-10 pb-28">
        <Breadcrumbs
          trail={[
            { label: campaign.title, href: `/campaigns/${campaign.slug}` },
          ]}
          className="mb-12"
        />

        <ContentBlocks
          blocks={blocks}
          products={new Map(products.map((p) => [p.id, p]))}
        />
      </div>
    </>
  );
}
