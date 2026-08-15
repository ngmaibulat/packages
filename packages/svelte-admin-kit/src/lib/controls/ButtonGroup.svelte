<script lang="ts" generics="T extends string">
	// A segmented control: N mutually-exclusive options rendered as one joined
	// row. Replaces the eight different inline-ternary spellings the app grew
	// for "this segment is the active one" (view switchers, log-level filters,
	// editor source/preview tabs).
	//
	// Selection is reported through `onselect` rather than two-way binding so a
	// caller that needs to reject or transform a choice can; callers that don't
	// just assign in the handler.

	let {
		options,
		value,
		onselect,
		size = 'sm',
		disabled = false,
		ariaLabel,
		class: className = ''
	}: {
		options: { value: T; label: string; title?: string; disabled?: boolean }[];
		value: T;
		onselect: (value: T) => void;
		size?: 'xs' | 'sm' | 'md' | 'lg';
		disabled?: boolean;
		ariaLabel?: string;
		class?: string;
	} = $props();
</script>

<div class="sak-group sak-group-{size} {className}" role="group" aria-label={ariaLabel}>
	{#each options as option (option.value)}
		<button
			type="button"
			class="sak-group-item"
			class:sak-group-item-active={option.value === value}
			aria-pressed={option.value === value}
			title={option.title}
			disabled={disabled || option.disabled}
			onclick={() => onselect(option.value)}
		>
			{option.label}
		</button>
	{/each}
</div>

<style>
	.sak-group {
		display: inline-flex;
		align-items: stretch;
		border: 1px solid var(--sak-border-strong, #cbd5e1);
		/* Same radius as Button, so a group and a button in one toolbar row read as
		   the same family rather than two. */
		border-radius: var(--sak-radius-md, 0.75rem);
		overflow: hidden;
		background: var(--sak-surface, #ffffff);
	}

	.sak-group-item {
		appearance: none;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		box-sizing: border-box;
		border: 0;
		background: transparent;
		color: var(--sak-text-muted, #475569);
		font-family: inherit;
		font-weight: 600;
		line-height: 1.25;
		white-space: nowrap;
		cursor: pointer;
		transition:
			background-color 120ms ease,
			color 120ms ease;
	}

	/* Separators are drawn as a left border on every item but the first, so the
	   group has no double-width divider and no stray outer border. */
	.sak-group-item + .sak-group-item {
		border-left: 1px solid var(--sak-border-strong, #cbd5e1);
	}

	.sak-group-item:hover:not(:disabled) {
		background: var(--sak-surface-strong, #f1f5f9);
		color: var(--sak-foreground, #020617);
	}

	.sak-group-item-active,
	.sak-group-item-active:hover:not(:disabled) {
		background: var(--sak-selected-bg, #dbeafe);
		color: var(--sak-selected-text, #1e40af);
	}

	/* The ring goes inside: an outline-offset ring on a joined segment would be
	   clipped by the group's `overflow: hidden`. */
	.sak-group-item:focus-visible {
		outline: var(--sak-focus-ring-width, 2px) solid var(--sak-focus-ring, #94a3b8);
		outline-offset: -3px;
	}

	.sak-group-item:disabled {
		cursor: not-allowed;
		opacity: var(--sak-disabled-opacity, 0.55);
	}

	/* Sized off the same height scale as Button, not a padding pair of its own —
	   a segmented control and a button sitting in the same toolbar row have to be
	   the same height, and this file used to reach that only by coincidence. */
	.sak-group-xs .sak-group-item {
		height: var(--sak-height-xs, 1.75rem);
		padding-inline: var(--sak-pad-x-sm, 0.75rem);
		font-size: var(--sak-font-size-xs, 0.75rem);
	}
	.sak-group-sm .sak-group-item {
		height: var(--sak-height-sm, 2rem);
		padding-inline: var(--sak-pad-x-sm, 0.75rem);
		font-size: var(--sak-font-size-sm, 0.8125rem);
	}
	.sak-group-md .sak-group-item {
		height: var(--sak-height-md, 2.375rem);
		padding-inline: var(--sak-pad-x-md, 1rem);
		font-size: var(--sak-font-size-md, 0.875rem);
	}
	.sak-group-lg .sak-group-item {
		height: var(--sak-height-lg, 2.75rem);
		padding-inline: var(--sak-pad-x-lg, 1.25rem);
		font-size: var(--sak-font-size-lg, 1rem);
	}

	@media (prefers-reduced-motion: reduce) {
		.sak-group-item {
			transition: none;
		}
	}
</style>
