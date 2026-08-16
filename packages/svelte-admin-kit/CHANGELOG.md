# Changelog

All notable changes to `@aibulat/svelte-admin-kit`.

The package is pre-1.0: minor versions may change or remove an export. Every such
change is listed here.

## 0.3.0

Everything here is additive: no existing prop changes meaning and no export is
removed, so an existing consumer upgrades without edits. One visual change is
called out under "Changed".

The release comes from a second consumer adopting the kit — an app that had
hand-ported it while it was unpublished, and whose port had grown the five
components and the handful of props below. They are folded back in here rather
than left as a fork.

### Added

- **`./data`** — `RecordCard`, one record laid out as a card instead of a table
  row, and `DataTable.card`, the snippet that renders it. Below 40rem a table
  becomes a card list: a nine-column row inside a horizontal scroller is
  technically readable and practically not, because the reader scrolls right to
  find why a row is red and by then the name it belonged to is off the left
  edge. **Both layouts are always in the DOM and CSS picks one** — a `matchMedia`
  listener shows the wrong layout for a frame after every resize. `card` is
  optional, so a table that passes none is unchanged.
- **`DataTable.loading`** (+ `loadingMessage`), which suppresses the empty state
  rather than asserting emptiness before the first fetch returns. On a screen
  whose empty state is a _warning_, the version without this raised an alarm
  about a healthy configuration on every visit and then withdrew it.
- **`./overlay`** — `Drawer`, an edge-anchored panel on the native `<dialog>`,
  for a mobile nav. Separate from `Dialog` rather than a variant of it: the
  geometry is edge-anchored instead of centred, the height fixed instead of
  content-driven, and the close affordance part of the chrome rather than a
  footer button.
- **`Dialog.open` and `ConfirmDialog.open`**, a two-way boolean as an alternative
  to holding the element and calling `showModal()`. It defaults to `undefined`,
  not `false`, and that is load-bearing: a caller using only `bind:dialog` would
  otherwise own a prop permanently reading "closed", and the sync effect would
  race to close the dialog they had just opened by hand.
- **`./controls`** — `ChipList`, multi-value entry as removable chips. A
  comma-separated text box gives no feedback about what was parsed, no way to
  see that a trailing comma produced an empty entry, and no per-value
  validation.
- **`./layout`** — `Stepper`, a static progress rail for a multi-step form.
  Deliberately static: it reports a position, and motion on it would read as
  progress happening.
- **`./feedback`** — `PasswordPolicy`, the live requirement checklist under a
  password field. Shape carries the state as well as colour — unmet is a hollow
  ring, met a filled disc with a check in it — so it reads in greyscale and for
  a red/green colour vision deficiency.
- **`mono`** on `TextInput`, `Textarea` and `Td`: the monospace data face, for
  values a reader compares rather than reads. On `Td` it is a **separate axis
  from `numeric`**, not a synonym — `numeric` pulls a column of figures to the
  end edge, while a monospace id must stay start-aligned.
- **`Badge` gains an `idle` tone**, for "nothing has happened yet". Sharing
  `neutral` with it makes a queue of pending rows read as a queue of unlabelled
  ones.
- **`Icon.label`**, which turns the svg into a named `img` for the case where
  the glyph is the only content of its control. Without it the svg stays
  `aria-hidden`, which remains the right default: most icons sit inside a button
  that already has an `ariaLabel`, and naming both makes a screen reader say the
  same thing twice.
- **New tokens** — `--sak-font-mono`, `--sak-font-size-2xs`,
  `--sak-surface-muted`, `--sak-badge-idle-*`, `--sak-policy-check`, and the
  ten-token `--sak-auth-*` family described in the README.

### Changed

- **`Dialog.closeLabel` and `ConfirmDialog`'s three labels now have defaults**
  and are no longer required props. The no-i18n contract is unchanged — they are
  still props, and an app with a translator should still pass them.
