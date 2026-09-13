# Design

Nordic Lux is a quiet, editorial house. The photography is the loudest thing on
any page; everything else is hairlines, generous space and one serif.

## Principles

1. **Square corners.** `--radius-*` exists but is effectively 0 outside chips
   and avatars. Rounded corners read as "web app", not "printed catalogue".
2. **Hairlines, not boxes.** Structure comes from 1px rules and whitespace.
   Inputs are a baseline rule that darkens on focus — a printed form, not a
   text box.
3. **No shadows on content.** Shadows are reserved for things that genuinely
   float above the page: drawers, modals, dropdowns.
4. **One accent, used sparingly.** Colour signals state (sale, low stock,
   danger), never decoration.
5. **Motion is editorial.** Slow, eased, and always skippable —
   `prefers-reduced-motion` cuts every animation to nothing.

## Tokens

All in `src/app/globals.css`. Never hard-code a colour or a duration.

- **Surface / foreground** — `surface`, `surface-raised`, `surface-sunken`,
  `fg`, `fg-muted`, `fg-subtle`, `line`, `line-strong`, `accent`, `accent-fg`,
  `accent-soft`, `focus`. Light and dark are both defined; a component that
  uses tokens needs no dark-mode branch.
- **Type** — display serif at a single weight for headings
  (`display-xl` → `display-sm`), Archivo for UI. `--text-read` is the
  long-form body size, deliberately larger and looser than commerce UI.
- **Motion** — `--duration-micro` 160ms, `--duration-standard` 320ms,
  `--duration-editorial` 700ms, with `--ease-entrance` / `--ease-standard` /
  `--ease-exit`.

## Utilities

| Utility                          | Use                                                    |
| -------------------------------- | ------------------------------------------------------ |
| `page-x`                         | Page gutter. One rule so every section aligns.         |
| `section-y`                      | Vertical rhythm between major sections.                |
| `eyebrow`                        | Tracked uppercase micro-label.                         |
| `link-underline` / `link-retract`| Underline grows on hover / retracts on hover.          |

Links change by underline, not colour — a colour change breaks on ink surfaces.

## Components

**Buttons.** Square, uppercase micro-label, generous horizontal padding. Four
variants (`primary`, `secondary`, `ghost`, `quiet`), three sizes. `Button`
renders a `<button>`, `ButtonLink` renders a `<Link>` — no polymorphic
`asChild`. `IconButton` requires a `label`; an icon button with no accessible
name is a defect.

**Product cards.** 3:4 portrait, square corners, no shadow. **At most one
badge**, chosen by priority (out of stock → sale → new → low stock), so a grid
never becomes a wall of competing labels. Hover reveals the second shot and the
add control; neither is required to buy, and both stay reachable on touch.

**Product media.** One stage, defined once in
`src/components/commerce/product-media.tsx` and used by every surface that
shows a product photograph — card, gallery, gallery thumbnail, cart line,
search result, wishlist. 3:4, `object-contain`, centred, with a percentage
safe area so the margin scales from a 48px search thumbnail to a 700px
gallery. Packaging is never cropped and never stretched, which rules out
`object-cover` for product imagery anywhere.

The frame alone does not make photographs look like one set: source files are
framed by whoever shot them, so a bottle floating in a 900×900 white square and
a box cropped tight to 1100×532 come out at wildly different apparent sizes in
the same frame. That is normalised in the asset, once, by `npm run
media:normalize` — trim the studio border, seat the subject against the safe
area of a 3:4 canvas, pad with the source's own background colour. Framing
only: nothing cropped, stretched, enlarged or generated. Full-bleed
compositions are left alone.

**Brand logos.** Official assets only, held locally under
`public/media/brands` and provisioned by `npm run media:brand-logos`, which
records the source URL and a hash for every file. Never redrawn, traced or
generated, and never hotlinked. They sit on a shared stage
(`src/components/catalogue/brand-logo.tsx`) that equalises optical height —
box height alone is not enough, because a lockup carrying a descriptor line
has much more artwork around its letterforms than a bare wordmark, so each
brand carries a tuned scale. Original colours are kept: repainting a brand's
mark is not ours to do, and restraint comes from the size of the stage.

**Badges.** Always outlined, never filled — a solid colour block competes with
the photography.

**Empty states.** Always offer a way forward. An empty state with no recovery
action is a dead end.

**Filter rail.** Facets are links, not JS-controlled checkboxes. A facet that
would return zero results is shown at zero and made inert rather than removed,
so the list does not jump as refinements are applied.

## Iconography

Hand-drawn on a 24px grid, 1.25px stroke, round caps, no fills — deliberately
lighter than off-the-shelf sets (usually 2px) so icons sit at the same optical
weight as the hairlines and the type. Decorative by default (`aria-hidden`);
when an icon is a control's only content, the control carries the name.

Social marks follow the same rule rather than arriving as the platforms'
filled brand icons: a row of saturated logos in the footer would be the
loudest thing on a page built on restraint, and these are links to us, not
badges for them. Each glyph keeps the silhouette that reads at 18px.
Profiles are configuration (`SOCIAL_*_URL`), and a platform with no configured
URL renders nothing — the site never links to an account Nordic Lux does not
own.

## Menu navigation

- A top-level item with children is a `<button aria-expanded>`, not a link that
  also opens something. A control does one thing.
- Pointer users get hover-to-open with a short close delay, so a diagonal mouse
  path to the panel does not dismiss it.
- Keyboard users get click-to-toggle, Escape to close, focus returned to the
  trigger.
- Panels close on route change, reset during render so there is no frame where
  the old panel is still visible.

## Accessibility baseline

Non-negotiable, never simplified away. See ACCESSIBILITY.md.
