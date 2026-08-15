<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { Editor } from '@tiptap/core';
	import type { EditorView } from '@tiptap/pm/view';
	import { buildRichtextExtensions } from './extensions.js';
	import {
		buildEmojiSuggestion,
		buildMentionSuggestion,
		buildSlashExtension
	} from './suggestions.js';
	import { resolveRichtextLabels, type RichtextLabels } from './labels.js';
	import { richtextIcons, type RichtextIconName } from './icons.js';
	import Icon from '../icon/Icon.svelte';
	import Button from '../controls/Button.svelte';
	import './richtext.css';

	let {
		value,
		dark = false,
		onChange,
		mentionCandidates,
		placeholder,
		uploadImage,
		labels
	}: {
		/** Stringified tiptap JSON ('' ⇒ empty document). */
		value: string;
		dark?: boolean;
		onChange: (json: string) => void;
		mentionCandidates?: { id: string; name: string; kind?: string }[];
		placeholder?: string;
		/** Absent ⇒ image paste/drop/picker is disabled (S3 not configured). */
		uploadImage?: (file: File) => Promise<{ id: string; url: string }>;
		labels?: Partial<RichtextLabels>;
	} = $props();

	const L = $derived(resolveRichtextLabels(labels));

	let container: HTMLDivElement;
	let fileInput: HTMLInputElement | undefined = $state();
	let editor: Editor | undefined = $state();
	// Bumped on every transaction so toolbar active-states re-derive.
	let tick = $state(0);
	let uploadError = $state<string | null>(null);
	// Deliberately the initial value only — this is the echo guard the value
	// $effect below compares against, not a reactive mirror.
	// svelte-ignore state_referenced_locally
	let lastEmitted = value;

	function parseContent(json: string): object {
		if (!json) return { type: 'doc', content: [{ type: 'paragraph' }] };
		try {
			const parsed = JSON.parse(json);
			if (parsed && typeof parsed === 'object' && parsed.type === 'doc') return parsed;
		} catch {
			// Not JSON (caller handed us markdown or plain text by mistake):
			// show it as literal text rather than losing it.
		}
		return {
			type: 'doc',
			content: json.split('\n').map((line) => ({
				type: 'paragraph',
				content: line ? [{ type: 'text', text: line }] : []
			}))
		};
	}

	// --- image upload flow -------------------------------------------------

	function swapImageSrc(tempUrl: string, attrs: Record<string, unknown> | null): void {
		if (!editor) return;
		const { state, view } = editor;
		const tr = state.tr;
		let found = false;
		state.doc.descendants((node, pos) => {
			if (node.type.name === 'image' && node.attrs.src === tempUrl) {
				found = true;
				if (attrs) tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...attrs });
				else tr.delete(pos, pos + node.nodeSize);
				return false;
			}
			return true;
		});
		if (found) view.dispatch(tr);
	}

	function startImageUpload(file: File): void {
		if (!editor || !uploadImage) return;
		uploadError = null;
		const tempUrl = URL.createObjectURL(file);
		editor
			.chain()
			.focus()
			.insertContent({ type: 'image', attrs: { src: tempUrl, uploading: true } })
			.run();
		uploadImage(file)
			.then(({ url }) => swapImageSrc(tempUrl, { src: url, uploading: false }))
			.catch(() => {
				swapImageSrc(tempUrl, null);
				uploadError = L.imageUploadFailed;
			})
			.finally(() => URL.revokeObjectURL(tempUrl));
	}

	function takeImageFiles(list: FileList | undefined | null): File[] {
		return Array.from(list ?? []).filter((f) => f.type.startsWith('image/'));
	}

	function handlePaste(_view: EditorView, event: ClipboardEvent): boolean {
		const images = takeImageFiles(event.clipboardData?.files);
		if (images.length === 0) return false;
		if (!uploadImage) {
			uploadError = L.imageUploadDisabled;
			return true; // swallow: never paste a data-URL/file into the doc
		}
		event.preventDefault();
		images.forEach(startImageUpload);
		return true;
	}

	function handleDrop(
		_view: EditorView,
		event: DragEvent,
		_slice: unknown,
		moved: boolean
	): boolean {
		if (moved) return false;
		const images = takeImageFiles(event.dataTransfer?.files);
		if (images.length === 0) return false;
		if (!uploadImage) {
			uploadError = L.imageUploadDisabled;
			return true;
		}
		event.preventDefault();
		images.forEach(startImageUpload);
		return true;
	}

	function onFilePicked(event: Event): void {
		const input = event.currentTarget as HTMLInputElement;
		takeImageFiles(input.files).forEach(startImageUpload);
		input.value = '';
	}

	// --- editor lifecycle --------------------------------------------------

	onMount(() => {
		editor = new Editor({
			element: container,
			extensions: [
				...buildRichtextExtensions({
					placeholder: placeholder ?? L.slashHint,
					mentionSuggestion: buildMentionSuggestion(() => mentionCandidates ?? [], L),
					emojiSuggestion: buildEmojiSuggestion(L)
				}),
				buildSlashExtension(L, {
					promptLink: () => window.prompt(L.linkPrompt),
					pickImage: () => {
						if (uploadImage) fileInput?.click();
						else uploadError = L.imageUploadDisabled;
					}
				})
			],
			content: parseContent(value),
			editorProps: { handlePaste, handleDrop },
			onUpdate: ({ editor: current }) => {
				lastEmitted = JSON.stringify(current.getJSON());
				onChange(lastEmitted);
			},
			onTransaction: () => {
				tick += 1;
			}
		});
	});

	onDestroy(() => {
		editor?.destroy();
		editor = undefined;
	});

	// External value updates (draft restored, form reset) — guarded against the
	// editor's own onUpdate echo, same feedback-loop pattern as MarkdownEditor.
	$effect(() => {
		if (editor && value !== lastEmitted) {
			lastEmitted = value;
			editor.commands.setContent(parseContent(value));
		}
	});

	export function focus(): void {
		editor?.commands.focus();
	}

	// --- toolbar -----------------------------------------------------------

	/* The hue an action's icon carries at all times. Assigned per ACTION, not per
	   group: `codeBlock` sits in the blocks group but is code-coloured, because
	   the point of the colour is to name the thing the button makes, not where it
	   happens to sit in the row. richtext.css turns each one into a `color` rule;
	   the pressed state then tints itself from `currentColor`, so a tone needs no
	   second entry anywhere. */
	type ToolbarTone = 'mark' | 'heading' | 'list' | 'code' | 'block' | 'insert' | 'history';

	type ToolbarButton = {
		key: string;
		title: string;
		icon: RichtextIconName;
		tone: ToolbarTone;
		isActive?: () => boolean;
		isDisabled?: () => boolean;
		run: () => void;
	};

	const toolbarGroups = $derived.by((): ToolbarButton[][] => {
		void tick; // re-derive active states on every transaction
		const e = editor;
		if (!e) return [];
		const chain = () => e.chain().focus();
		return [
			[
				{
					key: 'bold',
					title: L.bold,
					icon: 'bold',
					tone: 'mark',
					isActive: () => e.isActive('bold'),
					run: () => chain().toggleBold().run()
				},
				{
					key: 'italic',
					title: L.italic,
					icon: 'italic',
					tone: 'mark',
					isActive: () => e.isActive('italic'),
					run: () => chain().toggleItalic().run()
				},
				{
					key: 'strike',
					title: L.strike,
					icon: 'strike',
					tone: 'mark',
					isActive: () => e.isActive('strike'),
					run: () => chain().toggleStrike().run()
				},
				{
					key: 'code',
					title: L.inlineCode,
					icon: 'inlineCode',
					tone: 'code',
					isActive: () => e.isActive('code'),
					run: () => chain().toggleCode().run()
				}
			],
			[1, 2, 3].map((level) => ({
				key: `h${level}`,
				title: L[`heading${level}` as 'heading1'],
				icon: `heading${level}` as RichtextIconName,
				tone: 'heading' as const,
				isActive: () => e.isActive('heading', { level }),
				run: () =>
					chain()
						.toggleHeading({ level: level as 1 | 2 | 3 })
						.run()
			})),
			[
				{
					key: 'bulletList',
					title: L.bulletList,
					icon: 'bulletList',
					tone: 'list',
					isActive: () => e.isActive('bulletList'),
					run: () => chain().toggleBulletList().run()
				},
				{
					key: 'orderedList',
					title: L.orderedList,
					icon: 'orderedList',
					tone: 'list',
					isActive: () => e.isActive('orderedList'),
					run: () => chain().toggleOrderedList().run()
				},
				{
					key: 'taskList',
					title: L.taskList,
					icon: 'taskList',
					tone: 'list',
					isActive: () => e.isActive('taskList'),
					run: () => chain().toggleTaskList().run()
				}
			],
			[
				{
					key: 'blockquote',
					title: L.blockquote,
					icon: 'blockquote',
					tone: 'block',
					isActive: () => e.isActive('blockquote'),
					run: () => chain().toggleBlockquote().run()
				},
				{
					key: 'codeBlock',
					title: L.codeBlock,
					icon: 'codeBlock',
					tone: 'code',
					isActive: () => e.isActive('codeBlock'),
					run: () => chain().toggleCodeBlock().run()
				},
				{
					key: 'table',
					title: L.table,
					icon: 'table',
					tone: 'block',
					isActive: () => e.isActive('table'),
					run: () => chain().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
				}
			],
			[
				{
					key: 'link',
					title: L.link,
					icon: 'link',
					tone: 'insert',
					isActive: () => e.isActive('link'),
					run: () => {
						if (e.isActive('link')) {
							chain().unsetLink().run();
							return;
						}
						const url = window.prompt(L.linkPrompt);
						if (url) chain().setLink({ href: url }).run();
					}
				},
				{
					key: 'image',
					title: L.image,
					icon: 'image',
					tone: 'insert',
					isDisabled: () => !uploadImage,
					run: () => fileInput?.click()
				},
				{
					key: 'callout',
					title: L.callout,
					icon: 'callout',
					tone: 'block',
					isActive: () => e.isActive('callout'),
					run: () =>
						e.isActive('callout')
							? chain().unsetCallout().run()
							: chain().setCallout({ kind: 'info' }).run()
				},
				{
					key: 'details',
					title: L.details,
					icon: 'details',
					tone: 'block',
					isActive: () => e.isActive('details'),
					run: () =>
						e.isActive('details') ? chain().unsetDetails().run() : chain().setDetails().run()
				},
				{
					key: 'hr',
					title: L.horizontalRule,
					icon: 'horizontalRule',
					tone: 'block',
					run: () => chain().setHorizontalRule().run()
				}
			],
			[
				{
					key: 'undo',
					title: L.undo,
					icon: 'undo',
					tone: 'history',
					isDisabled: () => !e.can().undo(),
					run: () => chain().undo().run()
				},
				{
					key: 'redo',
					title: L.redo,
					icon: 'redo',
					tone: 'history',
					isDisabled: () => !e.can().redo(),
					run: () => chain().redo().run()
				}
			]
		];
	});
</script>

<div class="rt-editor" class:rt-dark={dark}>
	<div class="rt-toolbar" role="toolbar">
		{#each toolbarGroups as group, gi (gi)}
			{#if gi > 0}<span class="rt-tb-sep"></span>{/if}
			{#each group as button (button.key)}
				{@const active = button.isActive?.() ?? false}
				<Button
					variant="ghost"
					size="sm"
					shape="square"
					class="rt-tb-tone-{button.tone}{active ? ' rt-tb-active' : ''}"
					disabled={button.isDisabled?.() ?? false}
					title={button.title}
					ariaLabel={button.title}
					ariaPressed={button.isActive ? active : undefined}
					onclick={button.run}
				>
					<Icon name={button.icon} registry={richtextIcons} />
				</Button>
			{/each}
		{/each}
	</div>
	<div class="rt-content" bind:this={container}></div>
	{#if uploadError}
		<div class="rt-upload-error" role="alert">{uploadError}</div>
	{/if}
	<input
		type="file"
		accept="image/png,image/jpeg,image/gif,image/webp"
		multiple
		class="rt-hidden-input"
		bind:this={fileInput}
		onchange={onFilePicked}
	/>
</div>
