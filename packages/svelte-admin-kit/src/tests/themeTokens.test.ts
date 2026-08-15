import { describe, expect, it } from 'vitest';

/*
 * `styles/theme.css` is the file a consumer of this package is told to copy or
 * re-point in order to theme it. That only works if it actually lists every
 * token the components read.
 *
 * It had drifted badly before this test existed: the components had grown
 * `--sak-height-*`, `--sak-neutral-*`, `--sak-success-*`, `--sak-warning-*`,
 * `--sak-card-border`, `--sak-btn-shadow` and more, none of which theme.css
 * declared. Nothing caught it because the app that consumes this kit does not
 * import theme.css at all — it re-points the tokens in its own stylesheet — so
 * the only party affected was a third-party consumer, i.e. nobody yet.
 *
 * Sources are read through `import.meta.glob` rather than node:fs on purpose:
 * this package has no `@types/node` and does not need one for a test that Vite
 * can answer itself.
 */
const MODULES = import.meta.glob('../lib/**/*.{svelte,css}', {
	query: '?raw',
	import: 'default',
	eager: true
}) as Record<string, string>;

const THEME_PATH = '../lib/styles/theme.css';

/** Every `var(--sak-…)` the components actually read. */
const used = new Set<string>();
for (const [path, source] of Object.entries(MODULES)) {
	if (path === THEME_PATH) continue;
	for (const match of source.matchAll(/var\((--sak-[a-z0-9-]+)/g)) {
		used.add(match[1]);
	}
}

/** Every `--sak-…:` theme.css declares. */
const declared = new Set(
	[...(MODULES[THEME_PATH] ?? '').matchAll(/^\s*(--sak-[a-z0-9-]+)\s*:/gm)].map((m) => m[1])
);

describe('theme.css', () => {
	it('declares every token the components read', () => {
		const missing = [...used].filter((token) => !declared.has(token)).sort();
		expect(missing).toEqual([]);
	});

	it('declares nothing the components no longer read', () => {
		// The other direction, so a removed component leaves no orphan token
		// behind for someone to theme and wonder why nothing changes.
		const orphaned = [...declared].filter((token) => !used.has(token)).sort();
		expect(orphaned).toEqual([]);
	});

	it('still finds the sources it is meant to scan', () => {
		// Guards against a refactor that moves the files and silently makes both
		// assertions above pass over an empty set.
		expect(MODULES[THEME_PATH]).toBeTypeOf('string');
		expect(used.size).toBeGreaterThan(50);
	});
});
