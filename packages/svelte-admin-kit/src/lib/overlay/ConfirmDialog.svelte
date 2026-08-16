<script lang="ts">
	import type { Snippet } from 'svelte';
	import Button from '../controls/Button.svelte';
	import Alert from '../feedback/Alert.svelte';
	import Dialog from './Dialog.svelte';
	import DialogBody from './DialogBody.svelte';
	import DialogFooter from './DialogFooter.svelte';

	// "Are you sure?" — the shape every destructive action needs, with the two
	// states such an action actually has: in flight, and failed.
	//
	// Those two are why this is worth a component. A confirm dialog without a
	// busy state lets an impatient second click fire the request twice, and one
	// without an error slot has to close on failure and report the problem
	// somewhere the user is no longer looking. Both were hand-rolled per call
	// site before, and not always with both states.
	//
	// The confirm button is `loading` rather than merely `disabled` while busy:
	// Button's loading state already blocks the click and says why.

	let {
		dialog = $bindable<HTMLDialogElement | undefined>(),
		open = $bindable<boolean | undefined>(undefined),
		title,
		body,
		confirmLabel = 'Confirm',
		cancelLabel = 'Cancel',
		closeLabel = 'Close',
		busy = false,
		error = '',
		destructive = true,
		confirmVariant,
		size = 'md',
		onConfirm,
		details
	}: {
		dialog?: HTMLDialogElement;
		/** Two-way open state. See Dialog for why it defaults to `undefined`. */
		open?: boolean;
		title: string;
		body?: string;
		confirmLabel?: string;
		cancelLabel?: string;
		closeLabel?: string;
		busy?: boolean;
		error?: string;
		/** Red confirm button. Off for a merely-consequential action. */
		destructive?: boolean;
		/**
		 * Overrides what `destructive` would pick, for the middle of the scale it
		 * cannot express.
		 *
		 * Not every consequential action is destructive. Switching which
		 * certificate an install serves destroys nothing and is trivially
		 * reversible, but it changes what every client sees on the next
		 * handshake — amber, where a blue "primary" understates it and a red
		 * "danger" tells the operator to expect loss that is not coming.
		 */
		confirmVariant?: 'primary' | 'warning' | 'danger';
		size?: 'sm' | 'md' | 'lg';
		onConfirm: () => void;
		/** Extra content between the message and the buttons — a list, a checkbox. */
		details?: Snippet;
	} = $props();

	function cancel() {
		if (open !== undefined) open = false;
		dialog?.close();
	}
</script>

<Dialog bind:dialog bind:open {title} {closeLabel} {size}>
	<DialogBody class="sak-confirm-body">
		{#if body}<p class="sak-confirm-text">{body}</p>{/if}
		{#if details}{@render details()}{/if}
		<!-- `live`: this error is the result of the user pressing the button. -->
		{#if error}<Alert variant="error" size="sm" live>{error}</Alert>{/if}
	</DialogBody>
	<DialogFooter>
		<Button variant="secondary" size="sm" disabled={busy} onclick={cancel}>
			{cancelLabel}
		</Button>
		<!--
		  SOLID, where a bare `danger` Button would be outlined.

		  That inversion is deliberate and it is about context, not emphasis. An
		  outlined delete is right in a table row because it sits among many and a
		  row of filled red buttons is a wall of alarm. Here it is the only thing
		  on the surface to press, and the outline reads as the secondary choice
		  next to a Cancel that actually is one.
		-->
		<Button
			variant={confirmVariant ?? (destructive ? 'danger' : 'primary')}
			appearance="solid"
			size="sm"
			loading={busy}
			onclick={onConfirm}
		>
			{confirmLabel}
		</Button>
	</DialogFooter>
</Dialog>

<style>
	:global(.sak-confirm-body) {
		display: grid;
		gap: 0.75rem;
	}

	.sak-confirm-text {
		margin: 0;
		font-size: var(--sak-font-size-md, 0.875rem);
		color: var(--sak-text-muted, #475569);
	}
</style>
