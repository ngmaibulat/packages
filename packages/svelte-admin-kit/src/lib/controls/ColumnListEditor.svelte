<script module lang="ts">
	export type ColumnDraft = { id: number; name: string };

	// Ids are synthetic and local to the editor — they exist only to key the
	// `{#each}`. Keying by name instead would tear down and rebuild the input
	// on every keystroke, so a rename would lose focus after one character.
	let nextId = 0;

	/** Wrap plain names as drafts. Call this when seeding the editor. */
	export function toColumnDrafts(names: string[]): ColumnDraft[] {
		return names.map((name) => ({ id: nextId++, name }));
	}
</script>

<script lang="ts">
	import Button from './Button.svelte';
	import ReorderControls from './ReorderControls.svelte';
	import './inputSurface.css';

	// Declare the columns of a table: add, rename in place, reorder, remove,
	// and mark exactly one as the designated ("index"/"key") column.
	//
	// The editor owns the fiddly part — keeping the designated column pointing
	// at the right row as rows move around it — because that is precisely what
	// a call site gets wrong. Everything domain-specific (what the columns are
	// for, what makes them valid, when they are locked and why) stays with the
	// caller.
	//
	// The designated column is tracked BY POSITION, not by name, so renaming
	// the designated column keeps it designated. That is a deliberate choice
	// carried over from the screen this replaces.

	let {
		columns = $bindable<ColumnDraft[]>([]),
		designatedIndex = $bindable(-1),
		designatable = true,
		locked = false,
		lockedReason,
		error,
		invalidIndexes = [],
		max,
		maxNameLength,
		label,
		designatedLabel,
		namePlaceholder,
		addLabel,
		removeLabel,
		upLabel,
		downLabel,
		emptyLabel,
		radioGroupName,
		class: className = ''
	}: {
		columns?: ColumnDraft[];
		designatedIndex?: number;
		/** false renders a plain ordered list with no "designated row" radio. */
		designatable?: boolean;
		locked?: boolean;
		lockedReason?: string;
		/** List-level validation message (e.g. from the caller's own rules). */
		error?: string;
		/** Rows to mark invalid — the caller decides what invalid means. */
		invalidIndexes?: number[];
		max?: number;
		maxNameLength?: number;
		label?: string;
		designatedLabel?: string;
		namePlaceholder?: string;
		addLabel: string;
		removeLabel: string;
		upLabel: string;
		downLabel: string;
		emptyLabel?: string;
		/** Must be unique per editor instance if two are on one page. */
		radioGroupName?: string;
		class?: string;
	} = $props();

	const uid = $props.id();
	const groupName = $derived(radioGroupName ?? `${uid}-designated`);
	const atMax = $derived(max !== undefined && columns.length >= max);
	const invalid = $derived(new Set(invalidIndexes));

	function add() {
		if (locked || atMax) return;
		columns = [...columns, { id: nextId++, name: '' }];
		// A list that had no designated column adopts the first one added,
		// otherwise the caller is handed a list with no key at all.
		if (designatable && designatedIndex < 0) designatedIndex = columns.length - 1;
	}

	function remove(index: number) {
		if (locked) return;
		columns = columns.filter((_, i) => i !== index);
		if (!designatable) return;
		if (designatedIndex === index) {
			// The designation has to land somewhere: the list's new first row,
			// or nowhere if the list is now empty.
			designatedIndex = columns.length > 0 ? 0 : -1;
		} else if (designatedIndex > index) {
			designatedIndex -= 1;
		}
	}

	function move(index: number, direction: -1 | 1) {
		if (locked) return;
		const target = index + direction;
		if (target < 0 || target >= columns.length) return;
		const next = [...columns];
		[next[index], next[target]] = [next[target], next[index]];
		columns = next;
		if (!designatable) return;
		// Follow the designated row through the swap — whichever side it was on.
		if (designatedIndex === index) designatedIndex = target;
		else if (designatedIndex === target) designatedIndex = index;
	}
</script>

