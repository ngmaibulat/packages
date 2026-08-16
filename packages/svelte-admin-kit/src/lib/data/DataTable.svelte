<script module lang="ts">
	export type DataTableColumn = {
		/** Stable key for the {#each}. Not rendered. */
		key: string;
		label: string;
		align?: 'start' | 'end' | 'center';
		nowrap?: boolean;
		width?: string;
	};
</script>

<script lang="ts" generics="T">
	import type { Snippet } from 'svelte';
	import Th from './Th.svelte';

	// A scrollable table with a declared header.
	//
	// It owns three things and deliberately no more: the horizontal-scroll
	// wrapper, the header row, and the "no rows" row. Everything about a body
	// row stays with the caller, via the `row` snippet — because that is where
	// tables actually differ, and a table component that also owned rows would
	// need a prop for every one of those differences and would end up a worse
	// data grid.
	//
	// The "no rows" row is the reason this is worth being a component at all.
	// Its cell has to span the header, and hand-written ones spell the number
	// out — eleven of them did, in the app this came from, which means eleven
	// latent bugs waiting for someone to add a column. Here it is
	// `columns.length`, and it cannot be wrong.

	// `loading` exists so the table does not assert "there is nothing here"
	// before it has been told. A screen that fetches on mount renders its empty
	// message for the length of the request and then replaces it with rows,
	// which reads as data briefly going missing — and on a screen whose empty
	// state is a WARNING ("nothing is allowed to send"), every visit raises an
	// alarm about a healthy configuration and then withdraws it. A warning that
	// fires when nothing is wrong is one nobody reads when something is.
	//
	// `card` is the phone layout: the same records as cards below 40rem, where a
	// nine-column row inside a sideways scroller stops being readable — the
	// reader scrolls right to find the reason a row is red, and by then the name
	// it belonged to is off the left edge. It is OPTIONAL, and a table that
	// passes none keeps exactly the behaviour it had, so a screenful of tables
	// can be migrated one at a time rather than in a flag day.

	let {
		columns,
		rows,
		key,
		row,
		card,
		emptyMessage,
		loading = false,
		loadingMessage,
		caption,
		bordered = true,
		class: className = '',
		empty
	}: {
		columns: DataTableColumn[];
		rows: T[];
		/**
		 * Identity for the `{#each}`. Supply it whenever the rows can be
		 * reordered, filtered or removed: without a key Svelte reconciles by
		 * index, which reuses the wrong DOM node and strands per-row state (an
		 * expanded detail row, a focused input) on the wrong record.
		 */
		key?: (item: T, index: number) => string | number;
		/** Renders one body row — normally a `<Tr>` of `<Td>`s. */
		row: Snippet<[T, number]>;
		/**
		 * Renders the same record as a card, for viewports under 40rem. Normally
		 * a `<RecordCard>`, which is already the `<li>` this list wants.
		 *
		 * Supplying it opts the table into the responsive swap; omitting it
		 * leaves the horizontal scroller as the only small-screen behaviour.
		 */
		card?: Snippet<[T, number]>;
		/** Shown in a full-width row when `rows` is empty. */
		emptyMessage?: string;
		/** Suppresses the empty state: there is no answer yet, not no data. */
		loading?: boolean;
		/** Shown in place of the empty state while `loading`. */
		loadingMessage?: string;
		/** Accessible description, when the surrounding heading is not enough. */
		caption?: string;
		bordered?: boolean;
		class?: string;
		/** Richer empty content, when a sentence is not enough. Wins over `emptyMessage`. */
		empty?: Snippet;
	} = $props();
</script>

<!--
  BOTH LAYOUTS ARE ALWAYS IN THE DOM and CSS chooses between them. The obvious
  alternative — a `matchMedia` listener deciding which one to mount — shows the
  wrong layout for a frame after every resize and every orientation change,
  because the listener fires after the browser has already painted. These lists
  are one page of rows, so rendering the markup twice costs less than that.
-->
{#if card}
	<ul class="sak-cards {className}">
		{#each rows as item, index (key ? key(item, index) : index)}
			{@render card(item, index)}
		{:else}
			{#if loading}
				{#if loadingMessage}<li class="sak-cards-note">{loadingMessage}</li>{/if}
			{:else if empty || emptyMessage}
				<li class="sak-cards-note">
					{#if empty}{@render empty()}{:else}{emptyMessage}{/if}
				</li>
			{/if}
		{/each}
	</ul>
{/if}

<div
	class="sak-table-wrap {className}"
	class:sak-table-wrap-bordered={bordered}
	class:sak-table-wrap-has-cards={Boolean(card)}
>
	<table class="sak-table">
		{#if caption}<caption class="sak-table-caption">{caption}</caption>{/if}
		<thead>
			<tr>
				{#each columns as column (column.key)}
					<Th align={column.align} nowrap={column.nowrap} width={column.width}>
						{column.label}
					</Th>
				{/each}
			</tr>
		</thead>
		<tbody>
			{#each rows as item, index (key ? key(item, index) : index)}
				{@render row(item, index)}
			{:else}
				{#if loading}
					{#if loadingMessage}
						<tr class="sak-table-empty-row">
							<!-- Not a hand-typed number: a column added above would
							     otherwise leave this cell short and the row misaligned. -->
							<td class="sak-table-empty-cell" colspan={columns.length}>
								{loadingMessage}
							</td>
						</tr>
					{/if}
				{:else if empty || emptyMessage}
					<tr class="sak-table-empty-row">
						<td class="sak-table-empty-cell" colspan={columns.length}>
							{#if empty}{@render empty()}{:else}{emptyMessage}{/if}
						</td>
					</tr>
				{/if}
			{/each}
		</tbody>
	</table>
</div>

<style>
	.sak-table-wrap {
		overflow-x: auto;
	}

	.sak-table-wrap-bordered {
		border: 1px solid var(--sak-table-border, #e2e8f0);
		border-radius: var(--sak-radius-lg, 1rem);
	}

	.sak-table {
		width: 100%;
		border-collapse: collapse;
		font-size: var(--sak-font-size-md, 0.875rem);
	}

	.sak-table-caption {
		padding: var(--sak-table-pad-y, 0.5rem) var(--sak-table-pad-x, 0.75rem);
		text-align: start;
		font-size: var(--sak-font-size-sm, 0.75rem);
		color: var(--sak-text-muted, #475569);
	}

	.sak-table-empty-row {
		border-top: 1px solid var(--sak-table-border, #e2e8f0);
	}

	.sak-table-empty-cell {
		padding: 1rem var(--sak-table-pad-x, 0.75rem);
		text-align: center;
		color: var(--sak-text-subtle, #64748b);
	}

	/*
	 * The phone layout. The card list exists only under 40rem and the table only
	 * over it — but the table is hidden ONLY when a `card` snippet was supplied,
	 * which is what `.sak-table-wrap-has-cards` encodes. Hiding it
	 * unconditionally would blank every table that has not opted in and leave
	 * nothing in its place.
	 */
	.sak-cards {
		display: none;
		flex-direction: column;
		gap: var(--sak-gap, 0.5rem);
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.sak-cards-note {
		padding: 1rem var(--sak-table-pad-x, 0.75rem);
		text-align: center;
		color: var(--sak-text-subtle, #64748b);
	}

	@media (max-width: 40rem) {
		.sak-cards {
			display: flex;
		}

		.sak-table-wrap-has-cards {
			display: none;
		}
	}
</style>
