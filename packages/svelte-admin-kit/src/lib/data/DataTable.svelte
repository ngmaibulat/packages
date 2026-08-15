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

	let {
		columns,
		rows,
		key,
		row,
		emptyMessage,
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
		/** Shown in a full-width row when `rows` is empty. */
		emptyMessage?: string;
		/** Accessible description, when the surrounding heading is not enough. */
		caption?: string;
		bordered?: boolean;
		class?: string;
		/** Richer empty content, when a sentence is not enough. Wins over `emptyMessage`. */
		empty?: Snippet;
	} = $props();
</script>

<div class="sak-table-wrap {className}" class:sak-table-wrap-bordered={bordered}>
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
				{#if empty || emptyMessage}
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
</style>
