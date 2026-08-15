<script module lang="ts">
	export type TabNavItem = {
		href: string;
		label: string;
		active: boolean;
		/** Optional count badge. Zero and null render nothing — an empty tab says
		 *  so by having no badge, not by wearing a "0". */
		count?: number | null;
		title?: string;
	};
</script>

<script lang="ts">
	// A tab strip made of real links. `ButtonGroup`'s sibling: same visual family
	// and the same `--sak-*` vocabulary, but every segment is an <a>, so
	// middle-click, open-in-new-tab, prefetch and browser history all work — none
	// of which a <button> segmented control can offer.
	//
	// Deliberately NOT role="tablist"/role="tab". Those roles promise
	// aria-controls'd panels living in the same document and roving arrow-key
	// focus between them; a strip whose segments are separate pages has neither,
	// and claiming the roles anyway would describe the widget inaccurately to a
	// screen reader. A labelled <nav> of links with aria-current="page" is what
	// this actually is.
	//
	// `active` is a prop rather than something derived from the URL, so the
	// component never imports a router: only the caller knows its own route
	// shape, and a nested route whose parent path prefixes every sibling needs
	// exact matching rather than a startsWith.

	let {
		items,
		ariaLabel,
		class: className = ''
	}: {
		items: TabNavItem[];
		ariaLabel?: string;
		class?: string;
	} = $props();

	// The strip scrolls (see the CSS note below) but shows no scrollbar: a strip
	// of 9-11 tabs overflows a narrow content width in a wordier locale, and a
	// scrollbar sitting under the tabs reads as page furniture rather than as
	// part of the control. What replaces it is a fade on whichever edge has
	// content beyond it — painted only when there IS something beyond it, so a
	// strip that fits looks untouched.
	let strip = $state<HTMLElement>();
	let fadeStart = $state(false);
	let fadeEnd = $state(false);

	function measure() {
		const el = strip;
		if (!el) return;
		// 1px of slack: fractional layout widths leave a sub-pixel remainder at
		// either end, which would otherwise pin a fade on permanently.
		const max = el.scrollWidth - el.clientWidth;
		fadeStart = el.scrollLeft > 1;
		fadeEnd = el.scrollLeft < max - 1;
	}

	$effect(() => {
		const el = strip;
		// Reading `items` is what makes this re-run when the item set changes — a
		// locale switch or a permission-gated tab appearing is exactly what changes
		// the strip's width and which tab is active.
		const count = items.length;
		if (!el || count === 0) return;

		// With no scrollbar an active tab past the edge would simply be invisible,
		// so bring it into view — but ONLY if it is out of view. Centring it
		// unconditionally would scroll the first tabs off the left of a strip that
		// was showing the active one perfectly well. Assigning `scrollLeft` rather
		// than calling `scrollIntoView`, which would also scroll the PAGE to reach
		// it. `PEEK` leaves a sliver of the neighbouring tab visible, so the tab
		// that was scrolled to does not look like the end of the strip.
		const PEEK = 24;
		const active = el.querySelector<HTMLElement>('.sak-tab-active');
		if (active) {
			const start = active.offsetLeft;
			const end = start + active.offsetWidth;
			if (start < el.scrollLeft) el.scrollLeft = start - PEEK;
			else if (end > el.scrollLeft + el.clientWidth) el.scrollLeft = end - el.clientWidth + PEEK;
		}
		measure();

		// The strip itself, for a viewport or content-width change; and each tab,
		// because a resize of the CONTENT (a count badge appearing, a font
		// swapping in) changes what overflows without changing the strip's own box.
		const observer = new ResizeObserver(measure);
		observer.observe(el);
		for (const child of Array.from(el.children)) observer.observe(child);
		return () => observer.disconnect();
	});
</script>

<nav
	bind:this={strip}
	onscroll={measure}
	class="sak-tabs {className}"
	class:sak-tabs-fade-start={fadeStart}
	class:sak-tabs-fade-end={fadeEnd}
	aria-label={ariaLabel}
