'use client';

import { useActionState, useEffect, useState, type ReactNode } from 'react';
import { deleteBrand, saveBrand } from '@/app/actions/admin-brands';
import { adminField, Cell } from '@/components/admin/admin-ui';
import { Button } from '@/components/ui/button';
import type { ActionResult } from '@/lib/validation';

export type BrandFormValues = {
  id: string;
  name: string;
  slug: string;
  tagline: string;
  description: string;
  story: string;
  logoUrl: string;
  heroImageUrl: string;
  originCountry: string;
  status: string;
  featured: boolean;
  sortOrder: number;
  merchandisingRank: number | null;
  seoTitle: string;
  seoDescription: string;
};

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="border-line space-y-5 border-b pb-8">
      <div>
        <h2 className="text-fg text-sm font-medium">{title}</h2>
        <p className="text-fg-subtle mt-1 text-xs">{description}</p>
      </div>
      {children}
    </section>
  );
}

function Toggle({
  name,
  label,
  checked,
}: {
  name: string;
  label: string;
  checked: boolean;
}) {
  return (
    <label className="text-fg flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        name={name}
        defaultChecked={checked}
        className="size-4"
      />
      {label}
    </label>
  );
}

export function BrandForm({
  values,
  products,
  isNew,
}: {
  values: BrandFormValues;
  products: number;
  isNew: boolean;
}) {
  const [dirty, setDirty] = useState(false);
  const [logoPreview, setLogoPreview] = useState(values.logoUrl);
  const [state, formAction, pending] = useActionState<
    ActionResult<{ id: string }> | null,
    FormData
  >(async (_previous, formData) => {
    const result = await saveBrand(formData);
    if (result.ok) setDirty(false);
    return result;
  }, null);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const error = (name: string) =>
    state && !state.ok ? (state.fieldErrors?.[name] ?? null) : null;

  return (
    <form
      action={formAction}
      onChange={() => setDirty(true)}
      className="max-w-5xl space-y-8"
    >
      <input type="hidden" name="id" value={values.id} />

      <Section
        title="Identity"
        description="The name and public URL customers use to find this brand."
      >
        <div className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1.5fr)_12rem]">
          <Cell label="Brand name" hint={error('name')}>
            <input
              name="name"
              required
              maxLength={120}
              defaultValue={values.name}
              aria-invalid={error('name') ? true : undefined}
              className={adminField}
            />
          </Cell>
          <Cell label="URL slug" hint={error('slug') ?? '/brands/...'}>
            <input
              name="slug"
              maxLength={140}
              defaultValue={values.slug}
              aria-invalid={error('slug') ? true : undefined}
              className={adminField}
            />
          </Cell>
          <Cell label="Status" hint={error('status')}>
            <select
              name="status"
              defaultValue={values.status}
              className={adminField}
            >
              <option value="draft">draft</option>
              <option value="published">published</option>
              <option value="archived">archived</option>
            </select>
          </Cell>
        </div>
        <div className="grid gap-5 lg:grid-cols-2">
          <Cell label="Origin country" hint={error('originCountry')}>
            <input
              name="originCountry"
              maxLength={100}
              defaultValue={values.originCountry}
              className={adminField}
            />
          </Cell>
          <Cell
            label="Tagline"
            hint={error('tagline') ?? 'A short line under the logo.'}
          >
            <input
              name="tagline"
              maxLength={180}
              defaultValue={values.tagline}
              className={adminField}
            />
          </Cell>
        </div>
      </Section>

      <Section
        title="Brand presence"
        description="Control the logo, hero image, and visual treatment on the storefront."
      >
        <div className="grid gap-5 lg:grid-cols-2">
          <Cell
            label="Logo URL"
            hint={
              error('logoUrl') ??
              'HTTPS URL or local path such as /media/brands/name.svg.'
            }
          >
            <input
              name="logoUrl"
              maxLength={500}
              defaultValue={values.logoUrl}
              aria-label="Logo URL"
              onChange={(event) => setLogoPreview(event.target.value)}
              className={adminField}
            />
            {logoPreview ? (
              <div className="border-line mt-4 flex h-24 items-center justify-center border p-4">
                {/* Admin previews may point at a user-managed local or remote asset. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={logoPreview}
                  alt="Brand logo preview"
                  className="max-h-16 max-w-full object-contain"
                  onError={(event) => {
                    event.currentTarget.style.opacity = '0.25';
                  }}
                />
              </div>
            ) : (
              <div className="border-line text-fg-subtle mt-4 flex h-24 items-center justify-center border text-xs">
                Logo preview
              </div>
            )}
          </Cell>
          <Cell
            label="Hero image URL"
            hint={
              error('heroImageUrl') ??
              'Optional image for the brand detail page.'
            }
          >
            <input
              name="heroImageUrl"
              maxLength={500}
              defaultValue={values.heroImageUrl}
              className={adminField}
            />
          </Cell>
        </div>
      </Section>

      <Section
        title="Story and copy"
        description="The content shown on the brand page and in catalogue context."
      >
        <Cell label="Short description" hint={error('description')}>
          <textarea
            name="description"
            rows={4}
            maxLength={1600}
            defaultValue={values.description}
            className={adminField}
          />
        </Cell>
        <Cell label="Brand story" hint={error('story')}>
          <textarea
            name="story"
            rows={8}
            maxLength={8000}
            defaultValue={values.story}
            className={adminField}
          />
        </Cell>
      </Section>

      <Section
        title="Storefront settings"
        description="Set discovery order, homepage visibility, and the brand's default position."
      >
        <div className="grid gap-5 lg:grid-cols-[10rem_10rem_10rem_1fr] lg:items-end">
          <Cell
            label="Sort order"
            hint={error('sortOrder') ?? 'Lower appears first.'}
          >
            <input
              name="sortOrder"
              type="number"
              min={0}
              max={999}
              defaultValue={values.sortOrder}
              className={adminField}
            />
          </Cell>
          <Cell
            label="Pinned position"
            hint={error('merchandisingRank') ?? 'Blank uses sales ranking.'}
          >
            <input
              name="merchandisingRank"
              type="number"
              min={1}
              max={99}
              placeholder="Auto"
              defaultValue={values.merchandisingRank ?? ''}
              className={adminField}
            />
          </Cell>
          <div className="pb-2">
            <Toggle
              name="featured"
              label="Featured brand"
              checked={values.featured}
            />
          </div>
          <p className="text-fg-subtle pb-2 text-xs">
            {products > 0
              ? `${products} catalogue product${products === 1 ? '' : 's'} linked.`
              : 'No catalogue products linked yet.'}
          </p>
        </div>
      </Section>

      <Section
        title="Search metadata"
        description="Optional title and description for search engines and sharing."
      >
        <div className="grid gap-5 lg:grid-cols-2">
          <Cell label="SEO title" hint={error('seoTitle')}>
            <input
              name="seoTitle"
              maxLength={200}
              defaultValue={values.seoTitle}
              className={adminField}
            />
          </Cell>
          <Cell label="SEO description" hint={error('seoDescription')}>
            <textarea
              name="seoDescription"
              rows={3}
              maxLength={400}
              defaultValue={values.seoDescription}
              className={adminField}
            />
          </Cell>
        </div>
      </Section>

      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" loading={pending}>
          {isNew ? 'Create brand' : 'Save brand'}
        </Button>
        {state?.ok ? <p className="text-fg-muted text-sm">Saved.</p> : null}
        {state && !state.ok ? (
          <p role="alert" className="text-accent text-sm">
            {state.error}
          </p>
        ) : null}
      </div>
    </form>
  );
}

export function DeleteBrandForm({ id, name }: { id: string; name: string }) {
  const [state, formAction, pending] = useActionState<
    ActionResult | null,
    FormData
  >(async (_previous, formData) => deleteBrand(formData), null);

  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        if (!window.confirm(`Delete ${name}? This cannot be undone.`)) {
          event.preventDefault();
        }
      }}
      className="border-line flex flex-wrap items-center justify-between gap-4 border-t pt-6"
    >
      <input type="hidden" name="id" value={id} />
      <div>
        <h2 className="text-fg text-sm font-medium">Remove brand</h2>
        <p className="text-fg-subtle mt-1 text-xs">
          Only brands with no linked products can be deleted. Archive brands
          that are in use.
        </p>
      </div>
      <div className="flex items-center gap-4">
        {state && !state.ok ? (
          <p role="alert" className="text-accent max-w-sm text-xs">
            {state.error}
          </p>
        ) : null}
        <Button type="submit" variant="secondary" loading={pending}>
          Delete brand
        </Button>
      </div>
    </form>
  );
}
