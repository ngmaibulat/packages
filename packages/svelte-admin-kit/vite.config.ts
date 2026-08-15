import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [svelte({ compilerOptions: { runes: true } })],
	test: {
		environment: 'node',
		// Vitest stubs CSS modules to an empty string by default, which also
		// empties `?raw` imports of them — and themeTokens.test.ts reads the
		// stylesheets as text.
		css: true,
		expect: { requireAssertions: true }
	}
});
