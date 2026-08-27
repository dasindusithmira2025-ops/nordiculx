import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireStaff } from '@/lib/auth';
import { getCampaign } from '@/lib/admin/content';
import { blocksToText, canEditAsText } from '@/lib/content/text';
import { publishStatusEnum } from '@/lib/db/schema';
import { PageHeader } from '@/components/admin/admin-ui';
import {
  CampaignForm,
  type CampaignFormValues,
} from '@/components/admin/campaign-form';

/**
 * One campaign. `/admin/campaigns/new` reuses the same form with empty values,
 * so there is one editor rather than a create screen and an edit screen that
 * drift apart.
 */

/** `datetime-local` wants `YYYY-MM-DDTHH:mm` in local time. */
function toLocalInput(date: Date | null) {
  if (!date) return '';
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
}

const EMPTY: CampaignFormValues = {
  id: '',
  title: '',
  slug: '',
  subtitle: '',
  heroImageUrl: '',
  heroImageAlt: '',
  heroDark: true,
  status: 'draft',
  startsAt: '',
  endsAt: '',
  seoTitle: '',
  seoDescription: '',
  body: '',
  bodyEditable: true,
};

export default async function AdminCampaignPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireStaff('campaigns.manage');

  const { id } = await params;
  const creating = id === 'new';
  const campaign = creating ? null : await getCampaign(id);
  if (!creating && !campaign) notFound();

  const values: CampaignFormValues = campaign
    ? {
        id: campaign.id,
        title: campaign.title,
        slug: campaign.slug,
        subtitle: campaign.subtitle ?? '',
        heroImageUrl: campaign.heroImageUrl ?? '',
        heroImageAlt: campaign.heroImageAlt ?? '',
        heroDark: campaign.heroDark,
        status: campaign.status,
        startsAt: toLocalInput(campaign.startsAt),
        endsAt: toLocalInput(campaign.endsAt),
        seoTitle: campaign.seoTitle ?? '',
        seoDescription: campaign.seoDescription ?? '',
        body: blocksToText(campaign.body),
        bodyEditable: canEditAsText(campaign.body),
      }
    : EMPTY;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Campaign"
        title={campaign ? campaign.title : 'New campaign'}
        description={
          campaign ? (
            <Link
              href={`/campaigns/${campaign.slug}`}
              className="link-underline"
            >
              /campaigns/{campaign.slug}
            </Link>
          ) : (
            'Only reachable on the storefront once published and inside its window.'
          )
        }
      />

      <p className="text-xs">
        <Link href="/admin/campaigns" className="link-underline">
          All campaigns
        </Link>
      </p>

      <section
        aria-label="Campaign settings"
        className="border-line border p-4"
      >
        <CampaignForm values={values} statuses={publishStatusEnum.enumValues} />
      </section>
    </div>
  );
}
