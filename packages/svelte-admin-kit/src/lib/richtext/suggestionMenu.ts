// One floating suggestion menu (plain DOM, no Svelte — same posture as
// monacoSetup.ts) shared by the @-mention, /-slash-command, and :-emoji
// popups. tiptap's Suggestion utility hands us lifecycle callbacks + a
// clientRect; this class owns the popup element, keyboard navigation, and
// selection.
//
// WHERE this popup is mounted is load-bearing, and the reason is subtle enough
// to be worth writing down.
//
// The editor can be hosted inside a modal <dialog> (opened with showModal()).
// Such a dialog is promoted to the browser's TOP LAYER, and a modal dialog does
// two separate things to the rest of the document:
//
//   1. It paints above it. The top layer sits above the document's entire root
//      stacking context and is ordered by promotion, not z-index — so a plain
//      <body> child paints underneath the dialog at ANY z-index, 60 or
//      2147483647 alike.
//   2. It blocks hit-testing on it. Everything outside the dialog's subtree is
//      "blocked by a modal dialog": elementFromPoint skips it and a real mouse
//      press never reaches it.
//
// Mounting the menu into the top layer (via showPopover()) fixes (1) but NOT
// (2) — measured, not assumed: the menu rendered correctly above the dialog and
// still could not be clicked. Only being inside the dialog's own subtree fixes
// both. So the mount point follows the editor: the nearest open <dialog>
// ancestor if there is one, otherwise <body>.
//
// `position: fixed` is what lets that work without being clipped — the dialog
// sets `overflow: hidden` and its body scrolls, and a fixed-position element's
// containing block is the viewport, so no ancestor scroll container crops it.
//
// Before this, inside a dialog, the menu was invisible AND unclickable but
// still consumed arrows/Enter/Escape — the keyboard path runs through the
// contenteditable, which IS inside the dialog. The symptom was therefore
// "typing @ eats my keystrokes and Escape stops closing the dialog", not
// merely "no menu appears".

export interface SuggestionMenuItem {
	key: string;
	label: string;
	/** Optional left adornment as a character — the emoji itself, or "@". */
	adornment?: string;
	/**
	 * Optional left adornment as raw inner-<svg> markup from an icon registry,
	 * used by the "/" menu so its entries match the toolbar. Takes precedence
	 * over `adornment`. Injected with innerHTML, so — exactly as for
	 * Icon.svelte's {@html} — it must be static developer-authored markup and
	 * never derived from user input.
	 */
	adornmentSvg?: string;
}

export class FloatingSuggestionMenu<T extends SuggestionMenuItem> {
	private element: HTMLDivElement | null = null;
	private items: T[] = [];
	private selectedIndex = 0;
	private onPick: ((item: T) => void) | null = null;
	private emptyText: string;

	constructor(emptyText: string) {
		this.emptyText = emptyText;
	}

	/**
	 * `anchor` is any element inside the editor — its nearest open <dialog>
	 * ancestor decides where the menu is mounted. Omitting it mounts to <body>,
	 * which is correct for an editor in normal page flow.
	 */
	open(items: T[], rect: DOMRect | null, onPick: (item: T) => void, anchor?: Element): void {
		this.items = items;
		this.selectedIndex = 0;
		this.onPick = onPick;
		if (!this.element) {
			this.element = document.createElement('div');
			this.element.className = 'rt-suggest';
		}
		// Re-resolved on every open, not cached: the same editor instance can be
		// torn down and re-mounted under a different host.
		const root = anchor?.closest('dialog[open]') ?? document.body;
		if (this.element.parentNode !== root) root.appendChild(this.element);
		this.render();
		this.position(rect);
	}

	update(items: T[], rect: DOMRect | null): void {
		this.items = items;
		this.selectedIndex = Math.min(this.selectedIndex, Math.max(0, items.length - 1));
		this.render();
		this.position(rect);
	}

	close(): void {
		this.element?.remove();
		this.element = null;
		this.items = [];
		this.onPick = null;
	}

	get isOpen(): boolean {
		return this.element !== null;
	}

	/** Returns true when the key was consumed (suggestion navigation). */
	handleKeyDown(event: KeyboardEvent): boolean {
		if (!this.element) return false;
		switch (event.key) {
			case 'ArrowDown':
				this.selectedIndex = (this.selectedIndex + 1) % Math.max(1, this.items.length);
				this.render();
				return true;
			case 'ArrowUp':
				this.selectedIndex =
					(this.selectedIndex - 1 + Math.max(1, this.items.length)) %
					Math.max(1, this.items.length);
				this.render();
				return true;
			case 'Enter':
			case 'Tab': {
				const item = this.items[this.selectedIndex];
				if (item && this.onPick) {
					this.onPick(item);
					return true;
				}
				return false;
			}
			case 'Escape':
				this.close();
				return true;
			default:
				return false;
		}
	}

	// `rect` is viewport-relative (tiptap hands us a getBoundingClientRect), and
	// so is the menu — `.rt-suggest` is `position: fixed`. No scroll offsets:
	// adding scrollX/scrollY here would be right only for an absolutely
	// positioned document child, and wrong both for a top-layer popover and for
	// the fixed-position fallback.
	private position(rect: DOMRect | null): void {
		if (!this.element || !rect) return;
		const menuHeight = this.element.offsetHeight;
		const below = rect.bottom + 4;
		const fitsBelow = below + menuHeight <= window.innerHeight || menuHeight === 0;
		this.element.style.left = `${Math.min(rect.left, window.innerWidth - 280)}px`;
		this.element.style.top = fitsBelow ? `${below}px` : `${rect.top - menuHeight - 4}px`;
	}

	private render(): void {
		if (!this.element) return;
		this.element.replaceChildren();
		if (this.items.length === 0) {
			const empty = document.createElement('div');
			empty.className = 'rt-suggest-empty';
			empty.textContent = this.emptyText;
			this.element.appendChild(empty);
			return;
		}
		this.items.forEach((item, index) => {
			const button = document.createElement('button');
			button.type = 'button';
			button.className = `rt-suggest-item${index === this.selectedIndex ? ' rt-suggest-item-active' : ''}`;
			if (item.adornmentSvg) {
				// Mirrors Icon.svelte's <svg> attributes so a "/" entry and its
				// toolbar twin are the same drawing at the same weight. Built with
				// createElementNS, not innerHTML on a <span>: an <svg> parsed as
				// HTML lands in the wrong namespace and renders nothing.
				const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
				svg.setAttribute('class', 'rt-suggest-adorn');
				svg.setAttribute('viewBox', '0 0 24 24');
				svg.setAttribute('fill', 'none');
				svg.setAttribute('stroke', 'currentColor');
				svg.setAttribute('stroke-width', '2');
				svg.setAttribute('stroke-linecap', 'round');
				svg.setAttribute('stroke-linejoin', 'round');
				svg.setAttribute('aria-hidden', 'true');
				svg.innerHTML = item.adornmentSvg;
				button.appendChild(svg);
			} else if (item.adornment) {
				const adorn = document.createElement('span');
				adorn.className = 'rt-suggest-adorn';
				adorn.textContent = item.adornment;
				button.appendChild(adorn);
			}
			button.appendChild(document.createTextNode(item.label));
			// mousedown (not click) so the editor selection isn't lost first.
			button.addEventListener('mousedown', (event) => {
				event.preventDefault();
				this.onPick?.(item);
			});
			this.element!.appendChild(button);
		});
	}
}
