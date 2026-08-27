import Link from 'next/link';
import { requireStaff } from '@/lib/auth';
import {
  listAnnouncements,
  listFaqs,
  listHomepageSections,
  listNavigationItems,
  listPages,
} from '@/lib/admin/content';
import {
  deleteAnnouncement,
  deleteFaq,
  deleteNavigationItem,
  saveAnnouncement,
  saveFaq,
  saveHomepageSection,
  saveNavigationItem,
} from '@/app/actions/admin-content';
import { navigationLocationEnum } from '@/lib/db/schema';
import { Badge } from '@/components/ui/display';
import {
  adminField,
  Cell,
  NoRows,
  PageHeader,
  TabNav,
} from '@/components/admin/admin-ui';
import { RowForm } from '@/components/admin/row-form';

/**
 * Storefront content.
 *
 * Five short lists behind one tab bar, in the order the business changes them:
 * the homepage first, the announcement bar next, then FAQ, policies and
 * finally navigation — which is the one staff should touch least.
 *
 * Every list edits in place. There is no page builder, no drag handle and no
 * preview pane: the storefront revalidates on save, so the preview is the site.
 */

const TABS = [
  { value: 'homepage', label: 'Homepage' },
  { value: 'announcements', label: 'Announcements' },
  { value: 'faq', label: 'FAQ' },
  { value: 'pages', label: 'Pages' },
  { value: 'navigation', label: 'Navigation' },
] as const;

type Tab = (typeof TABS)[number]['value'];

/** `datetime-local` wants `YYYY-MM-DDTHH:mm`. */
function toLocalInput(date: Date | null) {
  if (!date) return '';
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
}

const KIND_LABELS: Record<string, string> = {
  hero: 'Hero',
  featured_products: 'Featured products',
  collection_spotlight: 'Collection spotlight',
  category_grid: 'Category grid',
  brand_marquee: 'Brand marquee',
  concern_grid: 'Concern grid',
  editorial_split: 'Editorial split',
  campaign_banner: 'Campaign banner',
  article_row: 'Article row',
  routine_finder_promo: 'Routine finder',
  assurance_row: 'Assurance row',
  newsletter: 'Newsletter',
};

const row = 'border-line border-b py-4 last:border-b-0';

export default async function AdminContentPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  await requireStaff('content.manage');

  const params = await searchParams;
  const raw = Array.isArray(params.tab) ? params.tab[0] : params.tab;
  const tab = (TABS.some((t) => t.value === raw) ? raw : 'homepage') as Tab;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Content"
        title="Storefront content"
        description="Copy, banners, questions and policies. Saving revalidates the storefront immediately."
      />

      <TabNav
        label="Content sections"
        current={tab}
        items={TABS.map((t) => ({
          value: t.value,
          label: t.label,
          href: `/admin/content?tab=${t.value}`,
        }))}
      />

      {tab === 'homepage' ? <Homepage /> : null}
      {tab === 'announcements' ? <Announcements /> : null}
      {tab === 'faq' ? <Faq /> : null}
      {tab === 'pages' ? <Pages /> : null}
      {tab === 'navigation' ? <Navigation /> : null}
    </div>
  );
}

/* --- homepage ------------------------------------------------------------- */

async function Homepage() {
  const sections = await listHomepageSections();

  return (
    <section aria-label="Homepage sections">
      <p className="text-fg-subtle mb-4 text-xs">
        The section type and what it queries are set in code — these are the
        words, the image and the order.
      </p>
      {sections.length === 0 ? (
        <NoRows>No homepage sections.</NoRows>
      ) : (
        sections.map((section) => (
          <RowForm
            key={section.id}
            id={section.id}
            action={saveHomepageSection}
            className={row}
          >
            <div className="mb-3 flex items-center gap-3">
              <Badge tone={section.enabled ? 'success' : 'out'}>
                {KIND_LABELS[section.kind] ?? section.kind}
              </Badge>
              <span className="text-fg-subtle text-xs">
                position {section.sortOrder}
              </span>
            </div>

            <div className="grid gap-4 lg:grid-cols-4">
              <Cell label="Eyebrow">
                <input
                  name="eyebrow"
                  defaultValue={section.eyebrow ?? ''}
                  className={adminField}
                />
              </Cell>
              {/* A textarea, not an input: the hero and routine promo titles
                  are deliberately two lines, and an input eats the break. */}
              <Cell label="Title" className="lg:col-span-2">
                <textarea
                  name="title"
                  rows={2}
                  defaultValue={section.title ?? ''}
                  className={adminField}
                />
              </Cell>
              <Cell label="Position">
                <input
                  name="sortOrder"
                  type="number"
                  min={0}
                  max={999}
                  defaultValue={section.sortOrder}
                  className={adminField}
                />
              </Cell>
              <Cell label="Description" className="lg:col-span-4">
                <textarea
                  name="description"
                  rows={2}
                  defaultValue={section.description ?? ''}
                  className={adminField}
                />
              </Cell>
              <Cell label="Button label">
                <input
                  name="ctaLabel"
                  defaultValue={section.ctaLabel ?? ''}
                  className={adminField}
                />
              </Cell>
              <Cell label="Button link">
                <input
                  name="ctaHref"
                  defaultValue={section.ctaHref ?? ''}
                  placeholder="/shop"
                  className={adminField}
                />
              </Cell>
              <Cell label="Image URL">
                <input
                  name="imageUrl"
                  defaultValue={section.imageUrl ?? ''}
                  className={adminField}
                />
              </Cell>
              <Cell label="Image alt text">
                <input
                  name="imageAlt"
                  defaultValue={section.imageAlt ?? ''}
                  className={adminField}
                />
              </Cell>
            </div>

            <div className="mt-3 flex gap-6 text-sm">
              <label className="text-fg flex items-center gap-2">
                <input
                  type="checkbox"
                  name="enabled"
                  defaultChecked={section.enabled}
                  className="size-4"
                />
                Shown
              </label>
              <label className="text-fg flex items-center gap-2">
                <input
                  type="checkbox"
                  name="dark"
                  defaultChecked={section.dark}
                  className="size-4"
                />
                Dark surface
              </label>
            </div>
          </RowForm>
        ))
      )}
    </section>
  );
}