>
	{#each items as item (item.href)}
		<a
			href={item.href}
			title={item.title}
			class="sak-tab"
			class:sak-tab-active={item.active}
			aria-current={item.active ? 'page' : undefined}
		>
			{item.label}
			{#if item.count}<span class="sak-tab-count">{item.count}</span>{/if}
		</a>
	{/each}
</nav>

<style>
	.sak-tabs {
		display: flex;
		align-items: stretch;
		gap: 0.25rem;
		/* The separator under the strip, as an INSET SHADOW rather than a
		   border-bottom. A shadow is painted in this element's own padding box,
		   below every child, so the active tab's 2px underline overpaints it
		   without the tabs having to pull themselves down onto it.
		   That pull is what this replaces: `margin-bottom: -1px` on .sak-tab made
		   each tab's margin box 1px shorter than its border box, so in an
		   align-items:stretch line every tab overflowed the content box by 1px in
		   the block direction — and since `overflow-x: auto` below forces the
		   other axis from `visible` to a computed `auto`, that 1px grew a phantom
		   VERTICAL scrollbar on the tab strip. Do not reintroduce it. */
		box-shadow: inset 0 -1px 0 var(--sak-border, #e2e8f0);
		/* A narrow viewport scrolls the strip rather than wrapping it: a tab strip
		   on two lines stops reading as one control. */
		overflow-x: auto;
		/* No scrollbar chrome — the `sak-tabs-fade-*` mask below is the overflow
		   affordance instead. The strip still scrolls by wheel/trackpad, by
		   dragging on touch, and by tabbing to an off-screen tab. */
		scrollbar-width: none;
	}

	.sak-tabs::-webkit-scrollbar {
		display: none;
	}

	/* A MASK rather than a colour gradient on purpose: the strip sits directly on
	   the page background, which the kit has no token for (`--sak-surface` is the
	   card colour, not this), and a mask needs no colour at all — so it is
	   correct in a light and a dark theme alike. */
	.sak-tabs-fade-end {
		-webkit-mask-image: linear-gradient(to right, #000 calc(100% - 2rem), transparent);
		mask-image: linear-gradient(to right, #000 calc(100% - 2rem), transparent);
	}

	.sak-tabs-fade-start {
		-webkit-mask-image: linear-gradient(to left, #000 calc(100% - 2rem), transparent);
		mask-image: linear-gradient(to left, #000 calc(100% - 2rem), transparent);
	}

	.sak-tabs-fade-start.sak-tabs-fade-end {
		-webkit-mask-image: linear-gradient(
			to right,
			transparent,
			#000 2rem,
			#000 calc(100% - 2rem),
			transparent
		);
		mask-image: linear-gradient(
			to right,
			transparent,
			#000 2rem,
			#000 calc(100% - 2rem),
			transparent
		);
	}

	.sak-tab {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		flex: none;
		padding: var(--sak-pad-y-md, 0.5rem) var(--sak-pad-x-md, 1rem);
		/* Sits flush with the strip's bottom edge — the separator is the nav's own
		   inset shadow, which this border paints over when the tab is active. */
		border-bottom: 2px solid transparent;
		border-top-left-radius: var(--sak-radius-sm, 0.5rem);
		border-top-right-radius: var(--sak-radius-sm, 0.5rem);
		color: var(--sak-text-muted, #475569);
		font-family: inherit;
		font-size: var(--sak-font-size-md, 0.875rem);
		font-weight: 600;
		line-height: 1.25;
		white-space: nowrap;
		text-decoration: none;
		transition:
			background-color 120ms ease,
			border-color 120ms ease,
			color 120ms ease;
	}

	.sak-tab:hover {
		background: var(--sak-surface-strong, #f1f5f9);
		color: var(--sak-foreground, #020617);
		text-decoration: none;
	}

	.sak-tab:focus-visible {
		outline: var(--sak-focus-ring-width, 2px) solid var(--sak-focus-ring, #94a3b8);
		/* Inside, not outside: an offset ring on the bottom edge would be clipped
		   by the strip's own border. */
		outline-offset: -3px;
	}

	.sak-tab-active,
	.sak-tab-active:hover {
		color: var(--sak-selected-text, #1e40af);
		border-bottom-color: currentColor;
		background: transparent;
	}

	.sak-tab-count {
		display: inline-flex;
		align-items: center;
		border-radius: 9999px;
		padding: 0.05rem 0.45rem;
		background: var(--sak-surface-strong, #f1f5f9);
		color: var(--sak-text-muted, #475569);
		font-size: var(--sak-font-size-xs, 0.75rem);
		font-weight: 600;
	}

	.sak-tab-active .sak-tab-count {
		background: var(--sak-selected-bg, #dbeafe);
		color: var(--sak-selected-text, #1e40af);
	}

	@media (prefers-reduced-motion: reduce) {
		.sak-tab {
			transition: none;
		}
	}
</style>
