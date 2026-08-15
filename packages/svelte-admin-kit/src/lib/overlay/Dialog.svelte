<script lang="ts">
	import type { Snippet } from 'svelte';
	import Button from '../controls/Button.svelte';
	import './dialog.css';

	// A native <dialog> with the title bar and close button every modal needs.
	//
	// Native rather than a hand-built overlay on purpose: the platform already
	// gives focus trapping, inertness of the page behind, Escape-to-close and
	// top-layer stacking, none of which is worth reimplementing.
	//
	// The body and footer are NOT rendered here. They are separate components
	// (DialogBody/DialogFooter) because a dialog that submits a form needs the
	// <form> to wrap both of them — and a component that rendered the footer
	// itself would force the submit button outside the form it submits, leaving
	// every such call site to reconnect them with a `form="…"` attribute. The
	// split costs one import and keeps the markup honest.

	let {
		dialog = $bindable<HTMLDialogElement | undefined>(),
		title,
		closeLabel,
		size = 'md',
		showClose = true,
		class: className = '',
		onclose,
		oncancel,
		children
	}: {
		dialog?: HTMLDialogElement;
		title: string;
		/** Accessible name for the close button — required, since the glyph has none. */
		closeLabel: string;
		size?: 'sm' | 'md' | 'lg';
		showClose?: boolean;
		class?: string;
		onclose?: () => void;
		oncancel?: (event: Event) => void;
		children: Snippet;
	} = $props();
</script>

<dialog bind:this={dialog} class="sak-dialog sak-dialog-{size} {className}" {onclose} {oncancel}>
	<div class="sak-dialog-head">
		<h2 class="sak-dialog-title">{title}</h2>
		{#if showClose}
			<Button
				variant="ghost"
				size="sm"
				shape="square"
				ariaLabel={closeLabel}
				onclick={() => dialog?.close()}
			>
				✕
			</Button>
		{/if}
	</div>
	{@render children()}
</dialog>