/* --- announcements -------------------------------------------------------- */

async function Announcements() {
  const rows = await listAnnouncements();

  const fields = (announcement?: (typeof rows)[number]) => (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_9rem_9rem_5rem]">
      <Cell label="Message">
        <input
          name="message"
          required
          maxLength={200}
          defaultValue={announcement?.message ?? ''}
          className={adminField}
        />
      </Cell>
      <Cell label="Link">
        <input
          name="href"
          defaultValue={announcement?.href ?? ''}
          placeholder="/shop"
          className={adminField}
        />
      </Cell>
      <Cell label="Starts">
        <input
          name="startsAt"
          type="datetime-local"
          defaultValue={toLocalInput(announcement?.startsAt ?? null)}
          className={adminField}
        />
      </Cell>
      <Cell label="Ends">
        <input
          name="endsAt"
          type="datetime-local"
          defaultValue={toLocalInput(announcement?.endsAt ?? null)}
          className={adminField}
        />
      </Cell>
      <Cell label="Order">
        <input
          name="sortOrder"
          type="number"
          min={0}
          defaultValue={announcement?.sortOrder ?? 0}
          className={adminField}
        />
      </Cell>
    </div>
  );

  return (
    <section aria-label="Announcements">
      <p className="text-fg-subtle mb-4 text-xs">
        The bar above the header. Outside its window, or unticked, it does not
        render at all.
      </p>

      {rows.map((announcement) => (
        <RowForm
          key={announcement.id}
          id={announcement.id}
          action={saveAnnouncement}
          remove={deleteAnnouncement}
          className={row}
        >
          {fields(announcement)}
          <label className="text-fg mt-3 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="enabled"
              defaultChecked={announcement.enabled}
              className="size-4"
            />
            Shown
          </label>
        </RowForm>
      ))}

      <details className="border-line mt-6 border">
        <summary className="text-fg cursor-pointer px-4 py-3 text-sm">
          New announcement
        </summary>
        <div className="border-line border-t p-4">
          <RowForm id="" action={saveAnnouncement} saveLabel="Add">
            {fields()}
            <label className="text-fg mt-3 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="enabled"
                defaultChecked
                className="size-4"
              />
              Shown
            </label>
          </RowForm>
        </div>
      </details>
    </section>
  );
}

/* --- FAQ ------------------------------------------------------------------ */

async function Faq() {
  const rows = await listFaqs();
  const categories = [...new Set(rows.map((entry) => entry.category))];

  const fields = (entry?: (typeof rows)[number]) => (
    <>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,1fr)_5rem]">
        <Cell label="Question">
          <input
            name="question"
            required
            maxLength={300}
            defaultValue={entry?.question ?? ''}
            className={adminField}
          />
        </Cell>
        <Cell label="Category" hint={categories.join(', ')}>
          <input
            name="category"
            required
            list="faq-categories"
            defaultValue={entry?.category ?? 'general'}
            className={adminField}
          />
        </Cell>
        <Cell label="Order">
          <input
            name="sortOrder"
            type="number"
            min={0}
            defaultValue={entry?.sortOrder ?? 0}
            className={adminField}
          />
        </Cell>
      </div>
      <Cell label="Answer" className="mt-4">
        <textarea
          name="answer"
          required
          rows={3}
          maxLength={4000}
          defaultValue={entry?.answer ?? ''}
          className={adminField}
        />
      </Cell>
    </>
  );

  return (
    <section aria-label="FAQ">
      <datalist id="faq-categories">
        {categories.map((category) => (
          <option key={category} value={category} />
        ))}
      </datalist>

      {rows.length === 0 ? <NoRows>No questions yet.</NoRows> : null}

      {rows.map((entry) => (
        <RowForm
          key={entry.id}
          id={entry.id}
          action={saveFaq}
          remove={deleteFaq}
          className={row}
        >
          {fields(entry)}
          <label className="text-fg mt-3 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="enabled"
              defaultChecked={entry.enabled}
              className="size-4"
            />
            Shown
          </label>
        </RowForm>
      ))}

      <details className="border-line mt-6 border">
        <summary className="text-fg cursor-pointer px-4 py-3 text-sm">
          New question
        </summary>
        <div className="border-line border-t p-4">
          <RowForm id="" action={saveFaq} saveLabel="Add">
            {fields()}
            <label className="text-fg mt-3 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="enabled"
                defaultChecked
                className="size-4"
              />
              Shown
            </label>
          </RowForm>
        </div>
      </details>
    </section>
  );
}

