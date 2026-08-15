<script module lang="ts">
	// Formats a byte count for display. Exported because a call site that wants
	// to say "max 32 MB" in its own help text should use the same wording the
	// rejection message will use.
	export function formatBytes(bytes: number): string {
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
		if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
		return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
	}

	// Does `file` satisfy an `accept` attribute? The browser enforces `accept`
	// in its own file picker but NOT on drop, so a dropzone that skips this
	// check silently accepts anything.
	//
	// Handles the three forms `accept` can take — ".ext", "type/subtype" and
	// "type/*" — and treats an empty accept as "anything".
	export function fileMatchesAccept(file: File, accept: string | undefined): boolean {
		if (!accept) return true;
		const name = file.name.toLowerCase();
		const mime = file.type.toLowerCase();
		return accept
			.split(',')
			.map((entry) => entry.trim().toLowerCase())
			.filter(Boolean)
			.some((entry) => {
				if (entry.startsWith('.')) return name.endsWith(entry);
				if (entry.endsWith('/*')) return mime.startsWith(entry.slice(0, -1));
				return mime === entry;
			});
	}
</script>

<script lang="ts">
	import Field from './Field.svelte';
	import Button from './Button.svelte';

	// The upload control: click to browse, or drag a file onto it.
	//
	// Every string is a prop — this package carries no translator (see the
	// README). The consuming app wraps it and supplies localized labels.
	//
	// WHY THE CLIENT-SIDE SIZE CHECK MATTERS: a body larger than the server's
	// limit does not come back as a clean 413. Under adapter-node an oversized
	// multipart body fails as a *malformed upload*, so the user sees a parse
	// error that never names the real cause. Refusing it here, before the
	// request exists, is the only place the message can be honest.
	//
	// The drag counter is not decoration: `dragleave` fires when the pointer
	// crosses onto a CHILD element, so tracking a boolean makes the highlight
	// flicker. Counting enter/leave pairs is the standard fix.

	let {
		file = $bindable<File | null>(null),
		label,
		help,
		error = '',
		accept,
		maxBytes,
		multiple = false,
		files = $bindable<File[]>([]),
		disabled = false,
		busy = false,
		busyLabel,
		promptLabel,
		browseLabel,
		clearLabel,
		tooLargeLabel,
		wrongTypeLabel,
		id,
		class: className = '',
		onselect,
		onclear
	}: {
		file?: File | null;
		label?: string;
		help?: string;
		error?: string;
		accept?: string;
		maxBytes?: number;
		multiple?: boolean;
		files?: File[];
		disabled?: boolean;
		busy?: boolean;
		/** Shown in place of the prompt while `busy`. */
		busyLabel?: string;
		/** e.g. "Drag a file here, or" */
		promptLabel?: string;
		/** e.g. "choose a file" */
		browseLabel?: string;
		clearLabel?: string;
		/** Receives the formatted limit, e.g. (max) => `File is larger than ${max}` */
		tooLargeLabel?: (max: string) => string;
		wrongTypeLabel?: string;
		id?: string;
		class?: string;
		onselect?: (file: File | null) => void;
		onclear?: () => void;
	} = $props();

	let input = $state<HTMLInputElement | null>(null);
	let dragDepth = $state(0);
	let localError = $state('');

	const dragging = $derived(dragDepth > 0);
	const inert = $derived(disabled || busy);
	const shownError = $derived(error || localError);
	const selected = $derived(multiple ? files : file ? [file] : []);

	function reject(message: string) {
		localError = message;
		// Clear the picker so re-choosing the SAME file fires `change` again —
		// without this, correcting a rejected pick requires choosing something
		// else first.
		if (input) input.value = '';
	}

	function validate(candidate: File): boolean {
		if (!fileMatchesAccept(candidate, accept)) {
			reject(wrongTypeLabel ?? 'Unsupported file type.');
			return false;
		}
		if (maxBytes !== undefined && candidate.size > maxBytes) {
			const max = formatBytes(maxBytes);
			reject(tooLargeLabel ? tooLargeLabel(max) : `File is larger than ${max}.`);
			return false;
		}
		return true;
	}

	function accepted(list: FileList | null | undefined) {
		localError = '';
		const incoming = Array.from(list ?? []);
		if (incoming.length === 0) return;

		const valid = incoming.filter(validate);
		if (valid.length === 0) return;

		if (multiple) {
			files = valid;
			file = valid[0] ?? null;
		} else {
			file = valid[0] ?? null;
			files = file ? [file] : [];
		}
		onselect?.(file);
	}

	function onPicked(event: Event) {
		accepted((event.currentTarget as HTMLInputElement).files);
	}

	function clear() {
		file = null;
		files = [];
		localError = '';
		if (input) input.value = '';
		onclear?.();
		onselect?.(null);
	}

	function onDragEnter(event: DragEvent) {
		if (inert) return;
		// Only react to an actual file drag — dragging selected text across the
		// page would otherwise light the zone up.
		if (!event.dataTransfer?.types.includes('Files')) return;
		event.preventDefault();
		dragDepth += 1;
	}

	function onDragOver(event: DragEvent) {
		if (inert) return;
		if (!event.dataTransfer?.types.includes('Files')) return;
		// Without preventDefault the browser navigates to the dropped file.
		event.preventDefault();
		event.dataTransfer.dropEffect = 'copy';
	}

	function onDragLeave() {
		if (dragDepth > 0) dragDepth -= 1;
	}

	function onDrop(event: DragEvent) {
		if (inert) return;
		event.preventDefault();
		dragDepth = 0;
		accepted(event.dataTransfer?.files);
	}
