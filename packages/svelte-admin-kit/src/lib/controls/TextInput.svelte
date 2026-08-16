<script lang="ts">
	import type { HTMLInputAttributes } from 'svelte/elements';
	import Field from './Field.svelte';
	import './inputSurface.css';

	// A labelled text input. `label` is optional so the same component serves
	// both the standard labelled field and the bare input that sits in a filter
	// row or a table cell.
	//
	// WHY NOT `bind:value` INTERNALLY: Svelte refuses a dynamic `type` on an
	// input that uses two-way binding ("'type' attribute must be a static text
	// value"). Since `type` is a prop here, the binding is written out by hand
	// — one-way `value` plus an input handler that assigns back to the
	// $bindable prop. Call sites still write `bind:value` as usual.
	//
	// The number case is the reason this is not a one-liner: `valueAsNumber` is
	// NaN for an empty field and for a half-typed "-", and writing NaN back
	// would wipe what the user is typing. An empty field reports '' and an
	// unparseable one keeps the previous value.

	let {
		value = $bindable(''),
		label,
		help,
		error,
		type = 'text',
		placeholder,
		required = false,
		disabled = false,
		readonly = false,
		autocomplete,
		id,
		name,
		min,
		max,
		step,
		maxlength,
		inputmode,
		mono = false,
		class: className = '',
		fieldClass = '',
		oninput,
		onchange,
		onkeydown,
		...rest
	}: {
		value?: string | number;
		label?: string;
		help?: string;
		error?: string;
		type?: 'text' | 'email' | 'password' | 'number' | 'date' | 'time' | 'search' | 'tel' | 'url';
		placeholder?: string;
		required?: boolean;
		disabled?: boolean;
		readonly?: boolean;
		autocomplete?: HTMLInputAttributes['autocomplete'];
		id?: string;
		name?: string;
		min?: string | number;
		max?: string | number;
		step?: string | number;
		maxlength?: number;
		inputmode?: HTMLInputAttributes['inputmode'];
		/**
		 * Render the value in the monospace data face. For values a reader
		 * compares rather than reads — ids, hosts, CIDRs, key prefixes.
		 */
		mono?: boolean;
		class?: string;
		fieldClass?: string;
		/**
		 * Typed with its own element, the way Svelte types a native handler — so a
		 * call site can still read `e.currentTarget.value` without a cast.
		 */
		oninput?: (event: Event & { currentTarget: HTMLInputElement }) => void;
		onchange?: (event: Event & { currentTarget: HTMLInputElement }) => void;
		onkeydown?: (event: KeyboardEvent & { currentTarget: HTMLInputElement }) => void;
		[key: string]: unknown;
	} = $props();

	function handleInput(event: Event) {
		const el = event.currentTarget as HTMLInputElement;
		if (type === 'number') {
			if (el.value === '') value = '';
			else if (!Number.isNaN(el.valueAsNumber)) value = el.valueAsNumber;
		} else {
			value = el.value;
		}
		oninput?.(event as Event & { currentTarget: HTMLInputElement });
	}
</script>

<Field {label} {help} {error} {required} {id} class={fieldClass}>
	{#snippet children({ id: controlId, describedBy, invalid })}
		<input
			id={controlId}
			{type}
			class="sak-input {className}"
			class:sak-input-mono={mono}
			{value}
			{name}
			{placeholder}
			{required}
			{disabled}
			{readonly}
			{autocomplete}
			{min}
			{max}
			{step}
			{maxlength}
			{inputmode}
			aria-invalid={invalid ? 'true' : undefined}
			aria-describedby={describedBy}
			oninput={handleInput}
			{onchange}
			{onkeydown}
			{...rest}
		/>
	{/snippet}
</Field>