/* --- pages ---------------------------------------------------------------- */

const dateFormat = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

async function Pages() {
  const rows = await listPages();

  return (
    <section aria-label="Pages">
      <p className="text-fg-subtle mb-4 text-xs">
        Policies and standing pages. Slugs are fixed — the storefront links to
        them by name.
      </p>
      <ul className="border-line border-t">
        {rows.map((page) => (
          <li
            key={page.id}
            className="border-line flex flex-wrap items-center gap-x-4 gap-y-1 border-b py-3 text-sm"
          >
            <Link
              href={`/admin/content/pages/${page.id}`}
              className="link-underline text-fg min-w-48"
            >
              {page.title}
            </Link>
            <span className="text-fg-subtle font-mono text-xs">
              /{page.slug}
            </span>
            <Badge tone={page.status === 'published' ? 'success' : 'neutral'}>
              {page.status}
            </Badge>
            {page.requiresLegalReview ? (
              <Badge tone="low">Needs legal review</Badge>
            ) : null}
            <span className="text-fg-subtle ml-auto text-xs">
              {dateFormat.format(page.updatedAt)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* --- navigation ----------------------------------------------------------- */

async function Navigation() {
  const rows = await listNavigationItems();

  const fields = (item?: (typeof rows)[number]) => (
    <div className="grid gap-4 lg:grid-cols-[8rem_minmax(0,1fr)_minmax(0,1.5fr)_8rem_8rem_5rem]">
      <Cell label="Location">
        <select
          name="location"
          defaultValue={item?.location ?? 'header'}
          className={adminField}
        >
          {navigationLocationEnum.enumValues.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </Cell>
      <Cell label="Label">
        <input
          name="label"
          required
          maxLength={80}
          defaultValue={item?.label ?? ''}
          className={adminField}
        />
      </Cell>
      <Cell label="Destination">
        <input
          name="href"
          required
          defaultValue={item?.href ?? ''}
          placeholder="/shop"
          className={adminField}
        />
      </Cell>
      <Cell label="Badge">
        <input
          name="badge"
          maxLength={20}
          defaultValue={item?.badge ?? ''}
          className={adminField}
        />
      </Cell>
      <Cell label="Column">
        <input
          name="columnGroup"
          maxLength={60}
          defaultValue={item?.columnGroup ?? ''}
          className={adminField}
        />
      </Cell>
      <Cell label="Order">
        <input
          name="sortOrder"
          type="number"
          min={0}
          defaultValue={item?.sortOrder ?? 0}
          className={adminField}
        />
      </Cell>
    </div>
  );

  return (
    <section aria-label="Navigation">
      <p className="text-fg-subtle mb-4 text-xs">
        Header, mega-menu and footer links. A link nested under a parent keeps
        its parent — only the label, destination and order are editable here.
      </p>

      {rows.map((item) => (
        <RowForm
          key={item.id}
          id={item.id}
          action={saveNavigationItem}
          remove={deleteNavigationItem}
          className={row}
        >
          {fields(item)}
          <label className="text-fg mt-3 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="enabled"
              defaultChecked={item.enabled}
              className="size-4"
            />
            Shown
            {item.parentId ? (
              <span className="text-fg-subtle ml-3 text-xs">nested</span>
            ) : null}
          </label>
        </RowForm>
      ))}

      <details className="border-line mt-6 border">
        <summary className="text-fg cursor-pointer px-4 py-3 text-sm">
          New link
        </summary>
        <div className="border-line border-t p-4">
          <RowForm id="" action={saveNavigationItem} saveLabel="Add">
            {fields()}
            <label className="text-fg mt-3 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="enabled"
                defaultChecked
                className="size-4"
              />
              Shown
            </label>
          </RowForm>
        </div>
      </details>
    </section>
  );
}
