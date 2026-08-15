<script lang="ts">
	import type { Snippet } from 'svelte';
	import Field from './Field.svelte';
	import './inputSurface.css';

	// A labelled select. Options arrive either as an `options` array (the
	// tidier form) or as a `children` snippet of raw <option>s — the app has
	// both shapes, including selects whose options are grouped or conditionally
	// rendered, so forcing everything through an array would make some call
	// sites worse rather than better.
	//
	// The chevron comes from `.sak-input-select`; without it `appearance: none`
	// would leave a select looking exactly like a text input.

	let {
		value = $bindable<string | number | null>(''),
		label,
		help,
		error,
		options,
		placeholder,
		required = false,
		disabled = false,
		id,
		name,
		class: className = '',
		fieldClass = '',
		onchange,
		// Aliased: the `{#snippet children(...)}` below (Field's slot) would
		// otherwise shadow this prop and `{@render children()}` would recurse
		// into the wrong snippet.
		children: optionSlot,
		...rest
	}: {
		value?: string | number | null;
		label?: string;
		help?: string;
		error?: string;
		options?: { value: string | number | null; label: string; disabled?: boolean }[];
		placeholder?: string;
		required?: boolean;
		disabled?: boolean;
		id?: string;
		name?: string;
		class?: string;
		fieldClass?: string;
		/**
		 * Typed with its own element, the way Svelte types a native handler — so a
		 * call site can still read `e.currentTarget.value` without a cast.
		 */
		onchange?: (event: Event & { currentTarget: HTMLSelectElement }) => void;
		children?: Snippet;
		[key: string]: unknown;
	} = $props();
</script>

<Field {label} {help} {error} {required} {id} class={fieldClass}>
	{#snippet children({ id: controlId, describedBy, invalid })}
		<select
			id={controlId}
			class="sak-input sak-input-select {className}"
			bind:value
			{name}
			{required}
			{disabled}
			aria-invalid={invalid ? 'true' : undefined}
			aria-describedby={describedBy}
			{onchange}
			{...rest}
		>
			{#if placeholder}
				<option value="" disabled={required}>{placeholder}</option>
			{/if}
			{#if options}
				{#each options as option (String(option.value))}
					<option value={option.value} disabled={option.disabled}>{option.label}</option>
				{/each}
			{/if}
			{@render optionSlot?.()}
		</select>
	{/snippet}
</Field>
