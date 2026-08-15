<script lang="ts">
	import type { Snippet } from 'svelte';

	// The block every screen opens with: a page title, an optional line of
	// explanation under it, and occasionally a button or two on the right.
	//
	// In the app this came from it was sixty-eight byte-identical copies of the
	// same two elements. Nothing about it was ever decided per-page — which is
	// exactly why it drifted anyway: the title was one class string, the
	// subtitle another, and neither had a name anyone could search for.
	//
	// `title` renders an <h1>. That is deliberate and it is the reason this is a
	// component rather than a class: there should be exactly one per page, and a
	// component makes that easy to see. A screen needing a second-level heading
	// wants a Card title, not this.

	let {
		title,
		subtitle,
		class: className = '',
		actions,
		children
	}: {
		title: string;
		subtitle?: string;
		class?: string;
		/** Right-aligned, on the title row — the usual "Create"/"Export" buttons. */
		actions?: Snippet;
		/** Anything that belongs under the subtitle but above the page body. */
		children?: Snippet;
	} = $props();
</script>

<div class="sak-page-header {className}">
	<div class="sak-page-header-row">
		<div class="sak-page-header-text">
			<h1 class="sak-page-title">{title}</h1>
			{#if subtitle}<p class="sak-page-subtitle">{subtitle}</p>{/if}
		</div>
		{#if actions}<div class="sak-page-header-actions">{@render actions()}</div>{/if}
	</div>
	{#if children}{@render children()}{/if}
</div>

<style>
	.sak-page-header-row {
		display: flex;
		/* wrap + gap rather than a fixed row: a long title beside two buttons
		   otherwise overflows on a narrow viewport. */
		flex-wrap: wrap;
		align-items: flex-start;
		justify-content: space-between;
		gap: 0.75rem;
	}

	.sak-page-header-text {
		/* min-width:0 lets a long unbroken title shrink instead of pushing the
		   actions off the row — flex items default to min-content width. */
		min-width: 0;
	}

	.sak-page-title {
		margin: 0;
		font-size: var(--sak-font-size-display, 1.875rem);
		font-weight: 600;
		line-height: 1.2;
		color: var(--sak-foreground, #020617);
	}

	.sak-page-subtitle {
		margin: 0.25rem 0 0;
		/* Body size, not the controls' `md` step. A page subtitle is prose and
		   reads at the document's own size; `md` (0.875rem) is the size of text
		   inside a control, and using it here shrinks every subtitle by 2px. */
		font-size: var(--sak-font-size-lg, 1rem);
		color: var(--sak-text-muted, #475569);
	}

	.sak-page-header-actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--sak-gap, 0.5rem);
	}
</style>
