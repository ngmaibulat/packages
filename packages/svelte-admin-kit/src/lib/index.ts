// The root entry point deliberately re-exports ONLY the dependency-free
// subpaths. `./editor` is not among them: `editor/monacoSetup.ts` does
// `import * as monaco from 'monaco-editor'` at module scope, so re-exporting it
// here would make a bare `import { Icon } from '@aibulat/svelte-admin-kit'`
// both SSR-unsafe and needlessly heavy — the editors must be reached through
// their own subpath and dynamic-imported in `onMount`, which is also what keeps
// Monaco and tiptap from ever co-loading.
export * from './icon';
export * from './controls';
export * from './layout';
export * from './feedback';
export * from './data';
export * from './overlay';
