<script lang="ts">
	import Button from './Button.svelte';

	// Move-up / move-down for one row of an ordered list.
	//
	// Six places in the app it came from hand-rolled this pair, with two
	// different glyph sets (▲▼ and ↑↓), three different button classes, and
	// disabled-at-the-ends logic re-derived each time. The arrows here are
	// drawn as SVG rather than typed as characters: the glyphs render at wildly
	// different weights across fonts, which is why those six looked unrelated.
	//
	// Labels are props (this package has no translator) and land on both
	// `aria-label` and `title`, so the control is usable by screen reader and
	// hover alike.

	let {
		index,
		count,
		onmove,
		upLabel,
		downLabel,
		disabled = false,
		size = 'xs',
		class: className = ''
	}: {
		index: number;
		count: number;
		/** Called with -1 (up) or 1 (down). */
		onmove: (direction: -1 | 1) => void;
		upLabel: string;
		downLabel: string;
		disabled?: boolean;
		size?: 'xs' | 'sm';
		class?: string;
	} = $props();

	const atFirst = $derived(index <= 0);
	const atLast = $derived(index >= count - 1);
</script>

<div class="sak-reorder {className}">
	<Button
		variant="secondary"
		{size}
		iconOnly
		disabled={disabled || atFirst}
		title={upLabel}
		ariaLabel={upLabel}
		onclick={() => onmove(-1)}
	>
		<svg viewBox="0 0 24 24" aria-hidden="true" class="sak-reorder-glyph">
			<path
				d="M12 19V5M5 12l7-7 7 7"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
			/>
		</svg>
	</Button>
	<Button
		variant="secondary"
		{size}
		iconOnly
		disabled={disabled || atLast}
		title={downLabel}
		ariaLabel={downLabel}
		onclick={() => onmove(1)}
	>
		<svg viewBox="0 0 24 24" aria-hidden="true" class="sak-reorder-glyph">
			<path
				d="M12 5v14M5 12l7 7 7-7"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
			/>
		</svg>
	</Button>
</div>

<style>
	.sak-reorder {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
	}

	.sak-reorder-glyph {
		width: 0.875em;
		height: 0.875em;
	}
</style>
