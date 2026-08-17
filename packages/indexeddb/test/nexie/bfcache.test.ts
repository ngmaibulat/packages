import { describe as suite, it as test, afterEach } from 'node:test';
import { assert } from 'chai';

import { dispose, freshName, Nexie } from './utils.ts';
import { observeBfcache } from '../../src/nexie/globals/bfcache.ts';

/**
 * A page, as far as this feature is concerned.
 *
 * Browser-only code that no test ever runs is code that rots quietly, and the
 * whole surface here is two events and a `persisted` flag -- small enough to
 * stand in for honestly.
 */
function installFakePage(): {
    fire: (type: string, persisted: boolean) => void;
    listenerCount: () => number;
    uninstall: () => void;
} {
    const listeners = new Map<string, Set<(event: unknown) => void>>();
    const scope = globalThis as Record<string, unknown>;

    const saved = {
        document: scope['document'],
        addEventListener: scope['addEventListener'],
        removeEventListener: scope['removeEventListener'],
        had: {
            document: 'document' in scope,
            add: 'addEventListener' in scope,
            remove: 'removeEventListener' in scope,
        },
    };

    scope['document'] = {};
    scope['addEventListener'] = (
        type: string,
        listener: (event: unknown) => void,
    ) => {
        if (!listeners.has(type)) listeners.set(type, new Set());
        listeners.get(type)!.add(listener);
    };
    scope['removeEventListener'] = (
        type: string,
        listener: (event: unknown) => void,
    ) => {
        listeners.get(type)?.delete(listener);
    };

    return {
        fire(type, persisted) {
            for (const listener of [...(listeners.get(type) ?? [])]) {
                listener({ persisted });
            }
        },
        listenerCount() {
            let total = 0;
            for (const set of listeners.values()) total += set.size;
            return total;
        },
        uninstall() {
            if (saved.had.document) scope['document'] = saved.document;
            else delete scope['document'];
            if (saved.had.add) scope['addEventListener'] = saved.addEventListener;
            else delete scope['addEventListener'];
            if (saved.had.remove) {
                scope['removeEventListener'] = saved.removeEventListener;
            } else delete scope['removeEventListener'];
        },
    };
}

let page: ReturnType<typeof installFakePage> | null = null;
const opened: Nexie[] = [];

afterEach(async () => {
    while (opened.length > 0) await dispose(opened.pop()!);
    page?.uninstall();
    page = null;
});

suite('bfcache', () => {
    test('does nothing where there is no page', () => {
        // Node and Bun: no document, so nothing to attach to and nothing to
        // guess at.
        assert.isNull(
            observeBfcache({ onHide: () => undefined, onShow: () => undefined }),
        );
    });

    test('attaches and detaches both page events', () => {
        page = installFakePage();
        const unobserve = observeBfcache({
            onHide: () => undefined,
            onShow: () => undefined,
        });

        assert.isFunction(unobserve);
        assert.strictEqual(page.listenerCount(), 2);
        unobserve!();
        assert.strictEqual(page.listenerCount(), 0);
    });

    test('only reacts to a persisted page', () => {
        page = installFakePage();
        let hides = 0;
        let shows = 0;
        observeBfcache({
            onHide: () => hides++,
            onShow: () => shows++,
        });

        // An ordinary navigation fires the same events without `persisted`, and
        // closing a database on the way out of a page that is being discarded
        // anyway would be work for nothing.
        page.fire('pagehide', false);
        page.fire('pageshow', false);
        assert.strictEqual(hides, 0);
        assert.strictEqual(shows, 0);

        page.fire('pagehide', true);
        page.fire('pageshow', true);
        assert.strictEqual(hides, 1);
        assert.strictEqual(shows, 1);
    });

    test('closes the database on freeze and reopens it on restore', async () => {
        page = installFakePage();

        const db = new Nexie(freshName('bfcache'));
        opened.push(db);
        db.version(1).stores({ items: '++id, name' });
        await db.open();
        await db.table('items').add({ name: 'before' });
        assert.isTrue(db.isOpen());

        page.fire('pagehide', true);
        assert.isFalse(db.isOpen(), 'frozen pages let go of the connection');

        page.fire('pageshow', true);
        // The reopen is deliberately not awaited by the handler; an operation
        // racing it joins the same open.
        assert.strictEqual(await db.table('items').count(), 1);
        assert.isTrue(db.isOpen());
    });

    test('does not reopen a database that was already closed', async () => {
        page = installFakePage();

        const db = new Nexie(freshName('bfcache-closed'));
        opened.push(db);
        db.version(1).stores({ items: '++id' });
        await db.open();
        db.close();

        page.fire('pagehide', true);
        page.fire('pageshow', true);
        assert.isFalse(
            db.isOpen(),
            'a database the caller closed stays closed',
        );
    });
});

suite('bfcache: listener lifetime', () => {
    test('listeners are attached on open and removed on close', async () => {
        page = installFakePage();

        const db = new Nexie(freshName('bfcache-life'));
        opened.push(db);
        db.version(1).stores({ items: '++id' });
        assert.strictEqual(page.listenerCount(), 0, 'nothing before open');

        await db.open();
        assert.strictEqual(page.listenerCount(), 2);

        db.close();
        assert.strictEqual(page.listenerCount(), 0, 'nothing after close');

        // And a static delete of a throwaway instance leaves nothing behind.
        await Nexie.delete(db.name);
        assert.strictEqual(page.listenerCount(), 0);
    });
});
