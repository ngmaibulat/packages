<script lang="ts">
	import type { Snippet } from 'svelte';
	import './dialog.css';

	// The padded content band of a dialog.
	//
	// `as` is the whole reason this is a component and not a class name: about
	// half the dialogs in the app this came from are a form, and the <form> has
	// to be the element that carries the padding — otherwise it is either an
	// extra wrapper or the submit button ends up outside the form. Rendering it
	// as the <form> itself keeps the markup flat and the submit wired up.

	let {
		as = 'div',
		class: className = '',
		children,
		...rest
	}: {
		as?: 'div' | 'form';
		class?: string;
		children: Snippet;
		/** Forwarded to the element — in practice `onsubmit` when `as="form"`. */
		[key: string]: unknown;
	} = $props();
</script>

<svelte:element this={as} class="sak-dialog-body {className}" {...rest}>
	{@render children()}
</svelte:element>
