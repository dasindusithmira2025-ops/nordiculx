import Image from 'next/image';
import Link from 'next/link';
import type { ContentBlock } from '@/lib/db/schema';
import type { ProductCardView } from '@/lib/catalogue/types';
import { cn } from '@/lib/cn';
import { Prose } from '@/components/ui/display';
import { ProductCard } from '@/components/commerce/product-card';
import { ProductGrid } from '@/components/catalogue/listing';

/**
 * Renderer for stored editorial content.
 *
 * Content arrives as a typed `ContentBlock[]` (see src/lib/db/schema/content.ts)
 * and every block is drawn by the fixed map below. There is deliberately no
 * `dangerouslySetInnerHTML` anywhere in this file: an editor account — or a
 * compromised one — has no path from stored content to executing script in the
 * storefront. An unrecognised block type renders nothing rather than throwing,
 * so a newer CMS block cannot 500 an older deployment.
 *
 * Product blocks reference products by id. Resolving those ids per block would
 * be an N+1, so the caller collects them with `collectProductIds`, fetches once
 * and passes the lookup in.
 */

export type BlockProducts = Map<string, ProductCardView>;

/** Every product id referenced by a block array, de-duplicated, in order. */
export function collectProductIds(blocks: ContentBlock[]): string[] {
  const ids = new Set<string>();
  for (const block of blocks) {
    if (block.type === 'product') ids.add(block.productId);
    if (block.type === 'product_grid') {
      for (const id of block.productIds) ids.add(id);
    }
  }
  return [...ids];
}

/* -------------------------------------------------------------------------- */
/* Individual blocks                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Full-bleed-ish figure. Breaks the prose measure because a photograph
 * constrained to text width reads as an illustration rather than the subject.
 */
function ImageBlock({
  url,
  alt,
  caption,
  ratio,
}: {
  url: string;
  alt: string;
  caption?: string;
  ratio?: string;
}) {
  return (
    <figure className="my-14">
      <div
        className="bg-surface-sunken relative w-full overflow-hidden"
        style={{ aspectRatio: ratio ?? '3 / 2' }}
      >
        <Image
          src={url}
          alt={alt}
          fill
          sizes="(min-width: 1024px) 60rem, 100vw"
          className="object-cover"
        />
      </div>
      {caption ? (
        <figcaption className="text-fg-subtle mt-3 text-xs">
          {caption}
        </figcaption>
      ) : null}
    </figure>
  );
}

function ImagePairBlock({
  images,
}: {
  images: { url: string; alt: string }[];
}) {
  if (images.length === 0) return null;
  return (
    <div className="my-14 grid grid-cols-1 gap-4 sm:grid-cols-2">
      {images.map((image, i) => (
        <div
          key={`${image.url}-${i}`}
          className="bg-surface-sunken relative aspect-[4/5] overflow-hidden"
        >
          <Image
            src={image.url}
            alt={image.alt}
            fill
            sizes="(min-width: 640px) 30rem, 100vw"
            className="object-cover"
          />
        </div>
      ))}
    </div>
  );
}

/**
 * Aside for a warning or a note. A hairline rule and a tint — not a filled
 * card, which would compete with the photography.
 */
function CalloutBlock({ title, text }: { title?: string; text: string }) {
  return (
    <aside className="border-line-strong bg-surface-sunken my-12 border-l px-6 py-5">
      {title ? <p className="eyebrow text-fg mb-2">{title}</p> : null}
      <p className="text-fg-muted text-base">{text}</p>
    </aside>
  );
}

/** A single product recommended inline, with the editor's note beside it. */
function ProductBlock({
  product,
  note,
}: {
  product: ProductCardView | undefined;
  note?: string;
}) {
  // A block pointing at a product that has since been unpublished or deleted
  // must not blank the article it appears in.
  if (!product) return null;

  return (
    <div className="my-14 grid gap-6 sm:grid-cols-[14rem_1fr] sm:items-center">
      <ProductCard product={product} sizes="14rem" />
      {note ? (
        <p className="text-fg-muted text-read max-w-prose">{note}</p>
      ) : null}
    </div>
  );
}

