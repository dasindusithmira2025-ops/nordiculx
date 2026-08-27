import Link from 'next/link';
import { requireStaff } from '@/lib/auth';
import { listCampaigns } from '@/lib/admin/content';
import { Badge } from '@/components/ui/display';
import { NoRows, PageHeader, Table, Td, Th } from '@/components/admin/admin-ui';
import { CampaignRowActions } from '@/components/admin/campaign-actions';

/**
 * Campaigns.
 *
 * The state column answers the only question staff actually ask — is this on
 * the site right now? — by combining the publish status with the window, the
 * same way `/campaigns/[slug]` decides whether to render or 404.
 */

const dateFormat = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

function state(campaign: {
  status: string;
  startsAt: Date | null;
  endsAt: Date | null;
}) {
  if (campaign.status !== 'published') return campaign.status;
  const now = new Date();
  if (campaign.startsAt && campaign.startsAt > now) return 'scheduled';
  if (campaign.endsAt && campaign.endsAt <= now) return 'ended';
  return 'live';
}

export default async function AdminCampaignsPage() {
  await requireStaff('campaigns.manage');
  const rows = await listCampaigns();

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Marketing"
        title={`${rows.length} campaigns`}
        description="Landing pages with a publish window. Outside its window a campaign 404s rather than showing stale copy."
        actions={
          <Link
            href="/admin/campaigns/new"
            className="eyebrow text-fg link-underline"
          >
            New campaign
          </Link>
        }
      />

      {rows.length === 0 ? (
        <NoRows>No campaigns yet.</NoRows>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Title</Th>
              <Th>URL</Th>
              <Th>Starts</Th>
              <Th>Ends</Th>
              <Th>State</Th>
              <Th>
                <span className="sr-only">Actions</span>
              </Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((campaign) => {
              const now = state(campaign);
              return (
                <tr key={campaign.id}>
                  <Td>
                    <Link
                      href={`/admin/campaigns/${campaign.id}`}
                      className="link-underline text-fg"
                    >
                      {campaign.title}
                    </Link>
                  </Td>
                  <Td className="text-fg-muted font-mono text-xs">
                    /campaigns/{campaign.slug}
                  </Td>
                  <Td className="text-fg-muted text-xs whitespace-nowrap">
                    {campaign.startsAt
                      ? dateFormat.format(campaign.startsAt)
                      : '—'}
                  </Td>
                  <Td className="text-fg-muted text-xs whitespace-nowrap">
                    {campaign.endsAt ? dateFormat.format(campaign.endsAt) : '—'}
                  </Td>
                  <Td>
                    <Badge
                      tone={
                        now === 'live'
                          ? 'success'
                          : now === 'scheduled'
                            ? 'neutral'
                            : 'out'
                      }
                    >
                      {now}
                    </Badge>
                  </Td>
                  <Td>
                    <CampaignRowActions
                      id={campaign.id}
                      status={campaign.status}
                    />
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
    </div>
  );
}
