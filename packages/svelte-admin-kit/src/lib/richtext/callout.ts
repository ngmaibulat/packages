import { Node, mergeAttributes } from '@tiptap/core';

// Callout kinds mirror the visual language already used across the app's
// alert/banner styles. The kind is carried as data-callout so the rendered
// HTML round-trips through parseHTML unchanged.
export const CALLOUT_KINDS = ['info', 'warning', 'success', 'danger'] as const;
export type CalloutKind = (typeof CALLOUT_KINDS)[number];

export interface CalloutOptions {
	HTMLAttributes: Record<string, string>;
}

declare module '@tiptap/core' {
	interface Commands<ReturnType> {
		callout: {
			/** Wrap the selection in (or insert) a callout of the given kind. */
			setCallout: (attributes?: { kind: CalloutKind }) => ReturnType;
			/** Change the kind of the callout around the selection. */
			updateCallout: (attributes: { kind: CalloutKind }) => ReturnType;
			/** Lift the callout's content back out into the document. */
			unsetCallout: () => ReturnType;
		};
	}
}

// Block-level info panel ("callout"): a colored wrapper around regular block
// content. Deliberately a plain <div data-callout="…"> (not <aside>/<blockquote>)
// so it can't be confused with the real blockquote node, and so the server
// renderer (@siem/core renderRichTextSafe) needs no extra tag allowances —
// DOMPurify permits div + data-* attributes by default.
export const Callout = Node.create<CalloutOptions>({
	name: 'callout',
	group: 'block',
	content: 'block+',
	defining: true,

	addOptions() {
		return { HTMLAttributes: {} };
	},

	addAttributes() {
		return {
			kind: {
				default: 'info' as CalloutKind,
				parseHTML: (element) => {
					const kind = element.getAttribute('data-callout');
					return CALLOUT_KINDS.includes(kind as CalloutKind) ? kind : 'info';
				},
				renderHTML: (attributes) => ({ 'data-callout': attributes.kind as string })
			}
		};
	},

	parseHTML() {
		return [{ tag: 'div[data-callout]' }];
	},

	renderHTML({ node, HTMLAttributes }) {
		const kind = CALLOUT_KINDS.includes(node.attrs.kind)
			? (node.attrs.kind as CalloutKind)
			: 'info';
		return [
			'div',
			mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
				class: `rt-callout rt-callout-${kind}`
			}),
			0
		];
	},

	addCommands() {
		return {
			setCallout:
				(attributes) =>
				({ commands }) =>
					commands.wrapIn(this.name, attributes),
			updateCallout:
				(attributes) =>
				({ commands }) =>
					commands.updateAttributes(this.name, attributes),
			unsetCallout:
				() =>
				({ commands }) =>
					commands.lift(this.name)
		};
	}
});
