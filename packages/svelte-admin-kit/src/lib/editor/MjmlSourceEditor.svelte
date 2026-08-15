<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { ensureMonacoConfigured, monaco } from './monacoSetup';

	// Writable MJML source editor. MJML tags are XML-like custom elements
	// (<mjml>, <mj-body>, <mj-text>, ...) — Monaco ships no dedicated MJML
	// grammar, so 'xml' is the closest built-in approximation. Simpler than
	// MarkdownEditor.svelte: no list continuation, no @mention/slash
	// completions — those are markdown-only.
	let {
		value,
		dark = false,
		onChange
	}: {
		value: string;
		dark?: boolean;
		onChange: (v: string) => void;
	} = $props();

	let container: HTMLDivElement;
	let editor: monaco.editor.IStandaloneCodeEditor | undefined;

	onMount(() => {
		ensureMonacoConfigured();
		editor = monaco.editor.create(container, {
			value,
			language: 'xml',
			theme: dark ? 'vs-dark' : 'vs',
			minimap: { enabled: false },
			fontSize: 13,
			wordWrap: 'on',
			automaticLayout: true,
			lineNumbersMinChars: 3,
			scrollBeyondLastLine: false
		});
		editor.onDidChangeModelContent(() => onChange(editor?.getValue() ?? ''));
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
</script>

<div bind:this={container} style="height: 100%"></div>
