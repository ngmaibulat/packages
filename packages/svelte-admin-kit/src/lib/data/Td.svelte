<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		align = 'start',
		nowrap = false,
		numeric = false,
		mono = false,
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
		/**
		 * The monospace data face, for a cell holding an id, a host, a CIDR or a
		 * key prefix.
		 *
		 * A SEPARATE AXIS from `numeric`, not a synonym: `numeric` is about digits
		 * lining up down a column of latencies and pulls the value to the end
		 * edge, while `mono` is about a token being scannable character by
		 * character and must stay start-aligned. A message id right-aligned
		 * because it happened to be monospace is the failure this split avoids.
		 */
		mono?: boolean;
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
	class:sak-td-mono={mono}
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

	.sak-td-mono {
		font-family: var(--sak-font-mono, ui-monospace, monospace);
		font-variant-numeric: tabular-nums;
		/* Ids, hostnames and base64 have no spaces to break at, so the default
		   word wrap leaves them overflowing the cell instead of wrapping in it. */
		overflow-wrap: anywhere;
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
