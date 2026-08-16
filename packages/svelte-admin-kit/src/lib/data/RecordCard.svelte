<script module lang="ts">
	export type RecordField = {
		label: string;
		value: string | number | null | undefined;
		/** The monospace data face, for an id, a host, a CIDR, a timestamp. */
		mono?: boolean;
		/** Take the full width instead of a half column — for prose, not a token. */
		wide?: boolean;
	};
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';

	// One record, laid out as a card instead of a table row.
	//
	// This is what a DataTable becomes below 40rem, via its `card` snippet. A
	// nine-column row inside a horizontal scroller is technically readable and
	// practically not: the reader scrolls right to find the reason a row is red,
	// and by then the name it belonged to is off the left edge. Stacking the
	// values with their labels attached costs vertical space, which a phone has,
	// and buys back the association between a value and what it means.
	//
	// WHY BOTH `fields` AND `children`. Most cells are a label and a string, and
	// expressing a dozen screens' worth of those as snippets would be a hundred
	// lines of markup all saying the same thing. `fields` covers them as data.
	// Anything that is not a string — a Badge, a link, a nested list — goes in
	// `children`, which renders after them.

	let {
		title,
		titleMono = false,
		fields = [],
		placeholder,
		as = 'li',
		onclick,
		class: className = '',
		badge,
		children,
		actions
	}: {
		title: string;
		titleMono?: boolean;
		fields?: RecordField[];
		/**
		 * `li` because the usual home is DataTable's `card` snippet, inside a
		 * `<ul>` — and the list semantics are worth keeping there, since "list, 12
		 * items" is exactly what a screen reader should say about a table
		 * replacement.
		 *
		 * Set `div` for a standalone card. An `<li>` outside a list still renders
		 * its marker, so the default leaves a stray bullet floating beside a card
		 * that is not part of a list.
		 */
		as?: 'li' | 'div';
		/**
		 * A value equal to this counts as absent.
		 *
		 * For the caller whose table cells already render a placeholder glyph for
		 * a missing value — an em dash, "n/a" — because that glyph exists to hold
		 * a table COLUMN open, and a card has no column to hold. Rendering it here
		 * gives the card a labelled row whose entire content is the stand-in.
		 */
		placeholder?: string;
		onclick?: (event: MouseEvent) => void;
		class?: string;
		badge?: Snippet;
		children?: Snippet;
		actions?: Snippet;
	} = $props();

	// An absent value is DROPPED rather than rendered blank. On a card an empty
	// row is indistinguishable from a value that failed to load, whereas in a
	// table the column header is still there to say what is missing.
	const absent = (v: RecordField['value']) =>
		v === null || v === undefined || v === '' || (placeholder !== undefined && v === placeholder);
	const shown = $derived(fields.filter((f) => !absent(f.value)));
</script>

