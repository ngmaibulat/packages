<script lang="ts">
	// A checkbox with its label, laid out as one clickable row.
	//
	// Deliberately NOT built on Field: a checkbox's label sits beside the
	// control, not above it, and wrapping the pair in a <label> is what makes
	// the text itself a hit target. The app it replaces had 40 bare native
	// checkboxes with no styling at all (or a lone `h-4 w-4`), so this is where
	// the visual upgrade actually shows.
	//
	// `indeterminate` exists for "select all" headers, which the app currently
	// fakes by leaving the box unchecked.

	let {
		checked = $bindable(false),
		indeterminate = false,
		label,
		help,
		disabled = false,
		id,
		name,
		value,
		class: className = '',
		onchange,
		...rest
	}: {
		checked?: boolean;
		indeterminate?: boolean;
		label?: string;
		help?: string;
		disabled?: boolean;
		id?: string;
		name?: string;
		value?: string;
		class?: string;
		onchange?: (event: Event) => void;
		[key: string]: unknown;
	} = $props();

	const uid = $props.id();
	const controlId = $derived(id ?? `${uid}-checkbox`);
	const helpId = $derived(`${uid}-help`);
</script>

<div class="sak-check-row {className}">
	<input
		id={controlId}
		type="checkbox"
		class="sak-check"
		bind:checked
		{indeterminate}
		{disabled}
		{name}
		{value}
		aria-describedby={help ? helpId : undefined}
		{onchange}
		{...rest}
	/>
	{#if label}
		<label class="sak-check-label" class:sak-check-label-disabled={disabled} for={controlId}>
			{label}
		</label>
	{/if}
	{#if help}
		<p class="sak-check-help" id={helpId}>{help}</p>
	{/if}
</div>

<style>
	/* A two-column grid rather than a flex row: the help text belongs under the
	   label, aligned with it, not under the box. */
	.sak-check-row {
		display: grid;
		grid-template-columns: auto 1fr;
		align-items: center;
		gap: 0 var(--sak-gap, 0.5rem);
	}

	.sak-check {
		appearance: none;
		flex: none;
		width: 1rem;
		height: 1rem;
		margin: 0;
		border: 1px solid var(--sak-input-border, #cbd5e1);
		border-radius: 0.3rem;
		background: var(--sak-input-bg, #ffffff);
		cursor: pointer;
		display: grid;
		place-content: center;
		transition:
			background-color 120ms ease,
			border-color 120ms ease;
	}

	/* The tick is drawn with a clip-path rather than a background image so it
	   inherits currentColor and needs no asset. */
	.sak-check::before {
		content: '';
		width: 0.65rem;
		height: 0.65rem;
		transform: scale(0);
		background: var(--sak-primary-text, #ffffff);
		clip-path: polygon(14% 44%, 0 65%, 40% 100%, 100% 16%, 84% 0%, 38% 70%);
		transition: transform 100ms ease;
	}

	.sak-check:checked {
		background: var(--sak-primary-bg, #0f172a);
		border-color: var(--sak-primary-bg, #0f172a);
	}

	.sak-check:checked::before {
		transform: scale(1);
	}

	.sak-check:indeterminate {
		background: var(--sak-primary-bg, #0f172a);
		border-color: var(--sak-primary-bg, #0f172a);
	}

	.sak-check:indeterminate::before {
		transform: scale(1);
		clip-path: polygon(10% 40%, 90% 40%, 90% 60%, 10% 60%);
	}

	.sak-check:focus-visible {
		outline: var(--sak-focus-ring-width, 2px) solid var(--sak-focus-ring, #94a3b8);
		outline-offset: var(--sak-focus-ring-offset, 2px);
	}

	.sak-check:disabled {
		cursor: not-allowed;
		opacity: var(--sak-disabled-opacity, 0.55);
	}

	.sak-check-label {
		font-size: var(--sak-font-size-md, 0.875rem);
		color: var(--sak-foreground, #020617);
		cursor: pointer;
	}

	.sak-check-label-disabled {
		cursor: not-allowed;
		opacity: var(--sak-disabled-opacity, 0.55);
	}

	.sak-check-help {
		grid-column: 2;
		margin: 0.125rem 0 0;
		font-size: var(--sak-font-size-xs, 0.75rem);
		color: var(--sak-text-subtle, #64748b);
	}

	@media (prefers-reduced-motion: reduce) {
		.sak-check,
		.sak-check::before {
			transition: none;
		}
	}
</style>
