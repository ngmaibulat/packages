import { Editor, Extension, type Range } from '@tiptap/core';
import { Suggestion, type SuggestionOptions, type SuggestionProps } from '@tiptap/suggestion';
import { emojis, type EmojiItem } from '@tiptap/extension-emoji';
import { FloatingSuggestionMenu, type SuggestionMenuItem } from './suggestionMenu.js';
import { richtextIcons, type RichtextIconName } from './icons.js';
import type { RichtextLabels } from './labels.js';

// The three suggestion popups (@ mention, : emoji, / slash commands), all
// driven by tiptap's Suggestion utility through one shared FloatingSuggestionMenu.
// Client-only — the server renderer never passes these (see extensions.ts).

// Adapts the Suggestion lifecycle callbacks to the menu. `toMenuItem` shapes a
// suggestion item for display; picking an item calls the suggestion's own
// command with it.
function menuRender<Item>(
	menu: FloatingSuggestionMenu<SuggestionMenuItem & { source: Item }>,
	toMenuItem: (item: Item, index: number) => SuggestionMenuItem
): SuggestionOptions<Item>['render'] {
	let latest: SuggestionProps<Item> | null = null;
	const shape = (items: Item[]) =>
		items.map((item, index) => ({ ...toMenuItem(item, index), source: item }));
	return () => ({
		onStart: (props) => {
			latest = props;
			// props.editor.view.dom is the contenteditable itself — the menu walks
			// up from it to find an open <dialog> host. See suggestionMenu.ts's
			// header for why the mount point matters.
			menu.open(
				shape(props.items),
				props.clientRect?.() ?? null,
				(picked) => latest?.command(picked.source),
				props.editor.view.dom
			);
		},
		onUpdate: (props) => {
			latest = props;
			menu.update(shape(props.items), props.clientRect?.() ?? null);
		},
		onKeyDown: ({ event }) => menu.handleKeyDown(event),
		onExit: () => menu.close()
	});
}

export interface MentionCandidate {
	id: string;
	name: string;
	/**
	 * Which directory `id` belongs to — see MENTION_ROUTE_BASE in extensions.ts.
	 * Optional, and omitting it means 'engineer', so a caller that only has
	 * engineers to offer needs no change.
	 */
	kind?: string;
}

// getCandidates is a closure (not a snapshot) so the list follows the
// component's reactive mentionCandidates prop.
export function buildMentionSuggestion(
	getCandidates: () => MentionCandidate[],
	labels: RichtextLabels
): Omit<SuggestionOptions<MentionCandidate>, 'editor'> {
	const menu = new FloatingSuggestionMenu<SuggestionMenuItem & { source: MentionCandidate }>(
		labels.noResults
	);
	return {
		char: '@',
		items: ({ query }) => {
			const q = query.toLowerCase();
			return getCandidates()
				.filter((c) => c.name.toLowerCase().includes(q))
				.slice(0, 8);
		},
		command: ({ editor, range, props }) => {
			editor
				.chain()
				.focus()
				.insertContentAt(range, [
					{
						type: 'mention',
						attrs: { id: props.id, label: props.name, kind: props.kind ?? 'engineer' }
					},
					{ type: 'text', text: ' ' }
				])
				.run();
		},
		render: menuRender(menu, (c) => ({ key: c.id, label: c.name, adornment: '@' }))
	};
}

export function buildEmojiSuggestion(
	labels: RichtextLabels
): Omit<SuggestionOptions<EmojiItem>, 'editor'> {
	const menu = new FloatingSuggestionMenu<SuggestionMenuItem & { source: EmojiItem }>(
		labels.noResults
	);
	return {
		char: ':',
		items: ({ query }) => {
			const q = query.toLowerCase();
			if (q.length < 2) return [];
			return emojis
				.filter(
					(e) => e.shortcodes.some((s) => s.includes(q)) || e.tags.some((tag) => tag.includes(q))
				)
				.slice(0, 8);
		},
		command: ({ editor, range, props }) => {
			editor.chain().focus().deleteRange(range).setEmoji(props.shortcodes[0]).run();
		},
		render: menuRender(menu, (e) => ({
			key: e.name,
			label: e.shortcodes[0] ?? e.name,
			adornment: e.emoji ?? ''
		}))
	};
}

