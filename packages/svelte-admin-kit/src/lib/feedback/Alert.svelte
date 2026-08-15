<script module lang="ts">
	export type AlertVariant = 'info' | 'success' | 'warning' | 'error';
	export type AlertSize = 'sm' | 'md';
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';

	// A short message about the state of something: a failed save, a completed
	// import, a caveat about the form below.
	//
	// This is the piece an admin kit is least excusable for missing. The app it
	// came from had `Button` and `Field` but no way to say "that didn't work",
	// so it said it seventy-six times in forty-four files, in four radii, three
	// text sizes, and both bordered and borderless forms.
	//
	// `live` is the prop that matters and it defaults to FALSE. An alert role on
	// a message that is already on screen at load makes a screen reader announce
	// every standing caveat before the user has done anything — which is worse
	// than silence, not better. Set it only where the message appears *in
	// response* to something the user did, which is the minority of cases.

	let {
		variant = 'error',
		size = 'md',
		live = false,
		title,
		class: className = '',
		children
	}: {
		variant?: AlertVariant;
		/** `sm` is the in-dialog/inline form; `md` the page-level one. */
		size?: AlertSize;
		/** Announce to assistive tech. Only for messages that appear after a user action. */
		live?: boolean;
		/** Optional bold first line, for the few that carry a heading. */
		title?: string;
		class?: string;
		children: Snippet;
	} = $props();
</script>

<div
	class="sak-alert sak-alert-{variant} sak-alert-{size} {className}"
	role={live ? (variant === 'error' || variant === 'warning' ? 'alert' : 'status') : undefined}
>
	{#if title}<p class="sak-alert-title">{title}</p>{/if}
	<div class="sak-alert-body">{@render children()}</div>
</div>

<style>
	.sak-alert {
		border: 1px solid;
		border-radius: var(--sak-alert-radius, 0.75rem);
		font-weight: 600;
	}

	/* Two sizes rather than the six that existed. `sm` is what fits inside a
	   dialog beside a field; `md` is what sits above a page's content. */
	.sak-alert-sm {
		padding: 0.5rem 0.75rem;
		font-size: var(--sak-font-size-xs, 0.75rem);
	}

	.sak-alert-md {
		padding: 0.75rem 1rem;
		font-size: var(--sak-font-size-md, 0.875rem);
	}

	.sak-alert-title {
		margin: 0 0 0.25rem;
		font-weight: 700;
	}

	.sak-alert-body {
		font-weight: inherit;
	}

	/*
	 * Every alert is bordered. The originals were split between bordered and
	 * borderless with no rule behind which was which, and a border is what keeps
	 * a tinted block legible on a dark surface, where the fill alone is nearly
	 * the page colour.
	 */
	.sak-alert-error {
		border-color: var(--sak-alert-error-border, #fecaca);
		background: var(--sak-alert-error-bg, #fef2f2);
		color: var(--sak-alert-error-text, #991b1b);
	}

	.sak-alert-success {
		border-color: var(--sak-alert-success-border, #bbf7d0);
		background: var(--sak-alert-success-bg, #f0fdf4);
		color: var(--sak-alert-success-text, #166534);
	}

	.sak-alert-warning {
		border-color: var(--sak-alert-warning-border, #fde68a);
		background: var(--sak-alert-warning-bg, #fffbeb);
		color: var(--sak-alert-warning-text, #92400e);
	}

	.sak-alert-info {
		border-color: var(--sak-alert-info-border, #bfdbfe);
		background: var(--sak-alert-info-bg, #eff6ff);
		color: var(--sak-alert-info-text, #1e40af);
	}
</style>
