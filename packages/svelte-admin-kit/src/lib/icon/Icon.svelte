<script module lang="ts">
	import { defaultIcons } from './icons';
	import type { IconRegistry } from './icons';
</script>

<script lang="ts">
	// Lightweight inline SVG icon (stroke-based, inherits `currentColor` by
	// default). `name` is looked up in `registry` (defaulting to
	// `defaultIcons`) — an unknown name renders an empty (but still
	// correctly-sized) <svg> rather than throwing, so a caller mid-migration
	// between icon sets never crashes the page over a missing entry.
	let {
		name,
		class: className = '',
		registry = defaultIcons,
		size,
		strokeWidth,
		color
	}: {
		name: string;
		class?: string;
		registry?: IconRegistry;
		size?: string | number;
		strokeWidth?: number;
		color?: string;
	} = $props();

	const path = $derived(registry[name] ?? '');
	const resolvedSize = $derived(
		size === undefined ? undefined : typeof size === 'number' ? `${size}px` : size
	);
</script>

<svg
	style:width={resolvedSize ?? 'var(--sak-icon-size, 1rem)'}
	style:height={resolvedSize ?? 'var(--sak-icon-size, 1rem)'}
	style:stroke-width={strokeWidth ?? 'var(--sak-icon-stroke-width, 2)'}
	style:color
	viewBox="0 0 24 24"
	fill="none"
	stroke="currentColor"
	stroke-linecap="round"
	stroke-linejoin="round"
	aria-hidden="true"
	class={className}
>
	<!-- eslint-disable-next-line svelte/no-at-html-tags -->
	{@html path}
</svg>
