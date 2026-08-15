<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		align = 'start',
		nowrap = false,
		numeric = false,
		muted = false,
		colspan,
		class: className = '',
		children,
		...rest
	}: {
		align?: 'start' | 'end' | 'center';
		nowrap?: boolean;
		/** Tabular figures, so digits line up down the column. Implies right alignment. */
		numeric?: boolean;
		muted?: boolean;
		colspan?: number;
		class?: string;
		children: Snippet;
		/** Anything else (title, aria-*, data-*) lands on the element. */
		[key: string]: unknown;
	} = $props();

	// A numeric column that is not right-aligned is almost always an oversight,
	// so `numeric` implies it — while still letting an explicit `align` win.
	const resolvedAlign = $derived(align === 'start' && numeric ? 'end' : align);
</script>

<td
	{...rest}
	class="sak-td sak-cell-{resolvedAlign} {className}"
	class:sak-cell-nowrap={nowrap}
	class:sak-td-numeric={numeric}
	class:sak-td-muted={muted}
	{colspan}
>
	{@render children()}
</td>

<style>
	.sak-td {
		padding: var(--sak-table-pad-y, 0.5rem) var(--sak-table-pad-x, 0.75rem);
		vertical-align: top;
		color: var(--sak-foreground, #020617);
	}

	.sak-td-numeric {
		font-variant-numeric: tabular-nums;
	}

	.sak-td-muted {
		color: var(--sak-text-muted, #475569);
	}

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
