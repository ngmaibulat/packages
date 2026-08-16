# @aibulat/svelte-admin-kit

Reusable Svelte 5 admin-UI primitives, extracted from the SIEM Tracker app. It covers the
controls, the page-level structure around them, and the overlays — see "Roadmap" for what is
deliberately still outside.

## What's in the box

- **`./controls`** — the form and action primitives: `Button`, `ButtonGroup`, `Field`,
  `TextInput`, `Textarea`, `Select`, `Checkbox`, `CheckboxGroup`, `FileDropzone`,
  `ReorderControls`, `ColumnListEditor`, `TabNav`, `Card`, plus the helpers `formatBytes`,
  `fileMatchesAccept` and `toColumnDrafts`. Every string these render is a prop — the package
  carries no translator (see "No i18n" below). `CheckboxGroup` stacks its boxes one per row and
  offers no column count: a horizontal row of checkboxes is what it exists to prevent.
  `ChipList` is multi-value entry as removable chips, which exists because a
  comma-separated text box gives no feedback about what was parsed and no per-value validation.
- **`./layout`** — `PageHeader` (the `<h1>` + subtitle + actions block a screen opens with) and
  `Stepper`, a static progress rail for a multi-step form.
- **`./feedback`** — `Alert`, `EmptyState` and `PasswordPolicy`. `Alert` has four tones (`info`, `success`,
  `warning`, `error`) and two sizes. **`live` defaults to `false`**: an `alert`/`status` role
  on a message that is already on screen at load makes a screen reader announce every standing
  caveat before the user has done anything, which is worse than silence. Set it only where the
  message appears _in response_ to an action.
- **`./data`** — `DataTable` (+ `Th`, `Td`, `Tr`, `RecordCard`) and `Badge`. `DataTable` owns
  three things and no more: the horizontal-scroll wrapper, the header row declared by
  `columns`, and the "no rows" row — whose `colspan` comes from `columns.length` rather than a
  number someone typed. Body rows stay with the caller via the `row` snippet, because that is
  where tables actually differ. Pass `key` whenever rows can be reordered, filtered or removed.
  Pass `loading` so the table does not assert "there is nothing here" before it has been told,
  and `card` (rendering a `RecordCard`) to get the responsive table→cards swap described under
  "Breakpoints".
- **`./overlay`** — `Dialog`, `DialogBody`, `DialogFooter`, `ConfirmDialog`, `Drawer`, over the native
  `<dialog>` element (which already gives focus trapping, page inertness, Escape-to-close and
  top-layer stacking). The body and footer are separate components rather than snippets so a
  dialog that submits can wrap both in one `<form>`; `DialogBody` also takes `as="form"` to be
  that form itself.
- **`./icon`** — `Icon`, a lightweight inline-SVG icon component driven by a caller-supplied
  icon registry (`Record<string, string>` of raw inner-`<svg>` path markup), plus
  `defaultIcons`, a small generic set of UI-chrome icons (menu, close, search, arrows, info,
  trash, cornerDownLeft).
- **`./editor`** — `MarkdownEditor` and `MjmlSourceEditor`, Monaco-based editor components,
  plus the shared bootstrap (`ensureMonacoConfigured`, `setMentionCandidates`, `monaco`) and
  `formatMarkdownTables`/`buildMarkdownTable`, a dependency-free GFM table pretty-printer used
  as the markdown editor's default document-formatting provider.
- **`./richtext-editor`** — `RichTextEditor`, a tiptap-based rich-text editor (tables,
  callouts, resizable images, `@`-mentions, emoji, slash menu), with its labels
  overridable via `./richtext/labels`.
- **`./richtext`** — the framework-agnostic half of the same kit: `buildRichtextExtensions`
  and the `RICHTEXT_NODE_TYPES`/`RICHTEXT_MARK_TYPES` allowlists, so a **server** can render
  and sanitise the editor's documents against the exact same schema the client wrote them
  with. Imports no Svelte and is safe to evaluate in Node.

