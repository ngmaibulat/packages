<script lang="ts">
	import Field from './Field.svelte';
	import './inputSurface.css';

	// A labelled textarea. `type` is not a prop here, so `bind:value` works
	// directly (unlike TextInput — see the note there).
	//
	// `min-height` and `resize: vertical` come from `.sak-input-textarea`.
	// Worth stating because the app this replaced styled 11 of its 21
	// textareas with its plain input class, silently losing both.

	let {
		value = $bindable(''),
		label,
		help,
		error,
		placeholder,
		rows,
		required = false,
		disabled = false,
		readonly = false,
		id,
		name,
		maxlength,
		mono = false,
		class: className = '',
		fieldClass = '',
		oninput,
		onchange,
		onkeydown,
		...rest
	}: {
		value?: string;
		label?: string;
		help?: string;
		error?: string;
		placeholder?: string;
		rows?: number;
		required?: boolean;
		disabled?: boolean;
		readonly?: boolean;
		id?: string;
		name?: string;
		maxlength?: number;
		/**
		 * Render the value in the monospace data face. For a textarea this is
		 * usually a pasted PEM block, a header dump or a list of hosts.
		 */
		mono?: boolean;
		class?: string;
		fieldClass?: string;
		/**
		 * Typed with its own element, the way Svelte types a native handler — so a
		 * call site can still read `e.currentTarget.value` without a cast.
		 */
		oninput?: (event: Event & { currentTarget: HTMLTextAreaElement }) => void;
		onchange?: (event: Event & { currentTarget: HTMLTextAreaElement }) => void;
		onkeydown?: (event: KeyboardEvent & { currentTarget: HTMLTextAreaElement }) => void;
		[key: string]: unknown;
	} = $props();
</script>

<Field {label} {help} {error} {required} {id} class={fieldClass}>
	{#snippet children({ id: controlId, describedBy, invalid })}
		<textarea
			id={controlId}
			class="sak-input sak-input-textarea {className}"
			class:sak-input-mono={mono}
			bind:value
			{name}
			{placeholder}
			{rows}
			{required}
			{disabled}
			{readonly}
			{maxlength}
			aria-invalid={invalid ? 'true' : undefined}
			aria-describedby={describedBy}
			{oninput}
			{onchange}
			{onkeydown}
			{...rest}></textarea>
	{/snippet}
</Field>