- **`ConfirmDialog`'s confirm button is now solid** where a bare `danger` Button
  is outlined. An outlined delete is right in a table row, where it sits among
  many and a wall of filled red would be alarm noise; it is wrong here, where it
  is the only thing on the surface to press and the outline makes it read as the
  secondary choice next to a Cancel that actually is one.

## 0.2.0

### Added

- **`./layout`** — `PageHeader` (`title`, `subtitle?`, `actions?`, children).
- **`./feedback`** — `Alert` (four tones × two sizes) and `EmptyState`.
  `Alert.live` defaults to **`false`**: an `alert`/`status` role on a message
  that is already on screen at load makes a screen reader announce every
  standing caveat before the user has done anything. Set it only for a message
  that appears _in response_ to an action.
- **`./data`** — `DataTable` (+ `Th`, `Td`, `Tr`) and `Badge`. `DataTable` owns
  the scroll wrapper, the header row and the "no rows" row, whose `colspan`
  comes from `columns.length` rather than a hand-written number. Body rows stay
  with the caller through the `row` snippet, so per-row handlers and states
  remain expressible. Pass `key` whenever rows can be reordered, filtered or
  removed — without it `{#each}` reconciles by index and strands per-row state
  on the wrong record.
- **`./overlay`** — `Dialog`, `DialogBody`, `DialogFooter`, `ConfirmDialog`.
  `DialogBody` takes `as="form"` because a dialog that submits needs the
  `<form>` to carry the body padding; a component that rendered the footer
  itself would push the submit button out of the form it submits.
- `Td`/`Th`/`Tr` forward unrecognised attributes (`title`, `aria-*`, `data-*`)
  to the element.
- `Dialog` gained a `sm` size (28rem) alongside `md`/`lg`.

### Changed

- `defaultIcons` is now declared with `satisfies IconRegistry` instead of a
  `: IconRegistry` annotation. The annotation widened the keys to `string`, so a
  consumer spreading it into its own registry could not derive a literal-union
  icon name from the result. Non-breaking: the value is still assignable to
  `IconRegistry`.
- `TabNav` no longer shows a scrollbar. The strip still scrolls rather than
  wrapping (a tab strip on two lines stops reading as one control), but the
  scrollbar that appeared under the tabs whenever the labels outgrew the
  available width read as page furniture rather than as part of the control.
  What replaces it is a fade on whichever edge has content beyond it, applied
  only while there is something beyond it — implemented as a `mask-image`, not a
  colour gradient, because the strip sits on the consuming app's page
  background, for which the kit has no token, and a mask needs no colour to be
  correct in a light and a dark theme alike. No new `--sak-*` token.
- `TabNav` scrolls the active tab into view on mount and whenever `items`
  changes. With the scrollbar gone, an active tab past the edge would otherwise
  be invisible. It assigns `scrollLeft` rather than calling `scrollIntoView`,
  which would also scroll the page to reach it.
- The root entry (`.`) no longer re-exports `./editor`. That barrel pulls
  `monaco-editor` in at module scope, which made a bare
  `import { Icon } from '@aibulat/svelte-admin-kit'` both SSR-unsafe and heavy.
  The editors are reachable through `./editor` as before. **Breaking** for
  anyone importing an editor from the root entry.

### Fixed

- `styles/theme.css` had fallen ~15 tokens behind the components
  (`--sak-height-*`, `--sak-neutral-*`, `--sak-success-*`, `--sak-warning-*`,
  `--sak-card-border`, `--sak-btn-shadow`, `--sak-disabled-bg/-text`,
  `--sak-font-size-lg`, `--sak-pad-x-lg`), so a consumer following the README
  got different control geometry than intended. It is now a superset of what the
  components read, and `themeTokens.test.ts` asserts that in both directions —
  including that no orphan token is left declared. Three dead tokens
  (`--sak-danger-bg`, `--sak-pad-y-xs`, `--sak-surface-muted`) were removed.

## 0.1.0

Initial extraction: `./controls`, `./icon`, `./editor`, `./richtext`,
`./richtext-editor`.
