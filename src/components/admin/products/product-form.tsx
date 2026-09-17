'use client';

import { useActionState, useEffect, useState, type ReactNode } from 'react';
import { saveProduct } from '@/app/actions/admin-products';
import { Button } from '@/components/ui/button';
import { adminField, Cell } from '@/components/admin/admin-ui';
import type { ActionResult } from '@/lib/validation';

/**
 * The product's own fields: name, copy, merchandising, beauty data and SEO.
 *
 * Prices, stock and imagery are edited by their own forms further down the
 * page. That split is not cosmetic — a variant is a separate row with its own
 * SKU and its own inventory ledger, and one giant submit that tried to write
 * all of it would have to decide what "partially saved" means.
 */

export type ProductFormValues = {
  id: string;
  name: string;
  slug: string;
  status: string;
  brandId: string;
  categoryId: string;
  subtitle: string;
  excerpt: string;
  description: string;
  benefits: string;
  howToUse: string;
  ingredientsList: string;
  routineStep: string;
  suitableSkinTypes: string[];
  collectionIds: string[];
  concernIds: string[];
  featured: boolean;
  bestSeller: boolean;
  newUntil: string;
  seoTitle: string;
  seoDescription: string;
};

export type Option = { id: string; name: string };

export function ProductForm({
  values,
  brands,
  categories,
  collections,
  concerns,
  statuses,
  skinTypes,
  routineSteps,
  unitsSold,
}: {
  values: ProductFormValues;
  brands: Option[];
  categories: Option[];
  collections: Option[];
  concerns: Option[];
  statuses: readonly string[];
  skinTypes: readonly string[];
  routineSteps: readonly string[];
  unitsSold: number;
}) {
  const [dirty, setDirty] = useState(false);

  const [state, formAction, pending] = useActionState<
    ActionResult | null,
    FormData
  >(async (_previous, formData) => {
    const result = await saveProduct(formData);
    if (result.ok) setDirty(false);
    return result;
  }, null);

  // Closing the tab with unsaved copy in it is the one loss this screen can
  // actually prevent. `beforeunload` is the only hook the browser gives for
  // it; in-app navigation is a plain link and the App Router has no blocking
  // API, so the guard is deliberately limited to leaving the page.
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
      className="space-y-10"
    >
      <input type="hidden" name="id" value={values.id} />

      <Section
        title="Basic"
        description="What the product is called and where it lives."
      >
        <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1.5fr)_10rem]">
          <Cell label="Product name" hint={error('name')}>
            <input
              name="name"
              required
              maxLength={180}
              defaultValue={values.name}
              aria-invalid={error('name') ? true : undefined}
              className={adminField}
            />
          </Cell>
          <Cell label="URL" hint={error('slug') ?? '/product/…'}>
            <input
              name="slug"
              required
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
              {statuses.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </Cell>
        </div>

        <Cell
          label="Subtitle"
          hint="One line under the name on the product page."
        >
          <input
            name="subtitle"
            maxLength={300}
            defaultValue={values.subtitle}
            className={adminField}
          />
        </Cell>

        <Cell
          label="Short description"
          hint="Used on cards and in search results."
        >
          <textarea
            name="excerpt"
            rows={2}
            maxLength={400}
            defaultValue={values.excerpt}
            className={adminField}
          />
        </Cell>

        <Cell label="Full description">
          <textarea
            name="description"
            rows={8}
            maxLength={8000}
            defaultValue={values.description}
            className={adminField}
          />
        </Cell>
      </Section>

      <Section
        title="Merchandising"
        description="Where the product appears beyond its own page."
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <Cell label="Brand" hint={error('brandId')}>
            <select
              name="brandId"
              defaultValue={values.brandId}
              required
              className={adminField}
            >
              {brands.map((brand) => (
                <option key={brand.id} value={brand.id}>
                  {brand.name}
                </option>
              ))}
            </select>
          </Cell>
          <Cell
            label="Category"
            hint={error('categoryId') ?? 'Parent → subcategory.'}
          >
            <select
              name="categoryId"
              defaultValue={values.categoryId}
              className={adminField}
            >
              <option value="">Uncategorised</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </Cell>
        </div>

        <CheckboxGroup
          legend="Collections"
          name="collectionIds"
          options={collections}
          selected={values.collectionIds}
        />

        <div className="grid gap-4 lg:grid-cols-[10rem_10rem_minmax(0,1fr)]">
          <Toggle name="featured" label="Featured" checked={values.featured} />
          <Toggle
            name="bestSeller"
            label="Best seller"
            checked={values.bestSeller}
          />
          <Cell
            label="New until"
            hint={
              error('newUntil') ??
              'Carries the "New" marker and the New Arrivals listing until this date.'
            }
          >
            <input
              name="newUntil"
              type="date"
              defaultValue={values.newUntil}
              className={adminField}
            />
          </Cell>
        </div>

        <p className="text-fg-subtle text-xs">
          {unitsSold > 0
            ? `${unitsSold} unit${unitsSold === 1 ? '' : 's'} sold on paid orders. `
            : 'No paid sales recorded yet. '}
          Best Sellers lists flagged products first, then whatever has actually
          sold most — the flag is a pin, not a figure.
        </p>
      </Section>

      <Section
        title="Beauty data"
        description="What goes on the product page below the fold."
      >
        <Cell label="Benefits" hint="One per line. Plain text, no markup.">
          <textarea
            name="benefits"
            rows={5}
            defaultValue={values.benefits}
            className={`${adminField} font-mono text-xs leading-relaxed`}
          />
        </Cell>

        <Cell label="How to use">
          <textarea
            name="howToUse"
            rows={4}
            maxLength={4000}
            defaultValue={values.howToUse}
            className={adminField}
          />
        </Cell>

        <Cell
          label="Ingredients"
          hint="The full INCI list exactly as the brand supplies it."
        >
          <textarea
            name="ingredientsList"
            rows={5}
            maxLength={8000}
            defaultValue={values.ingredientsList}
            className={adminField}
          />
        </Cell>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_14rem]">
          <CheckboxGroup
            legend="Suitable skin types"
            name="suitableSkinTypes"
            options={skinTypes.map((value) => ({ id: value, name: value }))}
            selected={values.suitableSkinTypes}
          />
          <Cell label="Routine step">
            <select
              name="routineStep"
              defaultValue={values.routineStep}
              className={adminField}
            >
              <option value="">Not in a routine</option>
              {routineSteps.map((step) => (
                <option key={step} value={step}>
                  {step}
                </option>
              ))}
            </select>
          </Cell>
        </div>

        <CheckboxGroup
          legend="Concerns"
          name="concernIds"
          options={concerns}
          selected={values.concernIds}
        />
      </Section>

      <Section
        title="Search"
        description="How the product appears in results and shares."
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <Cell label="SEO title" hint="Blank falls back to the product name.">
            <input
              name="seoTitle"
              maxLength={200}
              defaultValue={values.seoTitle}
              className={adminField}
            />
          </Cell>
          <Cell
            label="Meta description"
            hint="Blank falls back to the short description."
          >
            <input
              name="seoDescription"
              maxLength={400}
              defaultValue={values.seoDescription}
              className={adminField}
            />
          </Cell>
        </div>
      </Section>

      {/* Sticky so the save control is reachable without scrolling back up a
          long form, which is the whole reason the previous screen only ever
          edited price. */}
      <div className="border-line bg-surface sticky bottom-0 -mx-6 flex flex-wrap items-center gap-4 border-t px-6 py-4 lg:mx-0 lg:px-0">
        {/* `disabled` while pending is what stops a double-click creating two
            writes; the action is idempotent either way, but the second one
            would race the first's revalidation. */}
        <Button type="submit" disabled={pending}>
          {pending ? 'Saving…' : 'Save product'}
        </Button>

        <span aria-live="polite" className="text-xs">
          {pending ? <span className="text-fg-subtle">Saving…</span> : null}
          {!pending && state?.ok ? (
            <span className="text-signal-success">Saved.</span>
          ) : null}
          {!pending && dirty && !state?.ok ? (
            <span className="text-fg-subtle">Unsaved changes.</span>
          ) : null}
        </span>

        {state && !state.ok ? (
          <span role="alert" className="text-signal-danger text-xs">
            {state.error}
          </span>
        ) : null}
      </div>
    </form>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="border-line border-t pt-8 first:border-t-0 first:pt-0">
      <h2 className="font-display text-fg text-xl">{title}</h2>
      {description ? (
        <p className="text-fg-subtle mt-1 text-xs">{description}</p>
      ) : null}
      <div className="mt-5 space-y-4">{children}</div>
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
    <label className="text-fg flex items-center gap-2 self-end pb-2 text-sm">
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

/**
 * A fieldset of checkboxes sharing one name, which is how a FormData multi-value
 * arrives server-side. A multi-select would be fewer elements and considerably
 * worse: ctrl-clicking to deselect one collection is a known way to lose the
 * other nine.
 */
function CheckboxGroup({
  legend,
  name,
  options,
  selected,
}: {
  legend: string;
  name: string;
  options: Option[];
  selected: string[];
}) {
  if (options.length === 0) return null;
  const chosen = new Set(selected);

  return (
    <fieldset className="min-w-0">
      <legend className="eyebrow text-fg-subtle">{legend}</legend>
      <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2">
        {options.map((option) => (
          <label
            key={option.id}
            className="text-fg flex items-center gap-2 text-sm"
          >
            <input
              type="checkbox"
              name={name}
              value={option.id}
              defaultChecked={chosen.has(option.id)}
              className="size-4"
            />
            {option.name}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
