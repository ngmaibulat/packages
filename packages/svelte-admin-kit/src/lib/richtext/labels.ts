// UI strings for the rich-text editor chrome. The package stays
// translator-free (same as the rest of the kit): English defaults live here,
// and the consuming app overrides them via the `labels` prop from its own
// i18n catalogs (siem-tracker: the `richtext.*` namespace).

export const RICHTEXT_LABEL_DEFAULTS = {
	bold: 'Bold',
	italic: 'Italic',
	strike: 'Strikethrough',
	inlineCode: 'Inline code',
	heading1: 'Heading 1',
	heading2: 'Heading 2',
	heading3: 'Heading 3',
	bulletList: 'Bullet list',
	orderedList: 'Numbered list',
	taskList: 'Task list',
	blockquote: 'Quote',
	codeBlock: 'Code block',
	table: 'Table',
	link: 'Link',
	linkPrompt: 'Link URL',
	image: 'Image',
	callout: 'Callout',
	details: 'Collapsible section',
	detailsSummaryPlaceholder: 'Summary',
	horizontalRule: 'Divider',
	undo: 'Undo',
	redo: 'Redo',
	uploading: 'Uploading…',
	imageUploadFailed: 'Image upload failed',
	imageUploadDisabled: 'Image upload is not configured',
	slashHint: 'Type / for commands, @ to mention, : for emoji',
	noResults: 'No results'
} as const;

export type RichtextLabelKey = keyof typeof RICHTEXT_LABEL_DEFAULTS;
export type RichtextLabels = Record<RichtextLabelKey, string>;

export function resolveRichtextLabels(overrides?: Partial<RichtextLabels>): RichtextLabels {
	return { ...RICHTEXT_LABEL_DEFAULTS, ...overrides };
}
