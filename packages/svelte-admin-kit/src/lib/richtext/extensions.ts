import type { AnyExtension } from '@tiptap/core';
import { mergeAttributes } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { TableKit } from '@tiptap/extension-table';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import { Details, DetailsContent, DetailsSummary } from '@tiptap/extension-details';
import { Emoji, shortcodeToEmoji } from '@tiptap/extension-emoji';
import Mention from '@tiptap/extension-mention';
import { Placeholder } from '@tiptap/extensions';
import type { SuggestionOptions } from '@tiptap/suggestion';
import { Callout } from './callout.js';
import { ResizableImage } from './resizableImage.js';

// The ONE extension list shared by the client editor (RichTextEditor.svelte)
// and the server renderer (@siem/core's renderRichTextSafe via @tiptap/html) —
// both sides must agree on the schema or a document saved by one can't be
// rendered by the other. Suggestion popups (mention/emoji) are client-only
// concerns: generateHTML only reads the schema (renderHTML), never activates
// ProseMirror plugins, so the server simply omits those options.

// Every node/mark type a stored document may contain — the validation
// allowlist used by @siem/core's parseRichTextDoc. Update BOTH lists when
// adding an extension.
export const RICHTEXT_NODE_TYPES = [
	'doc',
	'paragraph',
	'text',
	'hardBreak',
	'heading',
	'blockquote',
	'codeBlock',
	'horizontalRule',
	'bulletList',
	'orderedList',
	'listItem',
	'taskList',
	'taskItem',
	'table',
	'tableRow',
	'tableCell',
	'tableHeader',
	'details',
	'detailsSummary',
	'detailsContent',
	'emoji',
	'callout',
	'image',
	'mention'
] as const;

export const RICHTEXT_MARK_TYPES = [
	'bold',
	'italic',
	'strike',
	'underline',
	'code',
	'link'
] as const;

// Exact same pill markup the markdown renderer emits for "@[Name](id)"
// (packages/core/src/sanitizeMarkdown.ts's mentionExtension) — the two
// content formats must be visually indistinguishable where they meet (comment
// threads mixing legacy markdown and new rich-text entries).
export const MENTION_PILL_CLASS =
	'rounded-full bg-indigo-100 px-1.5 py-0.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:hover:bg-indigo-900';

// Which directory a mention's id belongs to, and therefore which profile route
// the pill links to. A plain string union rather than anything domain-shaped:
// this package must stay app-agnostic, and the two route bases below are the
// same hardcoded-app-path exception sanitizeMarkdown.ts already carries.
export const MENTION_ROUTE_BASE: Record<string, string> = {
	engineer: '/engineers',
	user: '/users'
};

/** Absent/unknown kind means engineer — every mention stored before FR-81. */
function mentionHref(kind: unknown, id: string): string {
	const base = MENTION_ROUTE_BASE[String(kind)] ?? MENTION_ROUTE_BASE.engineer;
	return `${base}/${encodeURIComponent(id)}`;
}

// Mention with pill rendering + round-trippable parseHTML. The node keeps
// tiptap's standard { id, label } attrs and adds `kind`, which decides the
// profile route. `kind` defaults to 'engineer' rather than being required, so
// a document written before FR-81 — where the attr simply doesn't exist —
// keeps rendering exactly as it did, with no migration over stored content.
const PillMention = Mention.extend({
	addAttributes() {
		return {
			...this.parent?.(),
			kind: {
				default: 'engineer',
				parseHTML: (element: HTMLElement) => element.getAttribute('data-kind') ?? 'engineer',
				renderHTML: (attributes: Record<string, unknown>) => ({
					'data-kind': String(attributes.kind ?? 'engineer')
				})
			}
		};
	},
	parseHTML() {
		return [{ tag: 'a[data-type="mention"]' }];
	},
	renderHTML({ node, HTMLAttributes }) {
		const id = String(node.attrs.id ?? '');
		const label = String(node.attrs.label ?? '');
		return [
			'a',
			mergeAttributes(HTMLAttributes, {
				'data-type': 'mention',
				'data-id': id,
				'data-label': label,
				'data-kind': String(node.attrs.kind ?? 'engineer'),
				href: mentionHref(node.attrs.kind, id),
				class: MENTION_PILL_CLASS
			}),
			`@${label}`
		];
	},
	renderText({ node }) {
		return `@${String(node.attrs.label ?? node.attrs.id ?? '')}`;
	}
});

// Emoji that always renders the plain unicode character. The stock extension
// falls back to a jsdelivr CDN <img> whenever it can't prove native emoji
// support — which is "always" during server-side rendering (happy-dom has no
// canvas), and an external CDN is a non-starter for air-gapped deployments
// anyway. Every target browser renders unicode emoji natively.
const PlainEmoji = Emoji.extend({
	renderHTML({ node, HTMLAttributes }) {
		const name = String(node.attrs.name ?? '');
		const item = shortcodeToEmoji(name, this.options.emojis);
		return [
			'span',
			mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
				'data-type': 'emoji',
				'data-name': name
			}),
			item?.emoji ?? `:${name}:`
		];
	}
});

export interface RichtextKitOptions {
	/** Editor placeholder text (client-only; inert for server rendering). */
	placeholder?: string;
	/** Client-only @-mention suggestion wiring (omit on the server). */
	mentionSuggestion?: Omit<SuggestionOptions, 'editor'>;
	/** Client-only :emoji: suggestion wiring (omit on the server). */
	emojiSuggestion?: Omit<SuggestionOptions, 'editor'>;
}

export function buildRichtextExtensions(options: RichtextKitOptions = {}): AnyExtension[] {
	const extensions: AnyExtension[] = [
		StarterKit.configure({
			// The editor never navigates on link click; rendered read-only views
			// (renderRichTextSafe output) are plain anchors and navigate normally.
			link: { openOnClick: false }
		}),
		TableKit.configure({ table: { resizable: false } }),
		TaskList,
		TaskItem.configure({ nested: true }),
		Details,
		DetailsSummary,
		DetailsContent,
		Callout,
		ResizableImage,
		options.emojiSuggestion
			? PlainEmoji.configure({ enableEmoticons: false, suggestion: options.emojiSuggestion })
			: PlainEmoji.configure({ enableEmoticons: false }),
		options.mentionSuggestion
			? PillMention.configure({ suggestion: options.mentionSuggestion })
			: PillMention
	];

	if (options.placeholder) {
		extensions.push(Placeholder.configure({ placeholder: options.placeholder }));
	}

	return extensions;
}
