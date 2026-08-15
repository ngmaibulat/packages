<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { ensureMonacoConfigured, monaco, setMentionCandidates } from './monacoSetup';

	let {
		value,
		dark = false,
		onChange,
		mentionCandidates
	}: {
		value: string;
		dark?: boolean;
		onChange: (v: string) => void;
		mentionCandidates?: { id: string; name: string; kind?: string }[];
	} = $props();

	let container: HTMLDivElement;
	let editor: monaco.editor.IStandaloneCodeEditor | undefined;

	// Smart list continuation on Enter — monaco-editor's bundled 'markdown'
	// language is just a tokenizer/grammar (unlike full VSCode, which gets this
	// from its markdown-language-features extension), so there's no built-in
	// support for it; both regexes share the same group layout (1=indent,
	// ...,5=text after the marker) so the emptiness/indent checks below can stay
	// generic across bullet vs. ordered lists.
	const BULLET_RE = /^(\s*)([-*+])(\s+)(\[[ xX]\]\s+)?(.*)$/;
	const ORDERED_RE = /^(\s*)(\d+)([.)])(\s+)(.*)$/;

	function continueList(ed: monaco.editor.IStandaloneCodeEditor, e: monaco.IKeyboardEvent) {
		if (e.keyCode !== monaco.KeyCode.Enter) return;
		const model = ed.getModel();
		const position = ed.getPosition();
		if (!model || !position) return;

		const lineContent = model.getLineContent(position.lineNumber);
		const bulletMatch = lineContent.match(BULLET_RE);
		const orderedMatch = bulletMatch ? null : lineContent.match(ORDERED_RE);
		const match = bulletMatch ?? orderedMatch;
		if (!match) return;

		e.preventDefault();
		e.stopPropagation();

		if (match[5].trim() === '') {
			// Enter on an empty list item exits the list instead of piling on
			// another empty bullet, mirroring GitHub/typical editor behavior.
			const indent = match[1];
			ed.executeEdits('markdown-list', [
				{
					range: new monaco.Range(
						position.lineNumber,
						1,
						position.lineNumber,
						lineContent.length + 1
					),
					text: indent
				}
			]);
			ed.setPosition({ lineNumber: position.lineNumber, column: indent.length + 1 });
			return;
		}

		// A fresh, unchecked checkbox on continuation (not carrying over the
		// previous item's checked state) — same as GitHub's task-list editing.
		const prefix = bulletMatch
			? bulletMatch[1] + bulletMatch[2] + ' ' + (bulletMatch[4] ? '[ ] ' : '')
			: `${orderedMatch![1]}${Number(orderedMatch![2]) + 1}${orderedMatch![3]} `;

		ed.executeEdits('markdown-list', [
			{
				range: new monaco.Range(
					position.lineNumber,
					position.column,
					position.lineNumber,
					position.column
				),
				text: `\n${prefix}`
			}
		]);
		ed.setPosition({ lineNumber: position.lineNumber + 1, column: prefix.length + 1 });
	}

	// Exposed for bind:this callers — inserts `text` on its own line(s) at
	// the current cursor position and leaves the cursor on the line right
	// after it. A deterministic executeEdits() call, the same technique
	// continueList above already uses.
	export function insertAtCursor(text: string) {
		if (!editor) return;
		const model = editor.getModel();
		const position = editor.getPosition();
		if (!model || !position) return;

		const currentLine = model.getLineContent(position.lineNumber);
		const needsLeadingNewline = currentLine.trim().length > 0;
		const insertText = `${needsLeadingNewline ? '\n' : ''}${text}\n`;

		editor.executeEdits('insert-snippet', [
			{
				range: new monaco.Range(
					position.lineNumber,
					position.column,
					position.lineNumber,
					position.column
				),
				text: insertText
			}
		]);

		const newlineCount = (insertText.match(/\n/g) ?? []).length;
		editor.setPosition({ lineNumber: position.lineNumber + newlineCount, column: 1 });
		editor.focus();
	}

	onMount(() => {
		ensureMonacoConfigured();
		editor = monaco.editor.create(container, {
			value,
			language: 'markdown',
			theme: dark ? 'vs-dark' : 'vs',
			minimap: { enabled: false },
			fontSize: 13,
			wordWrap: 'on',
			automaticLayout: true,
			lineNumbersMinChars: 3,
			// Monaco's default reserves scrollable empty space below the last line
			// (so the last line can be scrolled up to the top, as in a full source
			// file) — that reads as unwanted bottom padding in a short comment/
			// description box, so it's turned off here.
			scrollBeyondLastLine: false
		});
		editor.onDidChangeModelContent(() => onChange(editor?.getValue() ?? ''));
		editor.onKeyDown((e) => continueList(editor!, e));
	});

	onDestroy(() => {
		editor?.dispose();
	});

	$effect(() => {
		const model = editor?.getModel();
		if (model && model.getValue() !== value) model.setValue(value);
	});

	$effect(() => {
		monaco.editor.setTheme(dark ? 'vs-dark' : 'vs');
	});

	$effect(() => {
		setMentionCandidates(mentionCandidates ?? []);
	});
</script>

<div bind:this={container} style="height: 100%"></div>
