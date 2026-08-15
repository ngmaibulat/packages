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
		title,
		body,
		confirmLabel,
		cancelLabel,
		closeLabel,
		busy = false,
		error = '',
		destructive = true,
		size = 'md',
		onConfirm,
		details
	}: {
		dialog?: HTMLDialogElement;
		title: string;
		body?: string;
		confirmLabel: string;
		cancelLabel: string;
		closeLabel: string;
		busy?: boolean;
		error?: string;
		/** Red confirm button. Off for a merely-consequential action. */
		destructive?: boolean;
		size?: 'sm' | 'md' | 'lg';
		onConfirm: () => void;
		/** Extra content between the message and the buttons — a list, a checkbox. */
		details?: Snippet;
	} = $props();
</script>

<Dialog bind:dialog {title} {closeLabel} {size}>
	<DialogBody class="sak-confirm-body">
		{#if body}<p class="sak-confirm-text">{body}</p>{/if}
		{#if details}{@render details()}{/if}
		<!-- `live`: this error is the result of the user pressing the button. -->
		{#if error}<Alert variant="error" size="sm" live>{error}</Alert>{/if}
	</DialogBody>
	<DialogFooter>
		<Button variant="secondary" size="sm" disabled={busy} onclick={() => dialog?.close()}>
			{cancelLabel}
		</Button>
		<Button
			variant={destructive ? 'danger' : 'primary'}
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
