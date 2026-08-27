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
