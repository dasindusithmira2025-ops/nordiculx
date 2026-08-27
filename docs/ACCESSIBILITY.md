# Accessibility

Baseline: WCAG 2.2 AA. These are requirements, not aspirations — the ponytail
rule about simplifying does not apply here.

## Always

- **Visible focus.** `:focus-visible` gives a 2px `--focus` outline at 3px
  offset, site-wide, one shape. Never removed without a replacement.
- **Real controls.** Buttons are `<button>`, links are `<a>`. Checkboxes and
  radios are real inputs with a drawn control on top, so keyboard, form
  submission and screen-reader semantics stay native.
- **Every control has a name.** `IconButton` requires `label`. An icon-only
  control with no accessible name is treated as a bug.
- **Field wiring is automatic.** `Field` owns the id and wires `<label for>`,
  `aria-describedby` for hint and error, and `aria-invalid`. Wiring it at the
  primitive means no individual form can forget it.
- **Errors announce.** Field errors carry `role="alert"` so they are read the
  moment they appear after a failed submit.
- **Reduced motion is honoured.** `prefers-reduced-motion: reduce` collapses
  every animation and transition, and disables smooth scrolling.

## Patterns

**Overlays.** Native `<dialog>` + `showModal()`. Focus trap, Escape,
background inertness and the backdrop come from the platform rather than from
code that has to be kept correct.

Closed dialogs must not remain in the layout. Applying a `display` utility to a
`<dialog>` overrides the UA's `dialog:not([open]) { display: none }` and leaves
an invisible panel intercepting pointer events — use the `open:` variant.

**Predictive search** implements the ARIA combobox pattern properly: the input
owns `aria-expanded`, `aria-controls` and `aria-activedescendant`; the list is a
`listbox` of `option`s; arrow keys move a visual highlight **without** moving
DOM focus, so the typed query is never disturbed.

**Navigation.** See DESIGN.md § Menu navigation. Disclosure buttons carry
`aria-expanded` and `aria-controls`; Escape closes and returns focus.

**Ratings** render as one accessible string ("Rated 4.3 out of 5 from 12
reviews") plus five decorative glyphs, with a clipped overlay for the
fractional star so 4.3 does not silently round to 4.

**Prices.** A superseded price uses `<s>` with visually-hidden "Was", so
assistive tech announces a relationship rather than two unrelated numbers.

**Pagination** is a `<nav aria-label="Pagination">`; the current page carries
`aria-current="page"`; prev/next carry `rel`.

**Breadcrumbs** are an ordered list in a `<nav aria-label="Breadcrumb">`, with
the final crumb marked `aria-current="page"` and not a link.

**Filter facets** are links. A facet that cannot return results is
`aria-disabled` and removed from the tab order rather than deleted from the DOM.

## Content

- One `<h1>` per page, from `PageHeader`.
- Images carry meaningful `alt`; decorative and duplicate imagery (the hover
  shot on a card) uses `alt=""` with `aria-hidden`.
- Colour is never the only signal — stock, sale and error states pair colour
  with text or an icon.

## Known gaps

- No automated axe run in CI yet.
- Keyboard traversal of the mega-navigation panels has been implemented but not
  yet covered by an end-to-end test.
