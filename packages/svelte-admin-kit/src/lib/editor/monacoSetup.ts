// Shared bootstrap for every Monaco instance a consumer creates via this
// package's MarkdownEditor/MjmlSourceEditor. Components import `monaco-editor`
// directly and mount/dispose an editor instance themselves rather than going
// through a framework wrapper.
//
// SSR WARNING: this module does `import * as monaco from 'monaco-editor'` at
// module scope, which breaks server-side rendering if evaluated on the
// server. It is only safe because every consumer is expected to reach this
// module exclusively via a dynamic `import()` inside `onMount` (or an
// equivalent client-only lifecycle hook) — never at module scope in a
// server-rendered route/page. See this package's README for the recommended
// dynamic-import pattern.
//
// Vite's `?worker` import is the standard way to give Monaco a web worker
// without a bundler plugin (webpack/Turbopack resolve `new URL(...,
// import.meta.url)` against monaco's own worker file directly; Vite needs
// the explicit suffix instead) — this package assumes a Vite-based
// consumer build; see the README's "Important: this package assumes a
// Vite-based build" section.
import * as monaco from 'monaco-editor';
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import { formatMarkdownTables } from './formatMarkdownTables';

// Idempotent — safe to call from every consuming component's mount.
let configured = false;

// @mention candidates for the completion provider below. Module-level, not
// per-editor: Monaco has no notion of "this provider only applies to this
// editor instance" — a provider is registered once per language for the
// whole app. MarkdownEditor.svelte syncs this from its optional
// mentionCandidates prop whenever it changes; a markdown editor that never
// passes that prop leaves the list empty, so the provider naturally offers
// no suggestions there.
//
// The corollary, which callers must honor: LAST WRITER WINS. Two markdown
// editors alive on the same page (since FR-81 a description editor and a
// comment editor can be) share this one list, so they must be given the same
// candidates — otherwise whichever mounted last silently decides what the
// other one offers.
let mentionCandidates: MentionCandidate[] = [];

/** `kind` is optional and defaults to 'engineer' — see MENTION_ROUTE_BASE. */
export type MentionCandidate = { id: string; name: string; kind?: string };

export function setMentionCandidates(candidates: MentionCandidate[]) {
	mentionCandidates = candidates;
}

// The markdown token the completion inserts. An engineer is written as a bare
// uuid, byte-identical to every mention stored before FR-81; only the newer
// kinds carry a prefix (see MENTION_TOKEN_PATTERN in @siem/core's
// sanitizeMarkdown.ts, which parses both).
function mentionInsertText(candidate: MentionCandidate): string {
	const prefix = !candidate.kind || candidate.kind === 'engineer' ? '' : `${candidate.kind}:`;
	return `@[${candidate.name}](${prefix}${candidate.id})`;
}

// "/" quick-formatting commands. Unlike @mentions these carry no per-page
// data, so the list is a static constant and the provider below is
// registered unconditionally — it's live in every Monaco 'markdown' editor
// created via this package. Snippet bodies use Monaco's "${n:placeholder}"
// tabstop syntax (InsertAsSnippet below) so e.g. inserting a table drops the
// cursor in the first header cell and Tab moves through the rest.
type SlashCommand = { command: string; label: string; insertText: string };

const SLASH_COMMANDS: SlashCommand[] = [
	{
		command: 'table',
		label: '/table — Table',
		insertText: '| ${1:Header 1} | ${2:Header 2} |\n| --- | --- |\n| ${3:Cell 1} | ${4:Cell 2} |\n'
	},
	{
		command: 'code',
		label: '/code — Code block',
		insertText: '```${1:language}\n${2:code}\n```\n'
	},
	{ command: 'quote', label: '/quote — Quote', insertText: '> ${1:quote}' },
	{ command: 'checklist', label: '/checklist — Checklist item', insertText: '- [ ] ${1:task}' },
	{ command: 'list', label: '/list — Bullet list item', insertText: '- ${1:item}' },
	{ command: 'link', label: '/link — Link', insertText: '[${1:text}](${2:url})' },
	{ command: 'hr', label: '/hr — Horizontal rule', insertText: '---' }
];

