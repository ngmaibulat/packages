// Svelte entry for the tiptap editor — a SEPARATE subpath
// (@aibulat/svelte-admin-kit/richtext-editor) from both ./editor (Monaco;
// the two editors must never co-load) and ./richtext (the framework-agnostic
// kit, importable server-side). Consumers dynamic-import this in onMount,
// same as the Monaco editors.
export { default as RichTextEditor } from './RichTextEditor.svelte';
export {
	RICHTEXT_LABEL_DEFAULTS,
	resolveRichtextLabels,
	type RichtextLabelKey,
	type RichtextLabels
} from './labels.js';
