# Architecture

## Shape

Next.js 16 (App Router, Turbopack) on Node 22+, Postgres 17 via Drizzle,
Valkey for cache and rate limiting. Server-rendered by default; client
components exist only where interaction genuinely requires them.

```
src/
  app/
    (storefront)/     route group — customer-facing chrome
    actions/          server actions (mutations)
    api/              route handlers (cart, search, chat)
  components/
    ui/               design-system primitives, no domain knowledge
    layout/           header, footer, shells, page header
    commerce/         cart, product card, PDP, wishlist, search
    catalogue/        listing furniture (grid, facets, pagination)
    home/             homepage section renderers
    support/          live chat
  lib/
    db/               schema, migrations, connection
    catalogue/        product + taxonomy queries, read models, URL parsing
    cart/             cart state and the pricing engine
    auth/             sessions, passwords, permissions
    env.ts            server-only, validated environment contract
```

## Rules that hold everywhere

**Read models, not rows.** Queries return the shapes in
`src/lib/catalogue/types.ts`, never raw database rows. A new column cannot
silently leak an internal note or a cost price into a server-rendered payload.

**The URL is the state.** Every listing's filters, sort and page live in the
query string and are parsed by `src/lib/catalogue/query.ts`. There is no client
filter store. Refinements are `<Link>`s, so filtering works before hydration,
each refinement is shareable, and Back undoes exactly one step.

**Route-locked filters are separate from user filters.** `parseListing` takes
the route's own filters (the brand on `/brands/kvist`) as a second argument and
returns them alongside the merged set. A crafted query string therefore cannot
widen a listing past the page it claims to be, and facet counting knows which
refinements are removable.

**Server-only means server-only.** `src/lib/env.ts` imports `server-only`.
Client components read `src/lib/public-config.ts`, which only ever touches
literal `process.env.NEXT_PUBLIC_*` expressions.

**One query, not N+1.** Product listings resolve price range, stock and imagery
through lateral joins in the same statement. Every interpolated value goes
through Drizzle's `sql` tagged template, which binds parameters.

**`cache()` on shared reads.** Navigation, announcements and taxonomy are
needed by the layout and the page alike; React's `cache` dedupes them within a
render.

## Faceted search

Counts use drill-down semantics: a dimension is counted with its **own**
selection removed and every other filter applied, so a second brand can always
be added to a brand refinement. Route-locked filters are reapplied to every
dimension because they define the page rather than a removable refinement. The
price range ignores its own bounds for the same reason.

## Money

Integer minor units (cents) everywhere. `src/lib/money.ts` refuses non-integer
amounts and refuses to mix currencies. The customer catalogue currently presents
prices in USD; admin and storefront mutations keep using integer cents rather
than floating-point arithmetic.

## Payments

Checkout reprices and reserves stock in one database transaction before any
provider call. `src/lib/payments` isolates mock, PayHere, and Stripe drivers.
Stripe uses hosted Checkout Sessions, so Nordic Lux never receives card data.
The signed raw-body webhook is authoritative; browser returns only render the
order's current database status. Payment confirmation is row-locked and
idempotent, while an expired Stripe session cancels once and writes compensating
reservation ledger movements.

## Overlays

Modal and drawer are a native `<dialog>` opened with `showModal()` — the
platform supplies the focus trap, Escape, inertness, top-layer stacking and
`::backdrop`. Transitions are CSS (`@starting-style` plus `allow-discrete`).

One trap worth knowing: applying a `display` utility to a `<dialog>` overrides
the UA's `dialog:not([open]) { display: none }`, leaving the closed dialog laid
out and intercepting clicks. Use the `open:` variant.

## Environment

`src/lib/env.ts` validates the whole contract at module load and fails the
process at startup rather than at the first request. Production-only
cross-field invariants (no mock payments, no log-only mail, HTTPS) are checked
separately and skipped during `next build`, which evaluates modules with
`NODE_ENV=production` before deployment credentials exist.

## Testing

- **Unit** — pure logic: money, pricing, passwords, URL parsing.
- **Integration** — real seeded Postgres, for defects a mock cannot see (a
  correlated subquery binding to the wrong column, a filter matching nothing).
  Skipped when no database is reachable.
- **E2E** — Playwright, desktop and mobile, asserting behaviour rather than
  copy so merchandising changes do not turn the suite red.
