<script lang="ts">
	import type { Snippet } from 'svelte';

	// A set of related checkboxes, stacked one per row.
	//
	// The single column is the entire point and is deliberately NOT a prop: the
	// app this kit was extracted from had four groups that laid their boxes into
	// a `flex flex-wrap` row or a two/three-column grid, which reads as sloppy
	// and makes a list of options hard to scan (the eye has to track both axes,
	// and each column's labels are a different length). Every call site had
	// hand-rolled its own wrapper because there was no primitive to reach for,
	// so the layout drifted per screen. Now there is one.
	//
	// `<fieldset>`/`<legend>` rather than a div + span: it is the element that
	// tells a screen reader these checkboxes belong together, and `disabled` on
	// it cascades to every input inside for free — which is how a group can be
	// greyed out by a master toggle without touching each box.

	let {
		legend,
		help,
		disabled = false,
		class: className = '',
		children
	}: {
		legend?: string;
		help?: string;
		disabled?: boolean;
		class?: string;
		children: Snippet;
	} = $props();

	const uid = $props.id();
	const helpId = $derived(`${uid}-help`);
</script>

<fieldset
	class="sak-check-group {className}"
	{disabled}
	aria-describedby={help ? helpId : undefined}
>
	{#if legend}
		<legend class="sak-check-group-legend">{legend}</legend>
	{/if}

	<!-- The grid lives on this inner element, never on the fieldset: a
	     `display: grid` fieldset pulls its own <legend> into the grid flow and
	     the legend becomes a row of the layout. -->
	<div class="sak-check-group-body">
		{@render children()}
	</div>

	{#if help}
		<p class="sak-check-group-help" id={helpId}>{help}</p>
	{/if}
</fieldset>

<style>
	.sak-check-group {
		/* A fieldset ships with a border, padding and min-inline-size: auto —
		   the last of which stops it from shrinking inside a grid cell. */
		min-inline-size: 0;
		margin: 0;
		padding: 0;
		border: 0;
	}

	.sak-check-group-legend {
		/* Matches .sak-field-label, so a group sitting next to a text field in a
		   form reads as the same level of heading. */
		margin-bottom: var(--sak-gap, 0.5rem);
		padding: 0;
		font-size: var(--sak-font-size-md, 0.875rem);
		font-weight: 600;
		color: var(--sak-text-muted, #475569);
	}

	.sak-check-group-body {
		display: grid;
		grid-template-columns: 1fr;
		gap: var(--sak-gap, 0.5rem);
	}

	.sak-check-group-help {
		margin: var(--sak-gap, 0.5rem) 0 0;
		font-size: var(--sak-font-size-xs, 0.75rem);
		color: var(--sak-text-subtle, #64748b);
	}
</style>
