import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireStaff } from '@/lib/auth';
import { getPage } from '@/lib/admin/content';
import { savePage } from '@/app/actions/admin-content';
import { blocksToText, canEditAsText } from '@/lib/content/text';
import { publishStatusEnum } from '@/lib/db/schema';
import { adminField, Cell, PageHeader } from '@/components/admin/admin-ui';
import { RowForm } from '@/components/admin/row-form';

/**
 * One standing page.
 *
 * The body is edited as plain text and stored as content blocks — see
 * `src/lib/content/text.ts`. A body holding anything the text form cannot
 * represent is shown read-only rather than round-tripped through a format that
 * would drop it.
 */
export default async function AdminPageEditor({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireStaff('content.manage');

  const { id } = await params;
  const page = await getPage(id);
  if (!page) notFound();

  const editable = canEditAsText(page.body);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Page"
        title={page.title}
        description={
          <>
            Live at{' '}
            <Link href={`/${page.slug}`} className="link-underline">
              /{page.slug}
            </Link>
          </>
        }
      />

      <p className="text-xs">
        <Link href="/admin/content?tab=pages" className="link-underline">
          All pages
        </Link>
      </p>

      <RowForm id={page.id} action={savePage} saveLabel="Save page">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_10rem]">
          <Cell label="Title">
            <input
              name="title"
              required
              maxLength={200}
              defaultValue={page.title}
              className={adminField}
            />
          </Cell>
          <Cell label="Status">
            <select
              name="status"
              defaultValue={page.status}
              className={adminField}
            >
              {publishStatusEnum.enumValues.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </Cell>
        </div>

        <Cell
          label="Body"
          className="mt-4"
          hint={
            editable
              ? 'Blank line between paragraphs. ## heading, ### sub-heading, - list, > quote, !! note, --- divider.'
              : 'This page contains images or product blocks, which this editor cannot represent — the body is left untouched when you save.'
          }
        >
          <textarea
            name="body"
            rows={22}
            readOnly={!editable}
            defaultValue={blocksToText(page.body)}
            className={`${adminField} font-mono text-xs leading-relaxed`}
          />
        </Cell>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <Cell label="SEO title">
            <input
              name="seoTitle"
              maxLength={200}
              defaultValue={page.seoTitle ?? ''}
              className={adminField}
            />
          </Cell>
          <Cell label="SEO description">
            <input
              name="seoDescription"
              maxLength={400}
              defaultValue={page.seoDescription ?? ''}
              className={adminField}
            />
          </Cell>
        </div>

        <label className="text-fg mt-4 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="requiresLegalReview"
            defaultChecked={page.requiresLegalReview}
            className="size-4"
          />
          Still needs legal review
        </label>
      </RowForm>
    </div>
  );
}
