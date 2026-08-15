<script module lang="ts">
	export type ButtonVariant =
		'primary' | 'neutral' | 'secondary' | 'danger' | 'success' | 'warning' | 'ghost' | 'link';
	export type ButtonSize = 'xs' | 'sm' | 'md' | 'lg';
	export type ButtonAppearance = 'solid' | 'outline' | 'soft';
	export type ButtonShape = 'square' | 'circle';

	/** The variants that have a box to fill. `ghost` and `link` do not. */
	type FilledVariant = Exclude<ButtonVariant, 'ghost' | 'link'>;

	// `variant` names a COLOUR ROLE and `appearance` names the FILL. They used to
	// be one axis, which is why `danger` meant "outlined red" and `danger solid`
	// meant "filled red" while `primary` had no outlined form at all. Splitting
	// them lets any role take any fill without inventing a variant per pairing.
	//
	// Each role keeps the fill it has always been drawn with, so no existing call
	// site changes shape merely because the prop now exists:
	const DEFAULT_APPEARANCE: Record<FilledVariant, ButtonAppearance> = {
		primary: 'solid',
		neutral: 'solid',
		secondary: 'outline',
		// Outline, deliberately. The overwhelming majority of danger buttons are
		// row-level deletes in dense tables, where a filled red block is heavier
		// than the row it sits in. `appearance="solid"` is the confirmation form.
		danger: 'outline',
		success: 'solid',
		warning: 'solid'
	};

	function isFilled(variant: ButtonVariant): variant is FilledVariant {
		return variant !== 'ghost' && variant !== 'link';
	}
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';

	// The kit's single button. Everything that used to be a hand-written class
	// string lives here as a (variant, appearance, size) triple.
	//
	// `href` switches the rendered element to an <a> while keeping the styling
	// identical — several call sites are navigation dressed as a button, and
	// rendering those as a real <button> would lose middle-click, "open in new
	// tab" and the browser's own link affordances.
	//
	// NOTE ON `type`: this defaults to "button", NOT the HTML default of
	// "submit". A component whose default silently submits the nearest form is
	// a footgun at every call site that only wanted an onclick; the few real
	// submit buttons say so explicitly.
	//
	// NOTE ON SIZING: each size is a fixed HEIGHT, not a padding pair. Padding-only
	// sizing makes a control's height depend on its font metrics, which is why a
	// button and the text input beside it used to land a couple of pixels apart —
	// the kind of misalignment that reads as sloppiness without ever being
	// obviously wrong. `--sak-height-md` and `.sak-input`'s `min-height` are
	// deliberately the same value.

	let {
		variant = 'secondary',
		appearance,
		tone = 'default',
		size = 'md',
		solid = false,
		block = false,
		shape,
		loading = false,
		disabled = false,
		iconOnly = false,
		type = 'button',
		href,
		target,
		rel,
		download,
		form,
		title,
		ariaLabel,
		ariaPressed,
		class: className = '',
		onclick,
		children,
		...rest
	}: {
		variant?: ButtonVariant;
		/**
		 * Fill style, independent of colour. Omitted, each variant uses the fill
		 * it has always been drawn with (see DEFAULT_APPEARANCE). Ignored by
		 * `ghost` and `link`, which have no box to fill.
		 */
		appearance?: ButtonAppearance;
		/**
		 * Recolours a `ghost` or `link` button without giving it a box. The
		 * destructive action in a dense table row is the case this exists for —
		 * an outlined danger button there is heavier than the row itself.
		 * Ignored by the variants that already carry their own colour.
		 */
		tone?: 'default' | 'danger';
		size?: ButtonSize;
		/** @deprecated Use `appearance="solid"`. Kept so existing call sites work. */
		solid?: boolean;
		/** Full width. This is what a `class="w-full"` override was standing in for. */
		block?: boolean;
		/** Square or round icon button. `iconOnly` is the older spelling of `square`. */
		shape?: ButtonShape;
		loading?: boolean;
		disabled?: boolean;
		/** @deprecated Use `shape="square"`. */
		iconOnly?: boolean;
		type?: 'button' | 'submit' | 'reset';
		href?: string;
		target?: string;
		rel?: string;
		download?: string | boolean;
		form?: string;
		title?: string;
		ariaLabel?: string;
		ariaPressed?: boolean | 'true' | 'false';
		class?: string;
		onclick?: (event: MouseEvent) => void;
		children?: Snippet;
		[key: string]: unknown;
	} = $props();

	// A loading button is not clickable — otherwise a double-click fires the
	// same request twice, which several of the converted call sites guarded
	// against individually with their own `busy` checks.
	const isDisabled = $derived(disabled || loading);

	// `ghost`/`link` get NO fill class at all, rather than a defaulted one: the
	// fill rules also carry the disabled treatment, and a box-less button flattened
	// to a grey chip is exactly the wrong answer for it.
	const fill = $derived(
		isFilled(variant) ? (appearance ?? (solid ? 'solid' : DEFAULT_APPEARANCE[variant])) : null
	);
	const iconShape = $derived(shape ?? (iconOnly ? 'square' : undefined));

	// The fill, tone, block and shape classes are applied through `class:`
	// directives rather than composed into one string. Both spellings render the
	// same markup, but only this one is statically analysable — Svelte prunes
	// scoped selectors it cannot see a use for, and a fully computed `class={...}`
	// would take every rule below out of the bundle.