// Only fires when '/' is the first non-whitespace character on the line —
// so it doesn't hijack an ordinary slash inside a URL, a date ("07/09"), or
// "and/or" typed mid-sentence.
const SLASH_TRIGGER_RE = /^(\s*)\/(\w*)$/;

export function ensureMonacoConfigured() {
	if (configured || typeof window === 'undefined') return;
	configured = true;
	(window as unknown as { MonacoEnvironment?: unknown }).MonacoEnvironment = {
		getWorker() {
			return new EditorWorker();
		}
	};

	// @mention autocomplete for the 'markdown' language — see
	// mentionCandidates above. Returns `incomplete: true` unconditionally so
	// Monaco re-invokes this provider on every subsequent keystroke instead
	// of client-side-refiltering a stale suggestion list against its own
	// word-boundary heuristics — mentionable names may contain spaces, which
	// Monaco's default "current word" detection would otherwise cut the
	// query short at.
	monaco.languages.registerCompletionItemProvider('markdown', {
		triggerCharacters: ['@'],
		provideCompletionItems(model, position) {
			if (mentionCandidates.length === 0) return { suggestions: [], incomplete: true };

			const lineUpToCursor = model
				.getLineContent(position.lineNumber)
				.slice(0, position.column - 1);
			const at = lineUpToCursor.lastIndexOf('@');
			if (at === -1) return { suggestions: [], incomplete: true };

			const query = lineUpToCursor.slice(at + 1);
			// A second '@' or a too-long run means the user has moved on from
			// this trigger without picking anything — stop suggesting.
			if (query.includes('@') || query.length > 60) return { suggestions: [], incomplete: true };

			const needle = query.toLowerCase();
			const matches = mentionCandidates.filter((e) => e.name.toLowerCase().includes(needle));
			if (matches.length === 0) return { suggestions: [], incomplete: true };

			const range = new monaco.Range(
				position.lineNumber,
				at + 1,
				position.lineNumber,
				position.column
			);

			return {
				incomplete: true,
				suggestions: matches.map((e) => ({
					label: e.name,
					kind: monaco.languages.CompletionItemKind.User,
					insertText: mentionInsertText(e),
					filterText: `@${e.name}`,
					range
				}))
			};
		}
	});

	monaco.languages.registerCompletionItemProvider('markdown', {
		triggerCharacters: ['/'],
		provideCompletionItems(model, position) {
			const lineUpToCursor = model
				.getLineContent(position.lineNumber)
				.slice(0, position.column - 1);

			const match = SLASH_TRIGGER_RE.exec(lineUpToCursor);
			if (!match) return { suggestions: [], incomplete: true };

			const [, indent, query] = match;
			const needle = query.toLowerCase();
			const matches = SLASH_COMMANDS.filter((c) => c.command.startsWith(needle));
			if (matches.length === 0) return { suggestions: [], incomplete: true };

			const range = new monaco.Range(
				position.lineNumber,
				indent.length + 1,
				position.lineNumber,
				position.column
			);

			return {
				incomplete: true,
				suggestions: matches.map((c) => ({
					label: c.label,
					kind: monaco.languages.CompletionItemKind.Snippet,
					insertText: c.insertText,
					insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
					filterText: `/${c.command}`,
					range
				}))
			};
		}
	});

	// Table-alignment formatting (formatMarkdownTables) — registering this
	// hooks it into Monaco's own built-in "Format Document" action/keybinding
	// (Shift+Alt+F) for free.
	monaco.languages.registerDocumentFormattingEditProvider('markdown', {
		provideDocumentFormattingEdits(model) {
			const original = model.getValue();
			const formatted = formatMarkdownTables(original);
			if (formatted === original) return [];
			return [{ range: model.getFullModelRange(), text: formatted }];
		}
	});
}

export { monaco };