Monaco (`./editor`) and tiptap (`./richtext-editor`) must never load together — that is what
the separate subpaths are for.

### Required global stylesheet

If you render stored rich-text content anywhere, import
`@aibulat/svelte-admin-kit/richtext/content.css` **once at your app root**. Read-only content
appears on pages that never load the editor bundle, so its styles cannot ship with the editor.

## No i18n

Nothing in this package translates anything. Components take their labels as props and report
actions through callbacks, so a consuming app supplies strings from whatever i18n system it
already has. Where that plumbing gets repetitive, wrap the component once in your own app:

```svelte
<!-- src/lib/components/ui/UploadField.svelte -->
<FileDropzone {...props} browseLabel={t('browse')} clearLabel={t('clear')} />
```

## Peer dependencies

You must install `svelte` (`^5.0.0`) and `monaco-editor` (`^0.55.0`) yourself — both are
peer dependencies, not bundled, so a single copy of each is shared with the rest of your app.

## Important: this package assumes a Vite-based build

`MarkdownEditor`/`MjmlSourceEditor`'s Monaco bootstrap wires up its web worker via Vite's
`?worker` import suffix (`monaco-editor/esm/vs/editor/editor.worker?worker`) — the standard
way to give Monaco a worker without a bundler-specific plugin under Vite. If you're not on
Vite (Webpack, Rollup, esbuild directly), you'll need to configure Monaco's worker loading
yourself before importing anything from `./editor` — see Monaco's own
[webpack](https://github.com/microsoft/monaco-editor/tree/main/samples/browser-esm-webpack)
integration docs for the general shape of what's needed.

## SSR note

`monacoSetup.ts` imports `monaco-editor` at module scope, which breaks server-side rendering
if the module is ever evaluated on the server. **Only ever reach `./editor`'s exports via a
dynamic `import()` inside `onMount` (or an equivalent client-only lifecycle hook), never at
module scope in a server-rendered route/page.** For example:

```svelte
<script lang="ts">
	import { onMount } from 'svelte';
	import type { Component } from 'svelte';

	let MarkdownEditor = $state<Component<any> | null>(null);
	onMount(async () => {
		MarkdownEditor = (await import('@aibulat/svelte-admin-kit/editor')).MarkdownEditor;
	});
</script>

{#if MarkdownEditor}
	<MarkdownEditor value={body} onChange={(v) => (body = v)} />
{:else}
	<textarea bind:value={body}></textarea>
{/if}
```

## Theming

Components ship sensible default styling with **zero required CSS import** — every
`--sak-*` token has a literal fallback baked into the rule that uses it, so the kit looks
finished before you configure anything.
To customize, either pass `size`/`strokeWidth`/`color` props directly, or import
`@aibulat/svelte-admin-kit/styles/theme.css` once at your app root and override its
`--sak-*`-prefixed custom properties:

```css
:root {
	--sak-icon-size: 1.25rem;
	--sak-icon-stroke-width: 1.5;
}
```

The tidiest way to adopt the kit into an app that already has design tokens is to map them
rather than restate them:

```css
:root {
	--sak-primary-bg: var(--btn-primary-bg);
	--sak-surface: var(--surface);
	--sak-focus-ring: var(--focus-ring);
}
```

Because each mapping is a `var()` reference, a dark theme that redefines `--surface` on the
same element updates every `--sak-*` that reads it — you do not need a second block.

The `--sak-` prefix is deliberate — it avoids colliding with any unprefixed custom properties
(`--border`, `--surface`, etc.) your own app may already define.

**If you map rather than import, map everything.** An unmapped token silently falls back to the
kit's own literal, and those literals are a light slate palette — so a gap is invisible in light
mode and wrong in dark, which is the worst way for it to fail. The kit's own
`src/tests/themeTokens.test.ts` asserts that `theme.css` lists exactly the tokens the components
read, in both directions; a consuming app that maps tokens instead of importing that file wants
the same assertion over its own stylesheet.

### The auth layer

`Stepper` and `PasswordPolicy` take `variant="auth"`, which switches them onto the
`--sak-auth-*` family instead of the ordinary app tokens. It exists for the common arrangement
where a sign-in or first-run console has a single dark treatment that does **not** flip with the
theme — the panel stays dark in light mode and only the card on top of it changes. That is one
surface with its own palette, so it gets its own tokens rather than being expressed as overrides
of the app ones, which would have to be undone again on every ordinary screen.

Seven tokens dress the panel (`--sak-auth-{line,chip-bg,dim,dot,on,accent,glow}`) and three
dress the card that sits on it and does flip (`--sak-auth-card-{line,muted,text}`). An app
without such a console never sets `variant="auth"` and never pays for them; `variant` defaults
to `app`.

### Breakpoints

There are two, and they are literals at every call site rather than custom properties — a
custom property cannot be read inside a `@media` condition, so `@media (max-width: var(--bp))`
parses and then matches nothing, forever, which is worse than a number.

- **40rem** — the phone breakpoint. `DataTable` swaps its rows for the `card` snippet's
  `RecordCard`s, and `ColumnListEditor` stacks.
- **48rem** — `Stepper` rotates to vertical.

`DataTable` renders **both** layouts into the DOM at all times and lets CSS choose. A
`matchMedia` listener picking one to mount shows the wrong layout for a frame after every
resize and orientation change, because it fires after the browser has already painted.

### Rich-text toolbar tones

The editor's toolbar is the one place the kit uses colour to tell controls apart rather than to
signal state: each button carries a fixed hue naming the kind of thing it makes, so a row of
twenty icons stays scannable. Seven tones — `--sak-rt-tone-{mark,heading,list,code,block,insert,history}`
— plus a `-dark` twin of each, which the toolbar swaps in as a set when the editor is in dark mode
(its surface is far darker than a normal card, and the light hues go muddy on it).

There is no separate "pressed" colour to theme: a toggled button tints its own background from
whichever tone is in force, so re-pointing the tone is all a consumer has to do.

## Local development (this monorepo)

This package needs to be built (`svelte-package`) before anything can resolve it, since its
`exports` map points at compiled `dist/` output rather than at `src/`:

```bash
pnpm --filter @aibulat/svelte-admin-kit build
```

Run this once after `pnpm install`. While developing against it from another project, run the
watcher instead:

```bash
pnpm --filter @aibulat/svelte-admin-kit dev   # svelte-package --watch
```

Without it, edits under `packages/svelte-admin-kit/src` silently have no effect on a consuming
app, because the `exports` map resolves into `dist/` and nothing rebuilds it.

The other scripts are the repo-standard ones:

```bash
pnpm --filter @aibulat/svelte-admin-kit typecheck   # svelte-check
pnpm --filter @aibulat/svelte-admin-kit test        # vitest run
pnpm --filter @aibulat/svelte-admin-kit lint        # prettier --check . && eslint .
```

## Roadmap

Not yet included, planned for later:

- **Nav** (desktop + mobile header navigation) — needs a generic `NavGroup`/`NavLink`
  prop-driven API in place of the app's hardcoded route/permission structure.
- **DB topology diagrams** (`@xyflow/svelte`-based) — flagged as a near-rewrite, not a
  straightforward lift, since the current implementation hardcodes MariaDB-specific
  semantics throughout.

### Deliberately out of scope

Not "not yet" — these were considered and declined, so that the question does not get
reopened by default:

- **A data grid.** `DataTable` is markup plus a header; it is not on a path toward sorting,
  virtualisation or column resizing. An app that needs those wants a grid library, and
  wrapping one here would make this package's dependency graph hostage to that vendor.
- **Charts.** A chart kit is a multi-week design problem (scales, axes, legends, responsive
  viewBox, a11y) whose output would compete with existing libraries. The reusable part of a
  hand-rolled chart is its scale helpers, which belong to the app.
- **CRUD screens.** The list/create/edit/delete screen looks like the biggest duplication in
  any admin app, and it is — but it is duplication of _data fetching and translation_, both of
  which this package is forbidden to contain. That abstraction belongs on the app side.
