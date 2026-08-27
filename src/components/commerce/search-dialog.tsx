'use client';

import { useEffect, useId, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/cn';
import { formatMoney } from '@/lib/money';
import type { SearchResult, SearchResults } from '@/lib/catalogue/search';
import { Skeleton } from '@/components/ui/display';
import { IconButton } from '@/components/ui/button';
import { CloseIcon, SearchIcon } from '@/components/ui/icons';

/**
 * Predictive search.
 *
 * Implements the ARIA combobox pattern properly: the input owns
 * `aria-expanded`, `aria-controls` and `aria-activedescendant`; the list is a
 * `listbox` of `option`s; and arrow keys move a visual highlight WITHOUT moving
 * DOM focus, so the typed query is never disturbed. Enter opens the highlighted
 * result, Escape closes.
 *
 * Recent searches are kept in localStorage — they are the visitor's own history
 * and never leave the device.
 */

const RECENT_KEY = 'nl:recent-searches';
const MAX_RECENT = 5;

function readRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter((v) => typeof v === 'string')
      : [];
  } catch {
    return [];
  }
}

function pushRecent(term: string) {
  try {
    const next = [term, ...readRecent().filter((t) => t !== term)].slice(
      0,
      MAX_RECENT,
    );
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // Storage disabled or full — recent searches are a nicety, not a feature.
  }
}

function flatten(results: SearchResults | null): SearchResult[] {
  if (!results) return [];
  return [
    ...results.products,
    ...results.brands,
    ...results.categories,
    ...results.concerns,
    ...results.articles,
  ];
}