<div class="sak-cols {className}">
	{#if label}<span class="sak-cols-label">{label}</span>{/if}

	{#if columns.length === 0 && emptyLabel}
		<p class="sak-cols-empty">{emptyLabel}</p>
	{/if}

	<ul class="sak-cols-list">
		{#each columns as column, i (column.id)}
			<li
				class="sak-cols-row"
				class:sak-cols-row-designated={designatable && designatedIndex === i}
			>
				{#if designatable}
					<label class="sak-cols-radio">
						<input
							type="radio"
							name={groupName}
							checked={designatedIndex === i}
							disabled={locked}
							onchange={() => (designatedIndex = i)}
						/>
						<span>{designatedLabel ?? 'index'}</span>
					</label>
				{/if}

				<input
					class="sak-input sak-cols-name"
					bind:value={column.name}
					placeholder={namePlaceholder}
					maxlength={maxNameLength}
					disabled={locked}
					aria-invalid={invalid.has(i) ? 'true' : undefined}
					aria-label={namePlaceholder}
				/>

				<ReorderControls
					index={i}
					count={columns.length}
					disabled={locked}
					{upLabel}
					{downLabel}
					onmove={(direction) => move(i, direction)}
				/>

				<Button
					variant="danger"
					size="xs"
					iconOnly
					disabled={locked}
					title={removeLabel}
					ariaLabel={removeLabel}
					onclick={() => remove(i)}
				>
					<svg viewBox="0 0 24 24" aria-hidden="true" class="sak-cols-glyph">
						<path
							d="M6 6l12 12M18 6L6 18"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
						/>
					</svg>
				</Button>
			</li>
		{/each}
	</ul>

	<div class="sak-cols-foot">
		<Button variant="secondary" size="sm" disabled={locked || atMax} onclick={add}>
			{addLabel}
		</Button>
		{#if locked && lockedReason}
			<p class="sak-cols-locked">{lockedReason}</p>
		{/if}
	</div>

	{#if error}
		<p class="sak-cols-error" role="alert">{error}</p>
	{/if}
</div>

<style>
	.sak-cols {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		min-width: 0;
	}

	.sak-cols-label {
		font-size: var(--sak-font-size-md, 0.875rem);
		font-weight: 600;
		color: var(--sak-text-muted, #475569);
	}

	.sak-cols-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
	}

	/* The row is a grid, not a flex line: the name field must take all the
	   slack while the radio and the button cluster keep their intrinsic width,
	   so columns of different name lengths still line up down the list. */
	.sak-cols-row {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) auto auto;
		align-items: center;
		gap: var(--sak-gap, 0.5rem);
		border: 1px solid transparent;
		border-radius: var(--sak-radius-sm, 0.5rem);
		padding: 0.25rem;
	}

	/* The designated row is tinted rather than merely radio-checked — in a list
	   of eight columns the checked dot alone is easy to lose. */
	.sak-cols-row-designated {
		background: var(--sak-selected-bg, #dbeafe);
	}

	.sak-cols-radio {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		font-size: var(--sak-font-size-xs, 0.75rem);
		font-weight: 600;
		color: var(--sak-text-muted, #475569);
		cursor: pointer;
		white-space: nowrap;
	}

	.sak-cols-row-designated .sak-cols-radio {
		color: var(--sak-selected-text, #1e40af);
	}

	.sak-cols-radio input {
		margin: 0;
		cursor: pointer;
	}

	.sak-cols-name {
		width: 100%;
		font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
		font-size: var(--sak-font-size-sm, 0.8125rem);
		padding-block: var(--sak-pad-y-sm, 0.375rem);
	}

	.sak-cols-glyph {
		width: 0.875em;
		height: 0.875em;
	}

	.sak-cols-foot {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.75rem;
	}

	.sak-cols-empty {
		margin: 0;
		font-size: var(--sak-font-size-md, 0.875rem);
		color: var(--sak-text-subtle, #64748b);
	}

	.sak-cols-locked {
		margin: 0;
		font-size: var(--sak-font-size-xs, 0.75rem);
		color: var(--sak-text-subtle, #64748b);
	}

	.sak-cols-error {
		margin: 0;
		font-size: var(--sak-font-size-xs, 0.75rem);
		font-weight: 600;
		color: var(--sak-invalid-text, #b91c1c);
	}

	@media (max-width: 40rem) {
		/* Below ~640px four columns do not fit; the name takes its own row. */
		.sak-cols-row {
			grid-template-columns: auto 1fr auto;
		}
		.sak-cols-name {
			grid-column: 1 / -1;
			grid-row: 2;
		}
	}
</style>