{#snippet body()}
	<div class="sak-record-head">
		<span class="sak-record-title" class:sak-record-mono={titleMono}>{title}</span>
		{#if badge}<span class="sak-record-badge">{@render badge()}</span>{/if}
	</div>

	{#if shown.length}
		<dl class="sak-record-fields">
			{#each shown as field (field.label)}
				<div class="sak-record-field" class:sak-record-field-wide={field.wide}>
					<dt>{field.label}</dt>
					<dd class:sak-record-mono={field.mono}>{field.value}</dd>
				</div>
			{/each}
		</dl>
	{/if}

	{#if children}{@render children()}{/if}

	{#if actions}
		<div class="sak-record-actions">{@render actions()}</div>
	{/if}
{/snippet}

<!--
  A clickable card is a REAL <button>, not a div wearing role="button" and a
  tabindex. Tr has to do it the hard way — a <tr> cannot contain a button
  spanning the row without destroying the table's own layout — but nothing
  forces that here, and the native element brings the role, the tab stop, Enter
  and Space, the disabled semantics and the focus ring with it. The hand-rolled
  keydown handler that would otherwise sit here is the part most likely to be
  subtly wrong: Space must fire on keyup and must not scroll the page.

  The wrapper element stays bare in both branches. Putting the role on it
  instead would overwrite the `listitem` semantics that tell a screen reader
  this is one record of N.
-->
<svelte:element this={as}>
	{#if onclick}
		<button type="button" class="sak-record sak-record-clickable {className}" {onclick}>
			{@render body()}
		</button>
	{:else}
		<div class="sak-record {className}">{@render body()}</div>
	{/if}
</svelte:element>

<style>
	.sak-record {
		display: flex;
		flex-direction: column;
		gap: var(--sak-gap, 0.5rem);
		border: 1px solid var(--sak-border, #e2e8f0);
		border-radius: var(--sak-radius-md, 0.75rem);
		background: var(--sak-surface, #ffffff);
		padding: 0.75rem 0.85rem;
		/* The card is its own containing block for long values. Without this a
		   128-character user agent or a bare message id sets the width of the
		   whole list and the page scrolls sideways — the exact failure the
		   table's scroll wrapper was containing. */
		min-width: 0;
	}

	/* Undoing the button, which is here for its semantics and not its
	   appearance. `text-align` and `font` are the two that show immediately — a
	   card whose every label is centred in the UA's 13px sans. */
	.sak-record-clickable {
		width: 100%;
		text-align: inherit;
		font: inherit;
		color: inherit;
		cursor: pointer;
	}

	.sak-record-clickable:hover {
		background: var(--sak-surface-muted, #f8fafc);
	}

	.sak-record-clickable:focus-visible {
		outline: var(--sak-focus-ring-width, 2px) solid var(--sak-focus-ring, #94a3b8);
		outline-offset: 2px;
	}

	.sak-record-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--sak-gap, 0.5rem);
		min-width: 0;
	}

	.sak-record-title {
		min-width: 0;
		font-size: var(--sak-font-size-md, 0.875rem);
		font-weight: 600;
		color: var(--sak-foreground, #020617);
		/* Addresses and hostnames have no spaces to break at, so the default word
		   wrap leaves them overflowing rather than wrapping. */
		overflow-wrap: anywhere;
	}

	/* A wrapping row, not a single slot: a record often carries two or three
	   badges — serving + staging + expiry on a certificate, status + enabled on
	   a domain — and each would otherwise need its own wrapper span with the
	   same three declarations. */
	.sak-record-badge {
		display: flex;
		flex: 0 1 auto;
		flex-wrap: wrap;
		justify-content: flex-end;
		gap: 0.25rem;
	}

	.sak-record-fields {
		display: grid;
		/* Two per row while they fit, one when they do not. auto-fit with a
		   minmax floor rather than a breakpoint: the card is already inside a
		   media query, and a second one nested here would be a width about a
		   width. 9rem is the widest a label plus a timestamp needs. */
		grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));
		gap: 0.4rem 0.75rem;
		margin: 0;
	}

	.sak-record-field {
		min-width: 0;
	}

	/* A value that is prose rather than a token — an error message, a detail
	   string — takes the full width instead of a half column. */
	.sak-record-field-wide {
		grid-column: 1 / -1;
	}

	dt {
		font-size: var(--sak-font-size-2xs, 0.6875rem);
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--sak-text-subtle, #64748b);
	}

	dd {
		margin: 0;
		font-size: var(--sak-font-size-sm, 0.8125rem);
		color: var(--sak-foreground, #020617);
		overflow-wrap: anywhere;
	}

	.sak-record-mono {
		font-family: var(--sak-font-mono, ui-monospace, monospace);
		font-variant-numeric: tabular-nums;
	}

	/*
	 * A Badge rendered straight into `children` is a flex item of this column,
	 * and a flex item stretches along the cross axis by default — so an inline
	 * pill becomes a full-width bar with its tone as a background stripe.
	 *
	 * Only badges are pulled back to their content width. `align-items:
	 * flex-start` on the container would have been the one-line version and is
	 * wrong: block children — a paragraph, a nested list, an Alert — are meant
	 * to fill, and that rule would shrink all of them to fit their text.
	 */
	.sak-record > :global(.sak-badge) {
		align-self: flex-start;
	}

	.sak-record-actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sak-gap, 0.5rem);
		border-top: 1px solid var(--sak-border, #e2e8f0);
		padding-top: 0.6rem;
	}

	/* Row buttons come off a table at `xs` — small, several abreast, at the end
	   of a sideways scroll. In a card they get the room to share the width,
	   which is what makes them tappable. */
	.sak-record-actions :global(.sak-btn) {
		flex: 1 1 auto;
	}
</style>
