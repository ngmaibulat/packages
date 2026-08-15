<script lang="ts">
	import type { Snippet } from 'svelte';

	// "There is nothing here yet" — the dashed box a list shows when it has no
	// rows, with room for the button that would create the first one.
	//
	// Deliberately NOT the in-table version. A table's empty row has to span the
	// header's columns, and a component that cannot see those columns can only
	// take the count as a prop and be told a wrong number. DataTable owns that
	// case and derives the span itself.

	let {
		message,
		class: className = '',
		children
	}: {
		message: string;
		class?: string;
		/** Usually the "Create the first one" button. */
		children?: Snippet;
	} = $props();
</script>

<div class="sak-empty {className}">
	<p class="sak-empty-message">{message}</p>
	{#if children}<div class="sak-empty-action">{@render children()}</div>{/if}
</div>

<style>
	.sak-empty {
		border: 1px dashed var(--sak-empty-border, #cbd5e1);
		border-radius: var(--sak-radius-lg, 1rem);
		background: var(--sak-empty-bg, #f8fafc);
		padding: 1.5rem 1rem;
		text-align: center;
	}

	.sak-empty-message {
		margin: 0;
		font-size: var(--sak-font-size-md, 0.875rem);
		color: var(--sak-empty-text, #64748b);
	}

	.sak-empty-action {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: var(--sak-gap, 0.5rem);
		margin-top: 0.75rem;
	}
</style>
