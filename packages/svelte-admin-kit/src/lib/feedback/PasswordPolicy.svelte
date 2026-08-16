<script module lang="ts">
	export type PasswordRule = { label: string; ok: boolean };
</script>

<script lang="ts">
	// The live requirement checklist under a password field.
	//
	// WHY IT EXISTS. A password rule stated in a sentence is read after being
	// rejected. The same rule as a checklist that ticks while the user types is
	// something they satisfy on the first attempt.
	//
	// It does NOT own the decision. Whatever accepts the form is still what
	// accepts or rejects the password, and this is a hint about a rule that lives
	// there. `rules` is passed in for exactly that reason: the caller keeps the
	// mapping next to the field it belongs to, and no copy of the policy is made
	// here to drift out of step with the real one.

	let {
		rules = [],
		countLabel,
		variant = 'app',
		class: className = ''
	}: {
		rules?: PasswordRule[];
		/** e.g. `(met, total) => \`${met} of ${total} met\`` */
		countLabel?: (met: number, total: number) => string;
		variant?: 'app' | 'auth';
		class?: string;
	} = $props();

	const met = $derived(rules.filter((rule) => rule.ok).length);
</script>

<div class="sak-policy {className}" data-variant={variant}>
	{#if countLabel}
		<p class="sak-policy-count" aria-live="polite">{countLabel(met, rules.length)}</p>
	{/if}
	<ul class="sak-policy-list">
		{#each rules as rule (rule.label)}
			<li class="sak-policy-row" data-ok={rule.ok ? 'true' : 'false'}>
				<span class="sak-policy-mark" aria-hidden="true"></span>
				<span class="sak-policy-text">{rule.label}</span>
			</li>
		{/each}
	</ul>
</div>

<style>
	.sak-policy {
		--policy-line: var(--sak-border, #e2e8f0);
		--policy-muted: var(--sak-text-subtle, #64748b);
		--policy-text: var(--sak-foreground, #020617);
		--policy-ok: var(--sak-success-bg, #15803d);

		border: 1px solid var(--policy-line);
		border-radius: var(--sak-radius-md, 0.75rem);
		padding: 0.6rem 0.75rem;
	}

	/* On a dark auth panel the accent is the panel's own blue rather than a
	   success green, because green on that surface reads as a status badge
	   rather than as a satisfied rule. */
	.sak-policy[data-variant='auth'] {
		--policy-line: var(--sak-auth-card-line, #e2e8f0);
		--policy-muted: var(--sak-auth-card-muted, #64748b);
		--policy-text: var(--sak-auth-card-text, #0f172a);
		--policy-ok: var(--sak-auth-accent, #3b82f6);
	}

	.sak-policy-count {
		margin: 0 0 0.35rem;
		font-family: var(--sak-font-mono, ui-monospace, monospace);
		font-size: var(--sak-font-size-2xs, 0.6875rem);
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--policy-muted);
	}

	.sak-policy-list {
		margin: 0;
		padding: 0;
		list-style: none;
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}

	.sak-policy-row {
		display: flex;
		align-items: center;
		gap: var(--sak-gap, 0.5rem);
		font-size: var(--sak-font-size-xs, 0.75rem);
		color: var(--policy-muted);
	}

	.sak-policy-row[data-ok='true'] {
		color: var(--policy-text);
	}

	/*
	 * SHAPE CARRIES THE STATE, not only colour: unmet is a hollow ring, met is a
	 * filled disc with a check drawn into it. So the checklist still reads in
	 * greyscale, at a glance, and for the ~8% of men with a colour vision
	 * deficiency — for whom a green/grey pair is the worst possible encoding.
	 */
	.sak-policy-mark {
		flex: 0 0 auto;
		position: relative;
		width: 0.85rem;
		height: 0.85rem;
		border-radius: 9999px;
		border: 1.5px solid currentColor;
		opacity: 0.45;
	}

	.sak-policy-row[data-ok='true'] .sak-policy-mark {
		border-color: var(--policy-ok);
		background: var(--policy-ok);
		opacity: 1;
	}

	.sak-policy-row[data-ok='true'] .sak-policy-mark::after {
		content: '';
		position: absolute;
		inset: 0;
		margin: auto;
		width: 0.2rem;
		height: 0.4rem;
		transform: translateY(-1px) rotate(45deg);
		border: solid var(--sak-policy-check, #ffffff);
		border-width: 0 1.5px 1.5px 0;
	}

	.sak-policy-text {
		min-width: 0;
	}
</style>
