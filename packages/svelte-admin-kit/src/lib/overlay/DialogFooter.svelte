<script lang="ts">
	import type { Snippet } from 'svelte';
	import './dialog.css';

	// The action bar at the bottom of a dialog: a tinted, top-bordered band with
	// its buttons pushed to the end.
	//
	// It may sit inside the same <form> as the body — that is the normal shape
	// for a dialog that submits — which is why the body and footer are two
	// components rather than two snippets of one.

	let {
		as = 'div',
		class: className = '',
		children,
		...rest
	}: {
		as?: 'div' | 'footer';
		class?: string;
		children: Snippet;
		[key: string]: unknown;
	} = $props();
</script>

<svelte:element this={as} class="sak-dialog-footer {className}" {...rest}>
	{@render children()}
</svelte:element>
