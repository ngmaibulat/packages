# Changelog

All notable changes to `@aibulat/svelte-admin-kit`.

The package is pre-1.0: minor versions may change or remove an export. Every such
change is listed here.

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
