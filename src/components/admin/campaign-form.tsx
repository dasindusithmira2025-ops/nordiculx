'use client';

import { useActionState } from 'react';
import { useRouter } from 'next/navigation';
import { saveCampaign } from '@/app/actions/admin-campaigns';
import { Button } from '@/components/ui/button';
import { adminField, Cell } from '@/components/admin/admin-ui';
import type { ActionResult } from '@/lib/validation';

/**
 * Create / edit a campaign.
 *
 * The publish window and the status are separate on purpose: a campaign can be
 * scheduled well ahead as a draft, and pulling one mid-flight is a status
 * change that leaves the dates it was planned with intact.
 */

export type CampaignFormValues = {
  id: string;
  title: string;
  slug: string;
  subtitle: string;
  heroImageUrl: string;
  heroImageAlt: string;
  heroDark: boolean;
  status: string;
  startsAt: string;
  endsAt: string;
  seoTitle: string;
  seoDescription: string;
  body: string;
  /** False when the body holds blocks the text editor cannot represent. */
  bodyEditable: boolean;
};

export function CampaignForm({
  values,
  statuses,
}: {
  values: CampaignFormValues;
  statuses: readonly string[];
}) {
  const router = useRouter();
  const creating = values.id === '';

  const [state, formAction, pending] = useActionState<
    ActionResult | null,
    FormData
  >(async (_previous, formData) => {
    const result = await saveCampaign(formData);
    if (result.ok && creating) router.push('/admin/campaigns');
    return result;
  }, null);

  const error = (name: string) =>
    state && !state.ok ? (state.fieldErrors?.[name] ?? null) : null;

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="id" value={values.id} />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_9rem]">
        <Cell label="Title">
          <input
            name="title"
            required
            maxLength={200}
            defaultValue={values.title}
            className={adminField}
          />
        </Cell>
        <Cell label="URL" hint={error('slug') ?? '/campaigns/…'}>
          <input
            name="slug"
            required
            maxLength={120}
            defaultValue={values.slug}
            className={adminField}
          />
        </Cell>
        <Cell label="Status">
          <select
            name="status"
            defaultValue={values.status}
            className={adminField}
          >
            {statuses.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </Cell>
      </div>

      <Cell label="Subtitle">
        <input
          name="subtitle"
          maxLength={300}
          defaultValue={values.subtitle}
          className={adminField}
        />
      </Cell>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_10rem_10rem]">
        <Cell label="Hero image URL">
          <input
            name="heroImageUrl"
            maxLength={400}
            defaultValue={values.heroImageUrl}
            className={adminField}
          />
        </Cell>
        <Cell label="Hero image alt text">
          <input
            name="heroImageAlt"
            maxLength={200}
            defaultValue={values.heroImageAlt}
            className={adminField}
          />
        </Cell>
        <Cell label="Starts" hint="Blank starts on publish.">
          <input
            name="startsAt"
            type="datetime-local"
            defaultValue={values.startsAt}
            className={adminField}
          />
        </Cell>
        <Cell label="Ends" hint={error('endsAt') ?? 'Blank runs on.'}>
          <input
            name="endsAt"
            type="datetime-local"
            defaultValue={values.endsAt}
            className={adminField}
          />
        </Cell>
      </div>

      <Cell
        label="Body"
        hint={
          values.bodyEditable
            ? 'Blank line between paragraphs. ## heading, - list, > quote, !! note, --- divider.'
            : 'This campaign contains product or image blocks, which this editor cannot represent — the body is left untouched when you save.'
        }
      >
        <textarea
          name="body"
          rows={14}
          readOnly={!values.bodyEditable}
          defaultValue={values.body}
          className={`${adminField} font-mono text-xs leading-relaxed`}
        />
      </Cell>

      <div className="grid gap-4 lg:grid-cols-2">
        <Cell label="SEO title">
          <input
            name="seoTitle"
            maxLength={200}
            defaultValue={values.seoTitle}
            className={adminField}
          />
        </Cell>
        <Cell label="SEO description">
          <input
            name="seoDescription"
            maxLength={400}
            defaultValue={values.seoDescription}
            className={adminField}
          />
        </Cell>
      </div>

      <div className="flex flex-wrap items-center gap-6">
        <label className="text-fg flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="heroDark"
            defaultChecked={values.heroDark}
            className="size-4"
          />
          Dark hero
        </label>
        <Button type="submit" size="sm" disabled={pending}>
          {creating ? 'Create campaign' : 'Save campaign'}
        </Button>
        {state?.ok ? (
          <span role="status" className="text-signal-success text-xs">
            Saved.
          </span>
        ) : null}
        {state && !state.ok ? (
          <span role="alert" className="text-signal-danger text-xs">
            {state.error}
          </span>
        ) : null}
      </div>
    </form>
  );
}
