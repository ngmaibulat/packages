import Image from '@tiptap/extension-image';

// Image with a persisted `width` attribute (pixels) and an interactive
// corner-drag resize handle. Also carries a transient `uploading` flag used by
// the paste/drop upload flow (RichTextEditor) to mark a placeholder image
// whose src is still a local object URL.
//
// The drag-handle NodeView below is plain-DOM code (no Svelte) but is only
// ever *invoked* by a mounted client-side Editor — server-side rendering
// (@siem/core renderRichTextSafe via @tiptap/html generateHTML) uses
// renderHTML exclusively and never calls addNodeView, so this module stays
// safe to import in Node.
export const ResizableImage = Image.extend({
	addAttributes() {
		return {
			...this.parent?.(),
			width: {
				default: null as number | null,
				parseHTML: (element) => {
					const raw = element.getAttribute('width');
					const parsed = raw ? Number.parseInt(raw, 10) : NaN;
					return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
				},
				renderHTML: (attributes) => (attributes.width ? { width: String(attributes.width) } : {})
			},
			// Transient upload marker — serialized so an aborted upload's
			// placeholder can be recognized (and dropped) on the next load, but
			// stripped again by the editor once the real URL is swapped in.
			uploading: {
				default: false,
				parseHTML: (element) => element.getAttribute('data-uploading') === 'true',
				renderHTML: (attributes) => (attributes.uploading ? { 'data-uploading': 'true' } : {})
			}
		};
	},

	addNodeView() {
		return ({ node, editor, getPos }) => {
			const container = document.createElement('span');
			container.className = 'rt-image-wrap';

			const img = document.createElement('img');
			img.src = node.attrs.src as string;
			if (node.attrs.alt) img.alt = node.attrs.alt as string;
			if (node.attrs.title) img.title = node.attrs.title as string;
			if (node.attrs.width) img.width = node.attrs.width as number;
			if (node.attrs.uploading) container.classList.add('rt-image-uploading');
			container.appendChild(img);

			if (editor.isEditable) {
				const handle = document.createElement('span');
				handle.className = 'rt-image-resize-handle';
				handle.addEventListener('pointerdown', (event) => {
					event.preventDefault();
					event.stopPropagation();
					const startX = event.clientX;
					const startWidth = img.getBoundingClientRect().width;

					const onMove = (move: PointerEvent) => {
						const next = Math.max(40, Math.round(startWidth + (move.clientX - startX)));
						img.width = next;
					};
					const onUp = (up: PointerEvent) => {
						window.removeEventListener('pointermove', onMove);
						window.removeEventListener('pointerup', onUp);
						const finalWidth = Math.max(40, Math.round(startWidth + (up.clientX - startX)));
						const pos = getPos();
						if (typeof pos === 'number') {
							editor
								.chain()
								.command(({ tr }) => {
									tr.setNodeMarkup(pos, undefined, { ...node.attrs, width: finalWidth });
									return true;
								})
								.run();
						}
					};
					window.addEventListener('pointermove', onMove);
					window.addEventListener('pointerup', onUp);
				});
				container.appendChild(handle);
			}

			return {
				dom: container,
				update: (updated) => {
					if (updated.type.name !== node.type.name) return false;
					img.src = updated.attrs.src as string;
					if (updated.attrs.width) img.width = updated.attrs.width as number;
					else img.removeAttribute('width');
					container.classList.toggle('rt-image-uploading', Boolean(updated.attrs.uploading));
					return true;
				}
			};
		};
	}
});