export interface SlashCommandItem {
	key: string;
	label: string;
	/** Name in `richtextIcons` — the same drawing the toolbar uses. */
	icon: RichtextIconName;
	run: (editor: Editor, range: Range) => void;
}

export interface SlashActions {
	/** Ask the user for a link URL (the component owns the prompt UI). */
	promptLink: () => string | null;
	/** Open the image file picker (no-op when uploads are disabled). */
	pickImage: () => void;
}

export function buildSlashItems(labels: RichtextLabels, actions: SlashActions): SlashCommandItem[] {
	// Mirrors monacoSetup.ts's SLASH_COMMANDS (/table /code /quote /checklist
	// /list /link /hr) plus the rich-only blocks.
	return [
		{
			key: 'table',
			label: labels.table,
			icon: 'table',
			run: (editor, range) =>
				editor
					.chain()
					.focus()
					.deleteRange(range)
					.insertTable({ rows: 3, cols: 3, withHeaderRow: true })
					.run()
		},
		{
			key: 'code',
			label: labels.codeBlock,
			icon: 'codeBlock',
			run: (editor, range) => editor.chain().focus().deleteRange(range).toggleCodeBlock().run()
		},
		{
			key: 'quote',
			label: labels.blockquote,
			icon: 'blockquote',
			run: (editor, range) => editor.chain().focus().deleteRange(range).toggleBlockquote().run()
		},
		{
			key: 'checklist',
			label: labels.taskList,
			icon: 'taskList',
			run: (editor, range) => editor.chain().focus().deleteRange(range).toggleTaskList().run()
		},
		{
			key: 'list',
			label: labels.bulletList,
			icon: 'bulletList',
			run: (editor, range) => editor.chain().focus().deleteRange(range).toggleBulletList().run()
		},
		{
			key: 'orderedList',
			label: labels.orderedList,
			icon: 'orderedList',
			run: (editor, range) => editor.chain().focus().deleteRange(range).toggleOrderedList().run()
		},
		{
			key: 'link',
			label: labels.link,
			icon: 'link',
			run: (editor, range) => {
				const url = actions.promptLink();
				editor.chain().focus().deleteRange(range).run();
				if (url) editor.chain().focus().setLink({ href: url }).run();
			}
		},
		{
			key: 'hr',
			label: labels.horizontalRule,
			icon: 'horizontalRule',
			run: (editor, range) => editor.chain().focus().deleteRange(range).setHorizontalRule().run()
		},
		{
			key: 'callout',
			label: labels.callout,
			icon: 'callout',
			run: (editor, range) =>
				editor.chain().focus().deleteRange(range).setCallout({ kind: 'info' }).run()
		},
		{
			key: 'details',
			label: labels.details,
			icon: 'details',
			run: (editor, range) => editor.chain().focus().deleteRange(range).setDetails().run()
		},
		{
			key: 'image',
			label: labels.image,
			icon: 'image',
			run: (editor, range) => {
				editor.chain().focus().deleteRange(range).run();
				actions.pickImage();
			}
		}
	];
}

export function buildSlashExtension(labels: RichtextLabels, actions: SlashActions): Extension {
	const allItems = buildSlashItems(labels, actions);
	const menu = new FloatingSuggestionMenu<SuggestionMenuItem & { source: SlashCommandItem }>(
		labels.noResults
	);
	return Extension.create({
		name: 'slashCommands',
		addProseMirrorPlugins() {
			return [
				Suggestion<SlashCommandItem>({
					editor: this.editor,
					char: '/',
					items: ({ query }) => {
						const q = query.toLowerCase();
						return allItems.filter(
							(item) => item.key.startsWith(q) || item.label.toLowerCase().includes(q)
						);
					},
					command: ({ editor, range, props }) => props.run(editor, range),
					render: menuRender(menu, (item) => ({
						key: item.key,
						label: item.label,
						adornmentSvg: richtextIcons[item.icon]
					}))
				})
			];
		}
	});
}
