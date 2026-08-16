/**
 * Back/forward cache support.
 *
 * A page put into the bfcache is frozen rather than unloaded, and a browser may
 * close its IndexedDB connections while it sits there — Safari does. The page
 * then comes back alive with a connection object that looks fine and fails on
 * the next request, or worse, holds a version upgrade another tab is waiting
 * for. Neither has a symptom near its cause.
 *
 * So: close on the way in, reopen on the way out, and only for a page that was
 * genuinely persisted. An ordinary navigation away fires `pagehide` too, and
 * closing there would be pointless work on a page that is going anyway.
 *
 * Guarded on `document` rather than `window`: this package builds
 * `platform: "neutral"` and runs under Node and Bun, where a `window` shim is
 * common enough that testing for it proves nothing.
 */

export interface BfcacheTarget {
    /** Called when the page is frozen into the bfcache. */
    onHide(): void;
    /** Called when it is restored from it. */
    onShow(): void;
}

type Listenable = {
    addEventListener(
        type: string,
        listener: (event: { persisted?: boolean }) => void,
    ): void;
    removeEventListener(
        type: string,
        listener: (event: { persisted?: boolean }) => void,
    ): void;
};

function host(): Listenable | null {
    const scope = globalThis as {
        document?: unknown;
        addEventListener?: unknown;
        removeEventListener?: unknown;
    };
    if (!scope.document) return null;
    if (typeof scope.addEventListener !== 'function') return null;
    if (typeof scope.removeEventListener !== 'function') return null;
    return scope as unknown as Listenable;
}

/**
 * Wire `target` to the page lifecycle. Returns a function that unwires it, or
 * null where there is no page to wire to.
 */
export function observeBfcache(target: BfcacheTarget): (() => void) | null {
    const scope = host();
    if (!scope) return null;

    const onPageHide = (event: { persisted?: boolean }) => {
        if (event.persisted) target.onHide();
    };
    const onPageShow = (event: { persisted?: boolean }) => {
        if (event.persisted) target.onShow();
    };

    scope.addEventListener('pagehide', onPageHide);
    scope.addEventListener('pageshow', onPageShow);

    return () => {
        scope.removeEventListener('pagehide', onPageHide);
        scope.removeEventListener('pageshow', onPageShow);
    };
}
