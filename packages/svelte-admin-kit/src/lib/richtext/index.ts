// Framework-agnostic rich-text kit (no Svelte imports): the shared tiptap
// extension list + node/mark allowlists, consumed by both the client editor
// (see ./RichTextEditor.svelte, exported via the separate ./richtext-editor
// subpath so Monaco and tiptap never co-load) and @siem/core's server-side
// renderRichTextSafe.
export {
	buildRichtextExtensions,
	RICHTEXT_NODE_TYPES,
	RICHTEXT_MARK_TYPES,
	MENTION_PILL_CLASS,
	type RichtextKitOptions
} from './extensions.js';
export { Callout, CALLOUT_KINDS, type CalloutKind } from './callout.js';
export { ResizableImage } from './resizableImage.js';
