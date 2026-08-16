<script lang="ts">
	import Field from './Field.svelte';
	import Button from './Button.svelte';
	import Icon from '../icon/Icon.svelte';
	import './inputSurface.css';

	// Multi-value entry as removable chips.
	//
	// This replaces a comma-separated text box, and the replacement is not
	// cosmetic. "example.com, other.example" in one input gives no feedback about
	// what was parsed, no way to see that a trailing comma produced an empty
	// entry, and no per-value validation — so a mistyped entry is only reported
	// after submitting the whole form. Here each value is committed one at a time
	// and shown back as its own chip.
	//
	// `validate` returns an error string, or '' when the draft is acceptable, and
	// it is for SHAPE ONLY. Whatever the values are eventually sent to is what
	// decides whether they are valid; duplicating its rules here is how a second
	// copy starts drifting from the one that counts.

	let {
		values = $bindable<string[]>([]),
		draft = $bindable(''),
		label,
		help,
		error,
		placeholder,
		addLabel,
		removeLabel,
		duplicateMessage = '',
		mono = false,
		disabled = false,
		validate = () => '',
		class: className = ''
	}: {
		values?: string[];
		/** The uncommitted entry. Exposed so a parent can clear or seed it. */
		draft?: string;
		label?: string;
		help?: string;
		error?: string;
		placeholder?: string;
		addLabel: string;
		/** Accessible name for one chip's remove button. */
		removeLabel: (value: string) => string;
		/** Shown when the draft repeats a value already listed. */
		duplicateMessage?: string;
		mono?: boolean;
		disabled?: boolean;
		/** Shape check on the draft. Returns an error, or '' to accept. */
		validate?: (value: string) => string;
		class?: string;
	} = $props();

	const trimmed = $derived(draft.trim());
	const draftError = $derived(trimmed ? validate(trimmed) : '');
	const duplicate = $derived(Boolean(trimmed) && values.includes(trimmed));
	const canAdd = $derived(Boolean(trimmed) && !draftError && !duplicate && !disabled);

	function add() {
		if (!canAdd) return;
		values = [...values, trimmed];
		draft = '';
	}

	function remove(value: string) {
		values = values.filter((v) => v !== value);
	}

	function onkeydown(event: KeyboardEvent) {
		// Enter adds rather than submitting the form around it. Without the
		// preventDefault, typing one value and pressing Enter submits the whole
		// form with that value still sitting uncommitted in the draft box.
		if (event.key === 'Enter') {
			event.preventDefault();
			add();
		}
	}
</script>

<Field
	{label}
	{help}
	error={error || draftError || (duplicate ? duplicateMessage : '')}
	class={className}
>
	{#snippet children({ id, describedBy, invalid })}
		<div class="sak-chips-wrap">
			{#if values.length}
				<ul class="sak-chips">
					{#each values as value (value)}
						<li class="sak-chip" class:sak-chip-mono={mono}>
							{value}
							<button
								type="button"
								class="sak-chip-x"
								aria-label={removeLabel(value)}
								{disabled}
								onclick={() => remove(value)}
							>
								<Icon name="close" size="0.7rem" />
							</button>
						</li>
					{/each}
				</ul>
			{/if}
			<div class="sak-chips-entry">
				<input
					{id}
					{placeholder}
					{disabled}
					bind:value={draft}
					{onkeydown}
					aria-describedby={describedBy}
					aria-invalid={invalid ? 'true' : undefined}
					class="sak-input"
					class:sak-input-mono={mono}
					autocomplete="off"
					spellcheck="false"
				/>
				<Button variant="secondary" disabled={!canAdd} onclick={add}>{addLabel}</Button>
			</div>
		</div>
	{/snippet}
</Field>

<style>
	.sak-chips-wrap {
		display: flex;
		flex-direction: column;
		gap: var(--sak-gap, 0.5rem);
		min-width: 0;
	}

	.sak-chips {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.sak-chip {
		display: inline-flex;
		align-items: center;
		gap: 0.15rem;
		border-radius: var(--sak-radius-pill, 9999px);
		background: var(--sak-surface-strong, #f1f5f9);
		padding: 0.15rem 0.25rem 0.15rem 0.65rem;
		font-size: var(--sak-font-size-xs, 0.75rem);
		color: var(--sak-text-muted, #475569);
	}

	.sak-chip-mono {
		font-family: var(--sak-font-mono, ui-monospace, monospace);
		font-variant-numeric: tabular-nums;
	}

	.sak-chip-x {
		position: relative;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 1.15rem;
		height: 1.15rem;
		border: 0;
		border-radius: 9999px;
		background: transparent;
		color: var(--sak-text-subtle, #64748b);
		cursor: pointer;
	}

	/*
	 * The hit area, expanded to about 44px without touching the 18px drawing.
	 *
	 * The chip is a pill sized to its text, so growing the button grows the chip,
	 * and a list of six values stops looking like values and starts looking like
	 * buttons. An overflowing ::after leaves the layout exactly where it was and
	 * moves only what the finger lands on.
	 *
	 * Not gated on `pointer: coarse`: an oversized invisible target costs a mouse
	 * user nothing here, since the chips are spaced further apart than the
	 * overflow and no other control sits underneath.
	 */
	.sak-chip-x::after {
		content: '';
		position: absolute;
		/* -0.8rem each side takes 1.15rem to 2.75rem. */
		inset: -0.8rem;
	}

	.sak-chip-x:hover:not(:disabled) {
		background: var(--sak-border-strong, #cbd5e1);
		color: var(--sak-foreground, #020617);
	}

	.sak-chip-x:disabled {
		cursor: not-allowed;
		opacity: var(--sak-disabled-opacity, 0.55);
	}

	.sak-chip-x:focus-visible {
		outline: var(--sak-focus-ring-width, 2px) solid var(--sak-focus-ring, #94a3b8);
		outline-offset: 1px;
	}

	.sak-chips-entry {
		display: flex;
		gap: var(--sak-gap, 0.5rem);
	}

	.sak-chips-entry .sak-input {
		flex: 1 1 auto;
		min-width: 0;
	}
</style>