</script>

<Field {label} {help} error={shownError} {id} class={className}>
	{#snippet children({ id: controlId, describedBy, invalid })}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="sak-drop"
			class:sak-drop-active={dragging}
			class:sak-drop-disabled={inert}
			class:sak-drop-invalid={invalid}
			ondragenter={onDragEnter}
			ondragover={onDragOver}
			ondragleave={onDragLeave}
			ondrop={onDrop}
		>
			<!-- The real input stays in the DOM and focusable; it is visually
			     hidden rather than `display: none` so it remains reachable by
			     keyboard and its label click-target keeps working. -->
			<input
				bind:this={input}
				id={controlId}
				type="file"
				class="sak-drop-input"
				{accept}
				{multiple}
				disabled={inert}
				aria-describedby={describedBy}
				aria-invalid={invalid ? 'true' : undefined}
				onchange={onPicked}
			/>

			{#if busy}
				<span class="sak-drop-text">{busyLabel ?? 'Uploading…'}</span>
			{:else if selected.length > 0}
				<ul class="sak-drop-files">
					{#each selected as picked (picked.name + picked.size + picked.lastModified)}
						<li>
							<span class="sak-drop-name">{picked.name}</span>
							<span class="sak-drop-size">{formatBytes(picked.size)}</span>
						</li>
					{/each}
				</ul>
			{:else}
				<span class="sak-drop-text">
					{promptLabel ?? 'Drag a file here, or'}
					<label class="sak-drop-browse" for={controlId}>{browseLabel ?? 'choose a file'}</label>
				</span>
			{/if}

			{#if selected.length > 0 && !busy}
				<Button variant="ghost" size="xs" onclick={clear} disabled={inert}>
					{clearLabel ?? 'Clear'}
				</Button>
			{/if}
		</div>
	{/snippet}
</Field>

<style>
	.sak-drop {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--sak-gap, 0.5rem);
		flex-wrap: wrap;
		border: 1px dashed var(--sak-dropzone-border, #cbd5e1);
		border-radius: var(--sak-radius-md, 0.75rem);
		background: var(--sak-dropzone-bg, #f8fafc);
		padding: var(--sak-pad-x-md, 1rem);
		font-size: var(--sak-font-size-md, 0.875rem);
		color: var(--sak-text-muted, #475569);
		transition:
			border-color 120ms ease,
			background-color 120ms ease;
	}

	.sak-drop-active {
		border-color: var(--sak-dropzone-border-active, #2563eb);
		border-style: solid;
		background: var(--sak-dropzone-bg-active, #eff6ff);
	}

	.sak-drop-invalid {
		border-color: var(--sak-input-border-invalid, #dc2626);
	}

	.sak-drop-disabled {
		opacity: var(--sak-disabled-opacity, 0.55);
	}

	/* Visually hidden, still focusable — `display: none` or `visibility:
	   hidden` would take it out of the tab order. */
	.sak-drop-input {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
		border: 0;
	}

	/* The <label> is the click target, so the focus ring has to be drawn for
	   the input's focus state — a keyboard user tabs to the input, not the
	   label, and would otherwise see nothing at all. */
	.sak-drop-input:focus-visible + .sak-drop-text .sak-drop-browse,
	.sak-drop-input:focus-visible ~ .sak-drop-text .sak-drop-browse {
		outline: var(--sak-focus-ring-width, 2px) solid var(--sak-focus-ring, #94a3b8);
		outline-offset: var(--sak-focus-ring-offset, 2px);
		border-radius: 0.25rem;
	}

	.sak-drop-text {
		min-width: 0;
	}

	.sak-drop-browse {
		color: var(--sak-link-text, #2563eb);
		font-weight: 600;
		cursor: pointer;
		text-decoration: underline;
	}

	.sak-drop-browse:hover {
		color: var(--sak-link-text-hover, #1d4ed8);
	}

	.sak-drop-disabled .sak-drop-browse {
		cursor: not-allowed;
	}

	.sak-drop-files {
		list-style: none;
		margin: 0;
		padding: 0;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
	}

	.sak-drop-files li {
		display: flex;
		align-items: baseline;
		gap: var(--sak-gap, 0.5rem);
		min-width: 0;
	}

	.sak-drop-name {
		font-weight: 600;
		color: var(--sak-foreground, #020617);
		overflow-wrap: anywhere;
	}

	.sak-drop-size {
		flex: none;
		font-size: var(--sak-font-size-xs, 0.75rem);
		color: var(--sak-text-subtle, #64748b);
	}

	@media (prefers-reduced-motion: reduce) {
		.sak-drop {
			transition: none;
		}
	}
</style>