</script>

{#if href}
	<a
		{href}
		{target}
		{rel}
		{download}
		{title}
		aria-label={ariaLabel}
		aria-disabled={isDisabled ? 'true' : undefined}
		class="sak-btn sak-btn-{variant} sak-btn-{size} {className}"
		class:sak-btn-fill-solid={fill === 'solid'}
		class:sak-btn-fill-outline={fill === 'outline'}
		class:sak-btn-fill-soft={fill === 'soft'}
		class:sak-btn-tone-danger={tone === 'danger'}
		class:sak-btn-block={block}
		class:sak-btn-square={iconShape === 'square'}
		class:sak-btn-circle={iconShape === 'circle'}
		class:sak-btn-disabled={isDisabled}
		{...rest}
	>
		{@render children?.()}
	</a>
{:else}
	<button
		{type}
		{form}
		{title}
		{onclick}
		disabled={isDisabled}
		aria-label={ariaLabel}
		aria-pressed={ariaPressed}
		aria-busy={loading ? 'true' : undefined}
		class="sak-btn sak-btn-{variant} sak-btn-{size} {className}"
		class:sak-btn-fill-solid={fill === 'solid'}
		class:sak-btn-fill-outline={fill === 'outline'}
		class:sak-btn-fill-soft={fill === 'soft'}
		class:sak-btn-tone-danger={tone === 'danger'}
		class:sak-btn-block={block}
		class:sak-btn-square={iconShape === 'square'}
		class:sak-btn-circle={iconShape === 'circle'}
		{...rest}
	>
		{#if loading}
			<svg class="sak-btn-spinner" viewBox="0 0 24 24" aria-hidden="true">
				<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2.5" />
			</svg>
		{/if}
		{@render children?.()}
	</button>
{/if}

<style>
	.sak-btn {
		/*
		 * Every colour a variant needs is written into these locals, and the fill
		 * rules below read only from them. That is what makes `appearance`
		 * orthogonal to `variant`: outline and soft are one rule each, not one
		 * rule per (variant, appearance) pair.
		 *
		 * `--btn-soft` is derived rather than themed because a soft fill is
		 * always "the role's colour, mostly transparent" — asking the app to
		 * hand-pick a tint per role per theme would be eight more tokens that can
		 * only ever drift from the eight they are derived from. `danger`
		 * overrides it because the app themes that one wash explicitly.
		 */
		--btn-color: var(--sak-secondary-text, #0f172a);
		--btn-color-hover: var(--btn-color);
		--btn-on-color: #ffffff;
		--btn-soft: color-mix(in srgb, var(--btn-color) 12%, transparent);
		--btn-ring: var(--sak-focus-ring, #94a3b8);

		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: var(--sak-gap, 0.5rem);
		box-sizing: border-box;
		border: 1px solid transparent;
		border-radius: var(--sak-radius-md, 0.75rem);
		font-family: inherit;
		font-weight: 600;
		line-height: 1.25;
		text-decoration: none;
		white-space: nowrap;
		cursor: pointer;
		transition:
			background-color 120ms ease,
			border-color 120ms ease,
			color 120ms ease,
			box-shadow 120ms ease,
			transform 60ms ease;
	}

	/* One visible focus ring for every variant. `:focus-visible` rather than
	   `:focus` so a mouse click does not leave a ring behind. The ring takes the
	   variant's own colour where it has one — a single grey ring shared by eight
	   colour roles reads as an oversight rather than a system. */
	.sak-btn:focus-visible {
		outline: var(--sak-focus-ring-width, 2px) solid var(--btn-ring);
		outline-offset: var(--sak-focus-ring-offset, 2px);
	}

	.sak-btn:disabled,
	.sak-btn-disabled {
		cursor: not-allowed;
		pointer-events: none;
	}

	/* Press feedback. Without it a button is indistinguishable from a label on a
	   touch device, where there is no hover to confirm the target was hit. */
	.sak-btn:active:not(:disabled):not(.sak-btn-disabled) {
		transform: translateY(1px);
		box-shadow: none;
	}

	.sak-btn-block {
		display: flex;
		width: 100%;
	}

	/* Sizes: a fixed height plus inline padding. There is deliberately no vertical
	   padding — `align-items: center` on a fixed height centres the label at any
	   font size, and a y-padding would only fight the height. */
	.sak-btn-xs {
		height: var(--sak-height-xs, 1.75rem);
		padding-inline: var(--sak-pad-x-xs, 0.625rem);
		font-size: var(--sak-font-size-xs, 0.75rem);
	}
	.sak-btn-sm {
		height: var(--sak-height-sm, 2rem);
		padding-inline: var(--sak-pad-x-sm, 0.75rem);
		font-size: var(--sak-font-size-sm, 0.8125rem);
	}
	.sak-btn-md {
		height: var(--sak-height-md, 2.375rem);
		padding-inline: var(--sak-pad-x-md, 1rem);
		font-size: var(--sak-font-size-md, 0.875rem);
	}
	.sak-btn-lg {
		height: var(--sak-height-lg, 2.75rem);
		padding-inline: var(--sak-pad-x-lg, 1.25rem);
		font-size: var(--sak-font-size-lg, 1rem);
	}

	/* Icon buttons: squared off against their own height, so a mixed row of icon
	   and text buttons stays aligned. */
	.sak-btn-square,
	.sak-btn-circle {
		padding-inline: 0;
		aspect-ratio: 1;
	}
	.sak-btn-circle {
		border-radius: 9999px;
	}

	/* ---- Colour roles: these set the locals and nothing else. ---- */
	.sak-btn-primary {
		--btn-color: var(--sak-primary-bg, #2563eb);
		--btn-color-hover: var(--sak-primary-bg-hover, #1d4ed8);
		--btn-on-color: var(--sak-primary-text, #ffffff);
		--btn-ring: var(--sak-primary-bg, #2563eb);
	}
	.sak-btn-neutral {
		--btn-color: var(--sak-neutral-bg, #0f172a);
		--btn-color-hover: var(--sak-neutral-bg-hover, #1e293b);
		--btn-on-color: var(--sak-neutral-text, #ffffff);
		--btn-ring: var(--sak-neutral-bg, #0f172a);
	}
	.sak-btn-success {
		--btn-color: var(--sak-success-bg, #15803d);
		--btn-color-hover: var(--sak-success-bg-hover, #166534);
		--btn-on-color: var(--sak-success-text, #ffffff);
		--btn-ring: var(--sak-success-bg, #15803d);
	}
	.sak-btn-warning {
		--btn-color: var(--sak-warning-bg, #b45309);
		--btn-color-hover: var(--sak-warning-bg-hover, #92400e);
		--btn-on-color: var(--sak-warning-text, #ffffff);
		--btn-ring: var(--sak-warning-bg, #b45309);
	}
	.sak-btn-danger {
		--btn-color: var(--sak-danger-text, #b91c1c);
		--btn-color-hover: var(--sak-danger-text-hover, #991b1b);
		--btn-on-color: var(--sak-danger-on-color, #ffffff);
		--btn-ring: var(--sak-danger-text, #b91c1c);
		/* Danger takes its outline border and hover wash from tokens instead of
		   the computed ones: they are the two colours this app themes explicitly,
		   in both light and dark. */
		--btn-border: var(--sak-danger-border, #fecaca);
		--btn-soft: var(--sak-danger-bg-hover, #fef2f2);
	}

	/* ---- Fills: one rule each, reading only the locals above. ---- */
	.sak-btn-fill-solid {
		background: var(--btn-color);
		border-color: var(--btn-color);
		color: var(--btn-on-color);
		box-shadow: var(--sak-btn-shadow, 0 1px 2px rgb(15 23 42 / 0.1));
	}
	.sak-btn-fill-solid:hover:not(:disabled):not(.sak-btn-disabled) {
		background: var(--btn-color-hover);
		border-color: var(--btn-color-hover);
		color: var(--btn-on-color);
	}

	.sak-btn-fill-outline {
		background: transparent;
		border-color: var(--btn-border, var(--btn-color));
		color: var(--btn-color);
	}
	.sak-btn-fill-outline:hover:not(:disabled):not(.sak-btn-disabled) {
		background: var(--btn-soft);
		color: var(--btn-color-hover);
	}

	.sak-btn-fill-soft {
		background: var(--btn-soft);
		border-color: transparent;
		color: var(--btn-color);
	}
	.sak-btn-fill-soft:hover:not(:disabled):not(.sak-btn-disabled) {
		background: color-mix(in srgb, var(--btn-color) 20%, transparent);
		color: var(--btn-color-hover);
	}

	/* `secondary` is the one role whose outline is a real surface rather than a
	   tinted transparency — it is the default button, and it sits on cards that
	   are themselves the page background. */
	.sak-btn-secondary.sak-btn-fill-outline {
		background: var(--sak-secondary-bg, #ffffff);
		border-color: var(--sak-secondary-border, #cbd5e1);
		color: var(--sak-secondary-text, #0f172a);
	}
	.sak-btn-secondary.sak-btn-fill-outline:hover:not(:disabled):not(.sak-btn-disabled) {
		background: var(--sak-secondary-bg-hover, #f1f5f9);
		color: var(--sak-secondary-text, #0f172a);
	}

	/* ---- The two box-less roles. They carry no fill class at all. ---- */
	.sak-btn-ghost {
		background: var(--sak-ghost-bg, transparent);
		color: var(--sak-ghost-text, #0f172a);
	}
	.sak-btn-ghost:hover:not(:disabled):not(.sak-btn-disabled) {
		background: var(--sak-ghost-bg-hover, rgba(15, 23, 42, 0.06));
		color: var(--sak-ghost-text, #0f172a);
	}

	/* `link` is a button that reads as a link — used where an action sits
	   inline in prose or in a dense table cell and a boxed control would be
	   visual noise. It keeps button semantics (and the focus ring). Its height is
	   auto so it can sit on a text baseline instead of reserving a whole
	   control's worth of vertical space. */
	.sak-btn-link {
		background: none;
		height: auto;
		padding-inline: 0;
		color: var(--sak-link-text, #2563eb);
		font-weight: 500;
	}
	.sak-btn-link:hover:not(:disabled):not(.sak-btn-disabled) {
		color: var(--sak-link-text-hover, #1d4ed8);
		text-decoration: underline;
	}

	/* `tone` recolours the two box-less variants. Applied after them in source
	   order so it wins without needing extra specificity. */
	.sak-btn-link.sak-btn-tone-danger,
	.sak-btn-ghost.sak-btn-tone-danger {
		color: var(--sak-danger-text, #b91c1c);
	}
	.sak-btn-link.sak-btn-tone-danger:hover:not(:disabled):not(.sak-btn-disabled),
	.sak-btn-ghost.sak-btn-tone-danger:hover:not(:disabled):not(.sak-btn-disabled) {
		color: var(--sak-danger-text-hover, #991b1b);
	}
	.sak-btn-ghost.sak-btn-tone-danger:hover:not(:disabled):not(.sak-btn-disabled) {
		background: var(--sak-danger-bg-hover, #fef2f2);
	}

	/*
	 * Disabled, last so it wins over every fill above.
	 *
	 * A filled button is flattened to a neutral chip rather than faded: a dark or
	 * saturated fill at 55% opacity does not read as "unavailable", it reads as a
	 * rendering fault. Outlined and box-less forms have almost no fill to flatten,
	 * so those keep the cheaper opacity treatment.
	 */
	.sak-btn-fill-solid:disabled,
	.sak-btn-fill-solid.sak-btn-disabled,
	.sak-btn-fill-soft:disabled,
	.sak-btn-fill-soft.sak-btn-disabled {
		background: var(--sak-disabled-bg, #e2e8f0);
		border-color: transparent;
		color: var(--sak-disabled-text, #94a3b8);
		box-shadow: none;
	}
	.sak-btn-fill-outline:disabled,
	.sak-btn-fill-outline.sak-btn-disabled,
	.sak-btn-ghost:disabled,
	.sak-btn-ghost.sak-btn-disabled,
	.sak-btn-link:disabled,
	.sak-btn-link.sak-btn-disabled {
		opacity: var(--sak-disabled-opacity, 0.55);
	}

	.sak-btn-spinner {
		width: 1em;
		height: 1em;
		flex: none;
		animation: sak-btn-spin 700ms linear infinite;
	}
	.sak-btn-spinner circle {
		stroke-dasharray: 44;
		stroke-dashoffset: 34;
		stroke-linecap: round;
	}

	@keyframes sak-btn-spin {
		to {
			transform: rotate(360deg);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.sak-btn {
			transition: none;
		}
		.sak-btn:active:not(:disabled):not(.sak-btn-disabled) {
			transform: none;
		}
		.sak-btn-spinner {
			animation-duration: 2s;
		}
	}
</style>
