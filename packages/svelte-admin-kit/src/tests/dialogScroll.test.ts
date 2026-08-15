import { describe, expect, it } from 'vitest';

/*
 * A dialog taller than the viewport must SCROLL ITS BODY, not clip.
 *
 * The bug this pins was live and invisible: `.sak-dialog` set `overflow: hidden`
 * and no `max-height`, so the UA default (`calc(100% - 6px - 2em)`) clamped the
 * surface to the window and everything past the fold was clipped with no
 * scrollbar — rendered, present in the DOM, and unreachable by any means. An
 * eleven-card picker showed three. Measured on a 1400x900 viewport: 860px of
 * surface holding 3355px of content, 2495px of it simply gone.
 *
 * It survived twenty-one call sites because nothing goes wrong until the content
 * grows past the fold, and then it fails silently rather than loudly.
 *
 * Asserted against the stylesheet source rather than a rendered dialog on
 * purpose: jsdom implements neither flex layout nor `dvh`, so a DOM-level test
 * here would pass whatever the CSS said and pin nothing at all. Reading the
 * source is the same call themeTokens.test.ts makes, for the same reason.
 */
const CSS = Object.values(
	import.meta.glob('../lib/overlay/dialog.css', {
		query: '?raw',
		import: 'default',
		eager: true
	}) as Record<string, string>
)[0];

/** The declarations of one rule, with comments and whitespace stripped. */
function block(selector: string): string {
	const source = CSS.replace(/\/\*[\s\S]*?\*\//g, '');
	const start = source.indexOf(selector + ' {');
	expect(start, `no rule for ${selector}`).toBeGreaterThan(-1);
	return source.slice(start, source.indexOf('}', start)).replace(/\s+/g, ' ');
}

describe('dialog.css', () => {
	it('found the stylesheet it is meant to scan', () => {
		// Guards a refactor that moves the file and makes everything below pass
		// over an empty string.
		expect(CSS).toBeTypeOf('string');
		expect(CSS).toContain('.sak-dialog-body');
	});

	it('bounds the surface height', () => {
		// Without an explicit max-height the UA clamp applies and, combined with
		// `overflow: hidden`, silently truncates.
		expect(block('.sak-dialog')).toMatch(/max-height:\s*min\(/);
	});

	it('makes the surface a column ONLY when it is open', () => {
		// The second bug, found while fixing the first: the UA hides a closed
		// dialog with `dialog:not([open]) { display: none }`, and an author
		// `display` on the bare class beats it — so an unconditional
		// `display: flex` renders every closed dialog inline, in the middle of
		// whatever page mounted it.
		const open = block('.sak-dialog[open]');
		expect(open).toContain('display: flex');
		expect(open).toContain('flex-direction: column');

		expect(block('.sak-dialog')).not.toMatch(/(^|[^-])display:/);
	});

	it('scrolls the body, and lets it shrink enough to do so', () => {
		const body = block('.sak-dialog-body');
		expect(body).toContain('overflow-y: auto');
		// The load-bearing half: a flex item defaults to `min-height: auto` and
		// refuses to shrink below its content, so `overflow-y: auto` alone would
		// be set and do nothing — the exact original bug, wearing a scrollbar
		// property that never activates.
		expect(body).toContain('min-height: 0');
	});

	it('pins the head and footer so a long body cannot squeeze them', () => {
		expect(block('.sak-dialog-head')).toContain('flex-shrink: 0');
		expect(block('.sak-dialog-footer')).toContain('flex-shrink: 0');
	});
});