export function SearchDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(-1);
  const [recent, setRecent] = useState<string[]>([]);

  // Opening refreshes the recent list; closing clears the query. Both are
  // reactions to `open` changing, so they belong in render rather than an
  // effect — the dialog's first painted frame already has the right content.
  const [lastOpen, setLastOpen] = useState(open);
  if (lastOpen !== open) {
    setLastOpen(open);
    if (open) {
      setRecent(readRecent());
    } else {
      setQuery('');
      setResults(null);
      setActive(-1);
    }
  }

  useEffect(() => {
    if (!open) return;
    // Focus after the panel has been painted, or the caret lands nowhere.
    const timer = window.setTimeout(() => inputRef.current?.focus(), 60);
    return () => window.clearTimeout(timer);
  }, [open]);

  // Debounced fetch. The abort controller cancels a superseded request so a
  // slow early response cannot overwrite a fast later one.
  useEffect(() => {
    // Too short to search. Whatever is in `results` stays put but is never
    // read — `items` below derives from the same guard — so there is nothing
    // to clear and no extra render to pay for.
    if (query.trim().length < 2) return;

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const response = await fetch(
          `/api/search?q=${encodeURIComponent(query)}`,
          {
            signal: controller.signal,
          },
        );
        if (!response.ok) throw new Error('search failed');
        setResults((await response.json()) as SearchResults);
        setActive(-1);
      } catch (error) {
        if ((error as Error).name !== 'AbortError') setResults(null);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 200);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [query]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    document.documentElement.classList.add('scroll-locked');
    return () => {
      document.removeEventListener('keydown', onKey);
      document.documentElement.classList.remove('scroll-locked');
    };
  }, [open, onClose]);

  if (!open) return null;

  // Results from a previous, longer query are ignored while the box is back
  // below the search threshold — this keeps `aria-expanded` and the Enter key
  // honest without an extra state reset.
  const items = query.trim().length < 2 ? [] : flatten(results);

  const go = (href: string) => {
    if (query.trim()) pushRecent(query.trim());
    onClose();
    router.push(href);
  };

  const submit = () => {
    const term = query.trim();
    if (!term) return;
    pushRecent(term);
    onClose();
    router.push(`/shop?q=${encodeURIComponent(term)}`);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => (items.length === 0 ? -1 : (i + 1) % items.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) =>
        items.length === 0 ? -1 : (i - 1 + items.length) % items.length,
      );
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = items[active];
      if (item) go(item.href);
      else submit();
    }
  };

  return (
    <div className="fixed inset-0 z-50">
      {/* Scrim. Clicking it dismisses; it is not a focus target. */}
      <button
        type="button"
        aria-label="Close search"
        onClick={onClose}
        className="bg-ink-950/55 absolute inset-0 h-full w-full cursor-default backdrop-blur-[2px]"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search"
        className="animate-slide-down border-line bg-surface relative border-b"
      >
        <div className="page-x mx-auto max-w-(--container-page)">
          <div className="flex items-center gap-4 py-5">
            <SearchIcon className="text-fg-subtle shrink-0" />
            <input
              ref={inputRef}
              type="search"
              role="combobox"
              aria-expanded={items.length > 0}
              aria-controls={listId}
              aria-autocomplete="list"
              aria-activedescendant={
                active >= 0 && items[active] ? `${listId}-${active}` : undefined
              }
              autoComplete="off"
              placeholder="Search products, brands, concerns…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              className="font-display text-display-sm text-fg placeholder:text-fg-subtle h-10 flex-1 border-0 bg-transparent p-0 focus:outline-none [&::-webkit-search-cancel-button]:hidden"
            />
            <IconButton
              label="Close search"
              onClick={onClose}
              className="-mr-2"
            >
              <CloseIcon />
            </IconButton>
          </div>

          <div className="max-h-[70dvh] overflow-y-auto pb-10">
            {/* Idle state: recent searches and a few entry points. */}
            {query.trim().length < 2 ? (
              <div className="grid gap-10 py-6 sm:grid-cols-2">
                {recent.length > 0 ? (
                  <div>
                    <p className="eyebrow text-fg-subtle mb-4">Recent</p>
                    <ul className="space-y-2">
                      {recent.map((term) => (
                        <li key={term}>
                          <button
                            type="button"
                            onClick={() => setQuery(term)}
                            className="text-fg-muted link-underline text-sm"
                          >
                            {term}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                <div>
                  <p className="eyebrow text-fg-subtle mb-4">Popular</p>
                  <ul className="space-y-2">
                    {['Serums', 'Sun care', 'Fragrance', 'Barrier support'].map(
                      (term) => (
                        <li key={term}>
                          <button
                            type="button"
                            onClick={() => setQuery(term)}
                            className="text-fg-muted link-underline text-sm"
                          >
                            {term}
                          </button>
                        </li>
                      ),
                    )}
                  </ul>
                </div>
              </div>
            ) : loading && !results ? (
              <div className="grid gap-6 py-6 sm:grid-cols-3">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="flex gap-4">
                    <Skeleton className="aspect-3/4 w-16" />
                    <div className="flex-1 space-y-2 py-1">
                      <Skeleton className="h-3 w-20" />
                      <Skeleton className="h-4 w-32" />
                    </div>
                  </div>
                ))}
              </div>
            ) : items.length === 0 ? (
              <div className="py-14 text-center">
                <p className="font-display text-display-sm">
                  Nothing matched “{query}”
                </p>
                <p className="text-fg-muted mt-3 text-sm">
                  Try a brand, a category, or a concern — or browse everything.
                </p>
                <Link
                  href="/shop"
                  onClick={onClose}
                  className="eyebrow text-fg link-underline mt-6 inline-block"
                >
                  Shop all products
                </Link>
              </div>
            ) : (
              <ul
                id={listId}
                role="listbox"
                aria-label="Search results"
                className="py-2"
              >
                {results?.products.length ? (
                  <li role="presentation">
                    <p className="eyebrow text-fg-subtle px-1 py-3">Products</p>
                  </li>
                ) : null}
                {items.map((item, index) => {
                  const isProduct = item.kind === 'product';
                  const isFirstNonProduct =
                    !isProduct && items[index - 1]?.kind === 'product';
                  return (
                    <li key={`${item.kind}-${item.id}`} role="presentation">
                      {isFirstNonProduct ? (
                        <p className="eyebrow text-fg-subtle px-1 pt-6 pb-3">
                          Also matching
                        </p>
                      ) : null}
                      <Link
                        id={`${listId}-${index}`}
                        role="option"
                        aria-selected={active === index}
                        href={item.href}
                        onClick={(e) => {
                          e.preventDefault();
                          go(item.href);
                        }}
                        onMouseEnter={() => setActive(index)}
                        className={cn(
                          'flex items-center gap-4 px-1 py-2.5 transition-colors',
                          active === index && 'bg-accent-soft',
                        )}
                      >
                        {isProduct ? (
                          <span className="bg-surface-sunken relative block aspect-3/4 w-12 shrink-0 overflow-hidden">
                            {item.imageUrl ? (
                              <Image
                                src={item.imageUrl}
                                alt=""
                                fill
                                sizes="48px"
                                className="object-cover"
                              />
                            ) : null}
                          </span>
                        ) : (
                          <span className="eyebrow text-fg-subtle w-12 shrink-0">
                            {item.kind === 'article' ? 'Read' : item.kind}
                          </span>
                        )}

                        <span className="min-w-0 flex-1">
                          {item.subtitle && isProduct ? (
                            <span className="eyebrow text-fg-subtle block">
                              {item.subtitle}
                            </span>
                          ) : null}
                          <span className="text-fg block truncate text-sm">
                            {item.title}
                          </span>
                        </span>

                        {item.price !== null ? (
                          <span className="text-fg-muted shrink-0 text-sm tabular-nums">
                            {formatMoney(item.price)}
                          </span>
                        ) : null}
                      </Link>
                    </li>
                  );
                })}

                <li role="presentation" className="border-line border-t pt-4">
                  <button
                    type="button"
                    onClick={submit}
                    className="eyebrow text-fg link-underline px-1 py-2"
                  >
                    See all results for “{query}”
                  </button>
                </li>
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
