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

	// THERE ARE TWO WAYS TO DRIVE THIS, AND A CALL SITE MUST PICK ONE.
	//
	//   bind:dialog — you hold the element and call showModal()/close().
	//   bind:open   — you hold a boolean and the dialog follows it.
	//
	// `open` is the friendlier one and was added second, so it cannot simply
	// default to `false`: a caller using only `bind:dialog` would then own a
	// prop permanently reading "closed", and the sync effect below would race to
	// close the dialog they had just opened by hand. It therefore defaults to
	// `undefined`, which is the one value that means "this call site does not
	// drive me this way", and the effect does nothing until it is not that.
	//
	// It has to be $bindable rather than a plain input, because Escape and a
	// backdrop dismissal are closes the BROWSER performs. A parent still holding
	// `open === true` after one of those can never reopen the dialog — the
	// boolean never changes, so no effect ever re-runs.

	let {
		dialog = $bindable<HTMLDialogElement | undefined>(),
		open = $bindable<boolean | undefined>(undefined),
		title,
		closeLabel = 'Close',
		size = 'md',
		showClose = true,
		class: className = '',
		onclose,
		oncancel,
		children
	}: {
		dialog?: HTMLDialogElement;
		/** Two-way open state, as an alternative to driving `dialog` yourself. */
		open?: boolean;
		title: string;
		/** Accessible name for the close button — the glyph has none. */
		closeLabel?: string;
		size?: 'sm' | 'md' | 'lg';
		showClose?: boolean;
		class?: string;
		onclose?: () => void;
		oncancel?: (event: Event) => void;
		children: Snippet;
	} = $props();

	$effect(() => {
		if (open === undefined || !dialog) return;
		// Guarded both ways: showModal() on an already-open dialog throws, and
		// close() on a closed one fires a spurious `close` event.
		if (open && !dialog.open) dialog.showModal();
		else if (!open && dialog.open) dialog.close();
	});

	function handleClose() {
		if (open !== undefined) open = false;
		onclose?.();
	}
</script>

<dialog
	bind:this={dialog}
	class="sak-dialog sak-dialog-{size} {className}"
	onclose={handleClose}
	{oncancel}
>
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
