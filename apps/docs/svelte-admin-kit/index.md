# @aibulat/svelte-admin-kit

Reusable **Svelte 5** admin-UI primitives — controls, layout, feedback, data display, overlays,
an icon registry, and two editors (Monaco and tiptap).

Written entirely in runes mode (`$props`, `$state`, `$derived`, `$bindable`). Every string a
component renders is a prop and every action is a callback, so the package carries no
translator and no data fetching.

```bash
pnpm add @aibulat/svelte-admin-kit svelte
```

`svelte` (`^5.0.0`) is a peer dependency. `monaco-editor` (`^0.55.0`) is an **optional** peer —
install it only if you use the `./editor` subpath.

## Subpaths

There is no barrel that pulls everything in. The root export deliberately re-exports only the
dependency-free subpaths, so a bare import never drags Monaco or tiptap into your bundle.

| Subpath | Contents |
| --- | --- |
| `.` | Re-exports `./icon`, `./controls`, `./layout`, `./feedback`, `./data`, `./overlay` |
| `./controls` | `Button`, `ButtonGroup`, `Field`, `TextInput`, `Textarea`, `Select`, `Checkbox`, `CheckboxGroup`, `FileDropzone`, `ReorderControls`, `ColumnListEditor`, `TabNav`, `Card`, plus `formatBytes`, `fileMatchesAccept`, `toColumnDrafts` |
| `./layout` | `PageHeader` |
| `./feedback` | `Alert`, `EmptyState` |
| `./data` | `DataTable`, `Th`, `Td`, `Tr`, `Badge` |
| `./overlay` | `Dialog`, `DialogBody`, `DialogFooter`, `ConfirmDialog` |
| `./icon` | `Icon`, `defaultIcons` |
| `./editor` | `MarkdownEditor`, `MjmlSourceEditor`, `ensureMonacoConfigured`, `setMentionCandidates` — **needs `monaco-editor`** |
| `./editor/format-markdown-tables` | `formatMarkdownTables`, `buildMarkdownTable` — dependency-free GFM table pretty-printer |
| `./richtext-editor` | `RichTextEditor` (tiptap) |
| `./richtext` | `buildRichtextExtensions`, `RICHTEXT_NODE_TYPES`, `RICHTEXT_MARK_TYPES` — no Svelte, safe in Node |
| `./richtext/labels` | Overridable label catalogue for the rich-text editor |
| `./richtext/content.css` | Stylesheet for rendered rich-text content |
| `./styles/theme.css` | The `--sak-*` token sheet |

```svelte
<script lang="ts">
    import { Button, Field, TextInput } from '@aibulat/svelte-admin-kit/controls';
    import { PageHeader } from '@aibulat/svelte-admin-kit/layout';

    let name = $state('');
</script>

<PageHeader title="Settings" subtitle="Account preferences" />

<Field label="Display name" let:id>
    <TextInput {id} bind:value={name} />
</Field>

<Button variant="primary" onclick={save}>Save</Button>
```

## Monaco and tiptap never co-load

That is the whole reason `./editor` and `./richtext-editor` are separate subpaths rather than
part of the root barrel. Keep them apart.

`./editor` is also **not SSR-safe**: its `monacoSetup` module imports `monaco-editor` at module
scope. Reach it only through a dynamic `import()` inside `onMount`, never at module scope in a
server-rendered route.

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

The Monaco bootstrap wires its web worker through Vite's `?worker` import suffix, so `./editor`
assumes a Vite-based build. On Webpack or Rollup you must configure Monaco's worker loading
yourself before importing anything from that subpath.

`./richtext`, by contrast, imports no Svelte at all — it exists so a **server** can render and
sanitise the editor's documents against the exact same schema the client wrote them with.

## Required global stylesheet

If you render stored rich-text content anywhere, import this **once at your app root**:

```ts
import '@aibulat/svelte-admin-kit/richtext/content.css';
```

Read-only content appears on pages that never load the editor bundle, so those styles cannot
ship with the editor.

## Theming

Every component ships finished-looking defaults with **zero required CSS import** — each
`--sak-*` token has a literal fallback baked into the rule that reads it. To customise, import
the token sheet once at your app root and override what you need:

```ts
import '@aibulat/svelte-admin-kit/styles/theme.css';
```

```css
:root {
    --sak-icon-size: 1.25rem;
    --sak-icon-stroke-width: 1.5;
}
```

In an app that already has design tokens, map rather than restate:

```css
:root {
    --sak-primary-bg: var(--btn-primary-bg);
    --sak-surface: var(--surface);
    --sak-focus-ring: var(--focus-ring);
}
```

Because each mapping is a `var()` reference, a dark theme that redefines `--surface` on the same
element updates every `--sak-*` that reads it — no second block needed. The `--sak-` prefix is
deliberate: it avoids colliding with unprefixed custom properties (`--border`, `--surface`) your
app may already define.

## Notable design decisions

- **`Alert.live` defaults to `false`.** An `alert`/`status` role on a message that is already on
  screen at load makes a screen reader announce every standing caveat before the user has done
  anything. Set it only where the message appears *in response* to an action.
- **`DataTable` is not a data grid.** It owns the scroll wrapper, the header row declared by
  `columns`, and the "no rows" row (whose `colspan` comes from `columns.length`, not a
  hand-typed number). Body rows stay with the caller through the `row` snippet. Pass `key`
  whenever rows can be reordered, filtered or removed — without it `{#each}` reconciles by index
  and strands per-row state on the wrong record.
- **`DialogBody`/`DialogFooter` are components, not snippets.** A dialog that submits needs one
  `<form>` wrapping both, and `DialogBody` takes `as="form"` to be that form.
- **`CheckboxGroup` has no column count.** A horizontal row of checkboxes is what it exists to
  prevent.
- **No i18n, no data fetching.** Both belong to the consuming app.

## Building it here

This package is the one member of the repo that does **not** build with tsdown — a Svelte
component library ships uncompiled `.svelte` source plus generated `.d.ts`, which is
`svelte-package`'s job.

```bash
pnpm --filter @aibulat/svelte-admin-kit build   # svelte-package && publint
pnpm --filter @aibulat/svelte-admin-kit dev     # svelte-package --watch
```

`exports` resolves into `dist/`, so nothing can consume the package until `build` has run once.
