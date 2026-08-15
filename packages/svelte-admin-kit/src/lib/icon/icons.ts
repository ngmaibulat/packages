// Icon registry: a plain name -> raw inner-<svg> markup map. Icon.svelte
// injects the matched entry via {@html}, so entries must be static,
// developer-authored markup — never derived from user input.
export type IconRegistry = Record<string, string>;

// A small, deliberately generic set of UI-chrome icons — actions/affordances
// any admin UI is likely to need (menu toggle, dismiss, search, sort/scroll
// arrows, inline-help, delete, "press Enter" hint), not domain-specific
// concepts. Consumers extend this with their own app-specific icons by
// spreading it into a larger registry and passing that via the `registry`
// prop: `{ ...defaultIcons, sql: '...', sources: '...' }`.
//
// `satisfies` rather than a `: IconRegistry` annotation, deliberately: the
// annotation would widen the keys to `string`, so a consumer spreading this
// into its own registry could not derive a literal-union `IconName` from the
// result and would lose compile-time checking of every icon name it passes.
export const defaultIcons = {
	menu: `<path d="M3 6h18M3 12h18M3 18h18" />`,
	close: `<path d="M18 6 6 18M6 6l12 12" />`,
	search: `<circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />`,
	arrowUp: `<path d="M12 19V5M5 12l7-7 7 7" />`,
	arrowDown: `<path d="M12 5v14M19 12l-7 7-7-7" />`,
	cornerDownLeft: `<polyline points="9 10 4 15 9 20" /><path d="M20 4v7a4 4 0 0 1-4 4H4" />`,
	info: `<circle cx="12" cy="12" r="9" /><path d="M12 16v-4M12 8h.01" />`,
	trash: `<path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6h16Z" />`
} satisfies IconRegistry;
