<script module lang="ts">
	export type StepperStep = { label: string };
</script>

<script lang="ts">
	// A progress rail: uppercase mono chips joined by gradient separators,
	// tri-state via a data attribute.
	//
	// DELIBERATELY STATIC. Nothing here animates: this reports where somebody is
	// in a real sequence, and motion on it would read as progress happening
	// rather than as a position.
	//
	// `variant` picks which token family the chips read, so one component serves
	// both an ordinary admin surface and a dark auth panel without a second copy.
	// `app` is the default because that is the surface a kit consumer is more
	// likely to be on; `auth` reads the `--sak-auth-*` family, which an app that
	// has a sign-in console re-points and everybody else can ignore.

	let {
		steps = [],
		current = 0,
		variant = 'app',
		class: className = ''
	}: {
		steps?: StepperStep[];
		/** Index of the step in progress. Everything before it reads as done. */
		current?: number;
		variant?: 'app' | 'auth';
		class?: string;
	} = $props();

	function stateOf(index: number) {
		if (index < current) return 'done';
		if (index === current) return 'current';
		return 'todo';
	}
</script>

<ol class="sak-steps {className}" data-variant={variant}>
	{#each steps as step, index (step.label)}
		{#if index > 0}
			<li class="sak-step-sep" aria-hidden="true"></li>
		{/if}
		<li
			class="sak-step"
			data-state={stateOf(index)}
			aria-current={index === current ? 'step' : undefined}
		>
			<span class="sak-step-dot" aria-hidden="true"></span>
			{step.label}
		</li>
	{/each}
</ol>

<style>
	/* One ruleset, two skins. The variants differ only in what these seven local
	   properties resolve to, so every rule below is written once. */
	.sak-steps {
		--step-line: var(--sak-border, #e2e8f0);
		--step-chip-bg: var(--sak-surface-strong, #f1f5f9);
		--step-dim: var(--sak-text-subtle, #64748b);
		--step-dot: var(--sak-border-strong, #cbd5e1);
		--step-on: var(--sak-foreground, #020617);
		--step-accent: var(--sak-primary-bg, #0f172a);
		--step-glow: var(--sak-primary-bg, #0f172a);

		display: flex;
		align-items: center;
		gap: var(--sak-gap, 0.5rem);
		flex-wrap: wrap;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.sak-steps[data-variant='auth'] {
		--step-line: var(--sak-auth-line, rgba(148, 170, 214, 0.16));
		--step-chip-bg: var(--sak-auth-chip-bg, rgba(91, 114, 153, 0.12));
		--step-dim: var(--sak-auth-dim, #9fb3d9);
		--step-dot: var(--sak-auth-dot, #5b7299);
		--step-on: var(--sak-auth-on, #eaf0fb);
		--step-accent: var(--sak-auth-accent, #3b82f6);
		--step-glow: var(--sak-auth-glow, #60a5fa);
	}

	.sak-step {
		display: flex;
		align-items: center;
		gap: var(--sak-gap, 0.5rem);
		flex: 0 0 auto;
		border-radius: 0.85rem;
		border: 1px solid var(--step-line);
		background: var(--step-chip-bg);
		padding: 0.6rem 0.8rem;
		font-family: var(--sak-font-mono, ui-monospace, monospace);
		font-size: 0.7rem;
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--step-dim);
		white-space: nowrap;
	}

	.sak-step-dot {
		width: 0.55rem;
		height: 0.55rem;
		border-radius: 9999px;
		background: var(--step-dot);
	}

	.sak-step[data-state='done'] .sak-step-dot {
		background: var(--step-dim);
	}

	.sak-step[data-state='current'] {
		border-color: color-mix(in srgb, var(--step-accent) 55%, transparent);
		background: color-mix(in srgb, var(--step-accent) 16%, transparent);
		color: var(--step-on);
		box-shadow:
			0 0 0 1px color-mix(in srgb, var(--step-accent) 25%, transparent),
			0 12px 30px -16px var(--step-accent);
	}

	.sak-step[data-state='current'] .sak-step-dot {
		background: var(--step-accent);
		box-shadow: 0 0 0.5rem 0 var(--step-glow);
	}

	.sak-step[data-state='todo'] {
		opacity: 0.6;
	}

	.sak-step-sep {
		flex: 1 1 0;
		min-width: 1rem;
		height: 2px;
		border-radius: 9999px;
		background: linear-gradient(90deg, var(--step-dot), var(--step-accent));
		opacity: 0.45;
	}

	@media (max-width: 48rem) {
		.sak-steps {
			flex-direction: column;
			align-items: stretch;
		}

		.sak-step-sep {
			/* `flex-basis: 0` would set the COLUMN main size once the axis rotates,
			   collapsing the height to nothing and losing the separator entirely.
			   It has to become a fixed-height item instead. */
			flex: 0 0 auto;
			width: 2px;
			min-width: 0;
			height: 1.1rem;
			margin-inline-start: 0.75rem;
			background: linear-gradient(180deg, var(--step-dot), var(--step-accent));
		}
	}
</style>
