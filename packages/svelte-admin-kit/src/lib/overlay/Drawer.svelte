<script lang="ts">
	import type { Snippet } from 'svelte';
	import Icon from '../icon/Icon.svelte';

	// An edge-anchored panel, on the same bet Dialog makes and for the same
	// reasons: a native <dialog> opened with showModal() brings focus trapping,
	// inertness of the page behind, Escape-to-close and top-layer stacking, and a
	// hand-rolled sliding panel reimplements all four badly. A navigation drawer
	// is the component most often built as a plain <div> with a z-index, which is
	// exactly how a mobile nav ends up letting the reader tab into the page
	// behind it.
	//
	// It is a separate component rather than a `variant` on Dialog because almost
	// nothing is shared: the geometry is edge-anchored instead of centred, the
	// height is fixed instead of content-driven, and the close affordance is part
	// of the chrome rather than a footer button. A shared component would be two
	// layouts behind one flag.
	//
	// `open` is the only way to drive it — unlike Dialog, which grew that prop
	// second and has to keep the element handle working. A drawer is opened from
	// a nav button that already holds the boolean.

	let {
		open = $bindable(false),
		title,
		closeLabel,
		class: className = '',
		onclose,
		children
	}: {
		open?: boolean;
		/** Also the accessible name of the panel itself. */
		title?: string;
		/** Accessible name for the close button — the glyph has none. */
		closeLabel: string;
		class?: string;
		onclose?: () => void;
		children: Snippet;
	} = $props();

	let el = $state<HTMLDialogElement | null>(null);

	$effect(() => {
		if (!el) return;
		if (open && !el.open) el.showModal();
		else if (!open && el.open) el.close();
	});

	function handleClose() {
		open = false;
		onclose?.();
	}

	// ::backdrop is not a child element, so a click on the scrim reports the
	// <dialog> itself as the target. Anything inside the panel reports the panel.
	function handleClick(event: MouseEvent) {
		if (event.target === el) handleClose();
	}
</script>

<dialog
	bind:this={el}
	class="sak-drawer {className}"
	onclose={handleClose}
	onclick={handleClick}
	aria-label={title}
>
	<div class="sak-drawer-panel">
		<div class="sak-drawer-head">
			{#if title}<h2>{title}</h2>{/if}
			<button type="button" class="sak-drawer-x" aria-label={closeLabel} onclick={handleClose}>
				<Icon name="close" size="1rem" />
			</button>
		</div>
		<div class="sak-drawer-body">
			{@render children()}
		</div>
	</div>
</dialog>

<style>
	.sak-drawer {
		padding: 0;
		/* A CSS reset that zeroes `margin` on `*` takes the UA's centring
		   mechanism with it. `auto` on the inline-end side alone pins the panel to
		   the start edge and lets the remaining space become scrim. */
		margin: 0 auto 0 0;
		border: 0;
		background: transparent;
		/* The element is the full viewport; the visible panel is the child. That
		   split is what makes the scrim clickable across the whole screen while
		   the panel keeps its own background and shadow. */
		max-width: 100%;
		width: 100%;
		height: 100dvh;
		max-height: 100dvh;
		overflow: hidden;
	}

	.sak-drawer::backdrop {
		background: var(--sak-dialog-backdrop, rgb(15 23 42 / 0.5));
	}

	.sak-drawer-panel {
		display: flex;
		flex-direction: column;
		/* 84vw, not 100: the visible strip of scrim is the only affordance saying
		   the page is still there and tapping it comes back. A full-width drawer
		   reads as a navigation, and the reader looks for a back button that does
		   not exist. */
		width: min(20rem, 84vw);
		height: 100%;
		background: var(--sak-surface, #ffffff);
		color: var(--sak-foreground, #020617);
		border-inline-end: 1px solid var(--sak-border, #e2e8f0);
		box-shadow: var(--sak-dialog-shadow, 0 25px 50px -12px rgb(15 23 42 / 0.25));
	}

	.sak-drawer-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		/* The inset, not a fixed padding: an installed PWA in landscape puts the
		   notch on the inline-start edge, over exactly this row. */
		padding: calc(0.75rem + env(safe-area-inset-top)) 0.75rem 0.75rem
			calc(1rem + env(safe-area-inset-left));
		border-bottom: 1px solid var(--sak-border, #e2e8f0);
	}

	h2 {
		margin: 0;
		font-size: var(--sak-font-size-lg, 1rem);
		font-weight: 700;
	}

	.sak-drawer-x {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		flex: 0 0 auto;
		width: var(--sak-height-md, 2.375rem);
		height: var(--sak-height-md, 2.375rem);
		border: 0;
		border-radius: var(--sak-radius-md, 0.75rem);
		background: transparent;
		color: var(--sak-text-muted, #475569);
		cursor: pointer;
	}

	.sak-drawer-x:hover {
		background: var(--sak-surface-strong, #f1f5f9);
		color: var(--sak-foreground, #020617);
	}

	.sak-drawer-x:focus-visible {
		outline: var(--sak-focus-ring-width, 2px) solid var(--sak-focus-ring, #94a3b8);
		outline-offset: -2px;
	}

	.sak-drawer-body {
		flex: 1 1 auto;
		min-height: 0;
		overflow-y: auto;
		/* Momentum scrolling stops at the panel rather than rubber-banding the
		   inert page behind it. */
		overscroll-behavior: contain;
		padding: 0.75rem calc(0.75rem + env(safe-area-inset-left))
			calc(0.75rem + env(safe-area-inset-bottom));
	}

	/*
	 * THE SLIDE.
	 *
	 * A <dialog> goes from `display: none` to `display: block`, and a property
	 * cannot animate across that unless the discrete change is allowed to and a
	 * starting value exists. Both are recent — Chrome 117, Safari 17.4, Firefox
	 * 129 — and both degrade to exactly the right thing on anything older: the
	 * drawer appears instantly, which is what an un-animated drawer should do.
	 * Nothing here is load-bearing for behaviour.
	 */
	.sak-drawer-panel {
		translate: 0;
		transition: translate 180ms ease;
	}

	@starting-style {
		.sak-drawer[open] .sak-drawer-panel {
			translate: -100% 0;
		}
	}

	.sak-drawer::backdrop {
		opacity: 1;
		transition:
			opacity 180ms ease,
			display 180ms allow-discrete,
			overlay 180ms allow-discrete;
	}

	@starting-style {
		.sak-drawer[open]::backdrop {
			opacity: 0;
		}
	}

	/*
	 * Reduced motion gets a drawer that is simply there. This animation has no
	 * informational content to preserve — it says "from the left" and nothing
	 * else — so removing it outright is the correct substitution rather than a
	 * degradation.
	 */
	@media (prefers-reduced-motion: reduce) {
		.sak-drawer-panel,
		.sak-drawer::backdrop {
			transition: none;
		}
	}
</style>
