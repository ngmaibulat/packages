import type { IconRegistry } from '../icon/icons.js';

// Formatting icons for the editor toolbar and the "/" slash menu.
//
// Deliberately NOT merged into `defaultIcons`: that registry is the kit's
// generic UI-chrome set, inherited by every consumer of the package, and
// twenty rich-text-specific glyphs do not belong in it. This one ships with
// the editor and nothing else reads it.
//
// Same contract as `defaultIcons`: name -> raw inner-<svg> markup, drawn on a
// 24x24 viewBox, stroke-only, no `fill` and no explicit colour or stroke width
// (Icon.svelte supplies `stroke="currentColor"` and the `--sak-icon-*`
// defaults). Entries are static developer-authored markup — they are injected
// with {@html} and must never be derived from user input.
//
// These replace typed characters (`B`, `S̶`, `‹›`, `▦`, `❝`, `{}`, `―`, `↶`).
// ReorderControls.svelte's header already recorded why that was worth undoing:
// the glyphs render at wildly different weights across fonts, which is what
// made the row look unrelated to itself.
export const richtextIcons = {
	bold: `<path d="M6 4h7a4 4 0 0 1 0 8H6zM6 12h8a4 4 0 0 1 0 8H6z" />`,
	italic: `<path d="M19 4h-9M14 20H5M15 4 9 20" />`,
	strike: `<path d="M4 12h16M16 6.5A4 4 0 0 0 12.5 5h-1A3.5 3.5 0 0 0 9.4 11M8 17.5A4 4 0 0 0 11.5 19h1a3.5 3.5 0 0 0 2.6-6" />`,
	inlineCode: `<path d="m18 16 4-4-4-4M6 8l-4 4 4 4M14.5 4l-5 16" />`,
	heading1: `<path d="M4 12h8M4 18V6M12 18V6M17 12l3-2v8" />`,
	heading2: `<path d="M4 12h8M4 18V6M12 18V6M17 10.5a2 2 0 0 1 3.5 1.3c0 1.5-3.5 2.7-3.5 4.7h4" />`,
	heading3: `<path d="M4 12h8M4 18V6M12 18V6M17 10.3a2 2 0 0 1 3.4 1.4 1.9 1.9 0 0 1-1.9 1.8 1.9 1.9 0 0 1 1.9 1.8A2 2 0 0 1 17 16.7" />`,
	bulletList: `<path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" />`,
	orderedList: `<path d="M10 6h11M10 12h11M10 18h11M4 5.5 5.5 5v5M3.6 15.2a1.6 1.6 0 0 1 2.8 1c0 1-2.8 1.8-2.8 2.8h3" />`,
	taskList: `<path d="m3 6.5 1.6 1.6L8 4.7M3 16.5l1.6 1.6L8 14.7M12 7h9M12 17h9" />`,
	blockquote: `<path d="M5 5v14M10 8h9M10 12h9M10 16h6" />`,
	codeBlock: `<path d="M8 3H7a2 2 0 0 0-2 2v4a2 2 0 0 1-2 2 2 2 0 0 1 2 2v4c0 1.1.9 2 2 2h1M16 21h1a2 2 0 0 0 2-2v-4c0-1.1.9-2 2-2a2 2 0 0 1-2-2V5a2 2 0 0 0-2-2h-1" />`,
	table: `<rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 10h18M3 15h18M9 4v16" />`,
	link: `<path d="M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1 1M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1-1" />`,
	image: `<rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="8.5" cy="9.5" r="1.5" /><path d="m21 16-4.5-4.5L7 20" />`,
	callout: `<circle cx="12" cy="12" r="9" /><path d="M12 16v-4M12 8h.01" />`,
	// Stays a bare chevron. Drawing the summary line and hidden body beside it
	// was tried and reverted: chevron-plus-three-lines is `blockquote`'s
	// bar-plus-three-lines at 18px, and confusing two buttons in the same row is
	// worse than the chevron being generic. Nothing else here is a chevron.
	details: `<path d="m9 6 6 6-6 6" />`,
	// A lone full-width stroke is `strike`'s crossbar with the letter removed.
	// The two chevrons pushing away from it are what say "separator" rather than
	// "minus", and they read at 18px where a dashed rule does not.
	horizontalRule: `<path d="M3 12h18" /><path d="m8 8 4-4 4 4M16 16l-4 4-4-4" />`,
	// Arrow-head-plus-hook rather than a circular arc: an arc drawn on this
	// viewBox reads as a bare ring at 18px, which is what the first attempt
	// shipped and why these are the two-path form.
	undo: `<path d="M9 14 4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />`,
	redo: `<path d="m15 14 5-5-5-5" /><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" />`
} satisfies IconRegistry;

export type RichtextIconName = keyof typeof richtextIcons;
