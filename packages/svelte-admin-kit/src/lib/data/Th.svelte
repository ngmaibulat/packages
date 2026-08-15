<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		align = 'start',
		nowrap = false,
		width,
		scope = 'col',
		class: className = '',
		children,
		...rest
	}: {
		align?: 'start' | 'end' | 'center';
		nowrap?: boolean;
		width?: string;
		scope?: 'col' | 'row';
		class?: string;
		children: Snippet;
		/** Anything else (title, aria-*, data-*) lands on the element. */
		[key: string]: unknown;
	} = $props();
</script>

<th
	{...rest}
	{scope}
	class="sak-th sak-cell-{align} {className}"
	class:sak-cell-nowrap={nowrap}
	style:width
>
	{@render children()}
</th>

<style>
	.sak-th {
		border-bottom: 1px solid var(--sak-table-border, #e2e8f0);
		padding: var(--sak-table-pad-y, 0.5rem) var(--sak-table-pad-x, 0.75rem);
		vertical-align: bottom;
		font-size: var(--sak-font-size-xs, 0.75rem);
		font-weight: 600;
		color: var(--sak-table-head-text, #64748b);
	}

	/* `start`/`end` rather than left/right so a right-to-left locale flips with
	   the document instead of against it. */
	.sak-cell-start {
		text-align: start;
	}
	.sak-cell-end {
		text-align: end;
	}
	.sak-cell-center {
		text-align: center;
	}
	.sak-cell-nowrap {
		white-space: nowrap;
	}
</style>
