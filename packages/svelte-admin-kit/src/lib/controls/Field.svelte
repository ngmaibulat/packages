<script lang="ts">
	import type { Snippet } from 'svelte';

	// Label + control + help + error chrome, in one place.
	//
	// `TextInput`/`Textarea`/`Select` compose this internally, so the common
	// case is a single tag at the call site. Field is exported in its own right
	// for controls it does not wrap — a FileDropzone, a pair of date inputs, a
	// third-party widget — so those still get the same label typography,
	// help-text placement and error slot instead of hand-rolling them.
	//
	// The snippet receives the ids it must wire up. Generating them here (via
	// `$props.id()`, which is SSR-stable) is what makes label/help/error
	// association automatic rather than something each call site remembers.

	let {
		label,
		help,
		error,
		required = false,
		id: idProp,
		class: className = '',
		children
	}: {
		label?: string;
		help?: string;
		error?: string;
		required?: boolean;
		id?: string;
		class?: string;
		children: Snippet<[{ id: string; describedBy: string | undefined; invalid: boolean }]>;
	} = $props();

	const uid = $props.id();
	const id = $derived(idProp ?? `${uid}-control`);
	const helpId = $derived(`${uid}-help`);
	const errorId = $derived(`${uid}-error`);
	const invalid = $derived(Boolean(error));

	// An invalid control points at the error, not the help text: a screen
	// reader reading both would bury the actionable half.
	const describedBy = $derived(error ? errorId : help ? helpId : undefined);
</script>

<div class="sak-field {className}">
	{#if label}
		<label class="sak-field-label" for={id}>
			{label}
			{#if required}<span class="sak-field-required" aria-hidden="true">*</span>{/if}
		</label>
	{/if}

	{@render children({ id, describedBy, invalid })}

	{#if error}
		<p class="sak-field-error" id={errorId} role="alert">{error}</p>
	{:else if help}
		<p class="sak-field-help" id={helpId}>{help}</p>
	{/if}
</div>

<style>
	.sak-field {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		min-width: 0;
	}

	.sak-field-label {
		font-size: var(--sak-font-size-md, 0.875rem);
		font-weight: 600;
		color: var(--sak-text-muted, #475569);
	}

	.sak-field-required {
		margin-left: 0.125rem;
		color: var(--sak-invalid-text, #b91c1c);
	}

	.sak-field-help {
		margin: 0;
		font-size: var(--sak-font-size-xs, 0.75rem);
		color: var(--sak-text-subtle, #64748b);
	}

	.sak-field-error {
		margin: 0;
		font-size: var(--sak-font-size-xs, 0.75rem);
		font-weight: 600;
		color: var(--sak-invalid-text, #b91c1c);
	}
</style>
