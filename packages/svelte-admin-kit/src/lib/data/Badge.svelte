<script module lang="ts">
	export type BadgeTone =
		'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'accent' | 'muted';
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';

	// A small pill labelling a value: a status, a count, a type.
	//
	// The app this came from already had a `.badge` class, and it worked — for
	// the handful of cases someone had defined a modifier for. Everywhere else
	// (twenty-nine sites) the class was applied and then its colour overridden
	// inline, and twenty-three more skipped it entirely and rebuilt the pill.
	// That is what a fixed set of domain modifiers does: the moment you need a
	// colour nobody named, the class stops helping and you reach past it.
	//
	// So the axis here is a generic tone, not a domain meaning. A caller that
	// has domain meanings — a severity, a category — maps them to a tone at the
	// call site and keeps that mapping where the domain lives.

	let {
		tone = 'neutral',
		class: className = '',
		title,
		children
	}: {
		tone?: BadgeTone;
		class?: string;
		title?: string;
		children: Snippet;
	} = $props();
</script>

<span class="sak-badge sak-badge-{tone} {className}" {title}>{@render children()}</span>

<style>
	.sak-badge {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		border-radius: var(--sak-radius-pill, 9999px);
		padding: 0.125rem 0.625rem;
		font-size: var(--sak-font-size-xs, 0.75rem);
		font-weight: 600;
		/* A pill inside a table cell must not stretch the row when the label is
		   long; it wraps at the cell edge instead of forcing a wider column. */
		max-width: 100%;
	}

	.sak-badge-neutral {
		background: var(--sak-badge-neutral-bg, #f1f5f9);
		color: var(--sak-badge-neutral-text, #334155);
	}

	.sak-badge-muted {
		background: var(--sak-badge-muted-bg, transparent);
		color: var(--sak-badge-muted-text, #64748b);
		box-shadow: inset 0 0 0 1px var(--sak-badge-muted-border, #cbd5e1);
	}

	.sak-badge-info {
		background: var(--sak-badge-info-bg, #eff6ff);
		color: var(--sak-badge-info-text, #1e40af);
	}

	.sak-badge-success {
		background: var(--sak-badge-success-bg, #f0fdf4);
		color: var(--sak-badge-success-text, #166534);
	}

	.sak-badge-warning {
		background: var(--sak-badge-warning-bg, #fffbeb);
		color: var(--sak-badge-warning-text, #92400e);
	}

	.sak-badge-danger {
		background: var(--sak-badge-danger-bg, #fef2f2);
		color: var(--sak-badge-danger-text, #991b1b);
	}

	.sak-badge-accent {
		background: var(--sak-badge-accent-bg, #eef2ff);
		color: var(--sak-badge-accent-text, #3730a3);
	}
</style>