function ProductGridBlock({
  products,
  title,
}: {
  products: ProductCardView[];
  title?: string;
}) {
  if (products.length === 0) return null;
  return (
    <section className="my-16">
      {title ? (
        <h2 className="font-display text-display-sm text-fg mb-8">{title}</h2>
      ) : null}
      <ProductGrid products={products} />
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* The renderer                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Draws one block. Prose-flow blocks (paragraphs, headings, lists, quotes) are
 * wrapped by the caller in a single `Prose` so the typographic rhythm between
 * them comes from one place; media and commerce blocks break out of it.
 */
function Block({
  block,
  products,
}: {
  block: ContentBlock;
  products: BlockProducts;
}) {
  switch (block.type) {
    case 'paragraph':
      return <p>{block.text}</p>;

    case 'heading': {
      const Tag = block.level === 2 ? 'h2' : 'h3';
      return <Tag>{block.text}</Tag>;
    }

    case 'quote':
      return (
        <blockquote>
          {block.text}
          {block.attribution ? (
            <footer className="text-fg-subtle tracking-eyebrow mt-3 font-sans text-xs uppercase not-italic">
              {block.attribution}
            </footer>
          ) : null}
        </blockquote>
      );

    case 'list':
      return block.ordered ? (
        <ol>
          {block.items.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ol>
      ) : (
        <ul>
          {block.items.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      );

    case 'divider':
      return <hr className="border-line my-14 border-0 border-t" />;

    case 'image':
      return (
        <ImageBlock
          url={block.url}
          alt={block.alt}
          caption={block.caption}
          ratio={block.ratio}
        />
      );

    case 'image_pair':
      return <ImagePairBlock images={block.images} />;

    case 'callout':
      return <CalloutBlock title={block.title} text={block.text} />;

    case 'product':
      return (
        <ProductBlock
          product={products.get(block.productId)}
          note={block.note}
        />
      );

    case 'product_grid':
      return (
        <ProductGridBlock
          title={block.title}
          products={block.productIds.flatMap((id) => {
            const product = products.get(id);
            return product ? [product] : [];
          })}
        />
      );

    default:
      // An unknown block type is a newer CMS talking to an older deployment.
      // Rendering nothing is correct; throwing would take the page down.
      return null;
  }
}

/** Blocks that participate in the text measure rather than breaking out of it. */
const FLOW_TYPES = new Set<ContentBlock['type']>([
  'paragraph',
  'heading',
  'quote',
  'list',
]);

/**
 * Renders a block array, grouping consecutive prose blocks into one `Prose` so
 * the spacing between a heading and the paragraph under it is handled by the
 * prose styles rather than re-declared per block.
 */
export function ContentBlocks({
  blocks,
  products = new Map(),
  className,
}: {
  blocks: ContentBlock[];
  products?: BlockProducts;
  className?: string;
}) {
  if (blocks.length === 0) return null;

  const groups: { flow: boolean; blocks: ContentBlock[] }[] = [];
  for (const block of blocks) {
    const flow = FLOW_TYPES.has(block.type);
    const last = groups.at(-1);
    if (last && last.flow === flow) last.blocks.push(block);
    else groups.push({ flow, blocks: [block] });
  }

  return (
    <div className={cn('text-fg', className)}>
      {groups.map((group, gi) =>
        group.flow ? (
          <Prose key={gi}>
            {group.blocks.map((block, bi) => (
              <Block key={bi} block={block} products={products} />
            ))}
          </Prose>
        ) : (
          <div key={gi}>
            {group.blocks.map((block, bi) => (
              <Block key={bi} block={block} products={products} />
            ))}
          </div>
        ),
      )}
    </div>
  );
}

/**
 * Shared "Shop the story" strip used under articles and campaigns, for products
 * attached to the piece as a relation rather than embedded as a block.
 */
export function ShopTheStory({
  products,
  title = 'Shop the story',
  href,
}: {
  products: ProductCardView[];
  title?: string;
  href?: string;
}) {
  if (products.length === 0) return null;

  return (
    <section className="border-line section-y border-t">
      <div className="mb-10 flex items-end justify-between gap-6">
        <h2 className="font-display text-display-sm text-fg">{title}</h2>
        {href ? (
          <Link href={href} className="eyebrow text-fg link-underline">
            Shop all
          </Link>
        ) : null}
      </div>
      <ProductGrid products={products} />
    </section>
  );
}
