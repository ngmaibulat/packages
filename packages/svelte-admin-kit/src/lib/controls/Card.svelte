<script lang="ts">
	import type { Snippet } from 'svelte';

	// The standard content surface, with an optional title row.
	//
	// This settles a real conflict in the app it came from: a `.card` class and
	// seventeen components that each declared their own `cardClass` with a
	// different radius, padding and dark treatment. Both are now this.
	//
	// `as` exists because most of these surfaces are semantically a <section>
	// (and several are the only landmark on their page), but a card inside a
	// grid of cards is a plain <div>.

	let {
		title,
		as = 'section',
		padded = true,
		class: className = '',
		actions,
		children
	}: {
		title?: string;
		as?: 'section' | 'div' | 'article';
		padded?: boolean;
		class?: string;
		/** Rendered on the title row, right-aligned — the usual "Edit"/"Add" button. */
		actions?: Snippet;
		children: Snippet;
	} = $props();
</script>

<svelte:element this={as} class="sak-card {className}" class:sak-card-padded={padded}>
	{#if title || actions}
		<div class="sak-card-head">
			{#if title}<h2 class="sak-card-title">{title}</h2>{/if}
			{#if actions}<div class="sak-card-actions">{@render actions()}</div>{/if}
		</div>
	{/if}
	{@render children()}
</svelte:element>

<style>
	.sak-card {
		border-radius: var(--sak-radius-lg, 1rem);
		background: var(--sak-surface, #ffffff);
		box-shadow: var(--sak-card-shadow, 0 1px 2px rgb(15 23 42 / 0.08));
		/*
		 * A hairline, transparent unless the app asks for one. A shadow is what
		 * separates a card from the page on a light background; on a dark one the
		 * shadow does almost nothing and the edge has to be drawn. The app that
		 * this replaced knew that — its hand-written card carried
		 * `dark:ring-1 dark:ring-slate-800` — and the token is how that survives
		 * without the kit having to know a theme exists.
		 */
		border: 1px solid var(--sak-card-border, transparent);
	}

	.sak-card-padded {
		padding: 1.25rem;
	}

	/* wrap + gap rather than a fixed row: several of these titles sit beside
	   two or three buttons and used to overflow on a narrow viewport. */
	.sak-card-head {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		margin-bottom: 1rem;
	}

	.sak-card-title {
		margin: 0;
		font-size: 1.25rem;
		font-weight: 700;
		color: var(--sak-foreground, #020617);
	}

	.sak-card-actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--sak-gap, 0.5rem);
	}
</style>
