import { describe as suite, it as test } from 'node:test';
import { assert } from 'chai';

import { dispose, freshName, Nexie } from './utils.ts';

suite('open and close', () => {
    test('a table operation opens the database automatically', async () => {
        const db = new Nexie(freshName());
        db.version(1).stores({ items: '++id, name' });

        assert.isFalse(db.isOpen());
        await db.table('items').add({ name: 'auto' });
        assert.isTrue(db.isOpen(), 'autoOpen brought it up');

        await dispose(db);
    });

    test('open() is idempotent and returns the db', async () => {
        const db = new Nexie(freshName());
        db.version(1).stores({ items: '++id' });

        assert.strictEqual(await db.open(), db);
        assert.strictEqual(await db.open(), db, 'second call is a no-op');

        await dispose(db);
    });

    test('verno reflects the declared version', async () => {
        const db = new Nexie(freshName());
        db.version(1).stores({ items: '++id' });
        assert.strictEqual(db.verno, 1);

        await db.open();
        assert.strictEqual(db.verno, 1, 'and survives the open');

        await dispose(db);
    });

    test('a fractional version is supported', async () => {
        const db = new Nexie(freshName());
        db.version(1.1).stores({ items: '++id' });
        await db.open();
        assert.strictEqual(db.verno, 1.1);
        await dispose(db);
    });

    test('close() releases the connection and allows reopening', async () => {
        const name = freshName();
        const db = new Nexie(name);
        db.version(1).stores({ items: '++id, name' });

        await db.table('items').add({ name: 'before' });
        db.close();
        assert.isFalse(db.isOpen());
        assert.isTrue(db.hasBeenClosed());

        await db.open();
        assert.strictEqual(await db.table('items').count(), 1, 'data persisted');

        await dispose(db);
    });

    test('delete() removes the data', async () => {
        const name = freshName();

        const first = new Nexie(name);
        first.version(1).stores({ items: '++id, name' });
        await first.table('items').add({ name: 'gone soon' });
        await first.delete();

        const second = new Nexie(name);
        second.version(1).stores({ items: '++id, name' });
        assert.strictEqual(await second.table('items').count(), 0);

        await dispose(second);
    });

    test('opening with no declared version is rejected', async () => {
        const db = new Nexie(freshName());
        let caught: unknown;
        await db.open().catch((error) => {
            caught = error;
        });
        assert.strictEqual((caught as Error).name, 'SchemaError');
    });

    test('version() after open is rejected', async () => {
        const db = new Nexie(freshName());
        db.version(1).stores({ items: '++id' });
        await db.open();

        assert.throws(() => db.version(2), /Cannot add version when database is open/);
        await dispose(db);
    });

    test('a non-positive version is rejected', () => {
        const db = new Nexie(freshName());
        assert.throws(() => db.version(0), TypeError);
        assert.throws(() => db.version(Number.NaN), TypeError);
    });
});

suite('schema installation', () => {
    test('tables are installed as instance properties', async () => {
        const db = new Nexie(freshName()) as Nexie & {
            friends: { add(v: unknown): Promise<unknown> };
        };
        db.version(1).stores({ friends: '++id, name' });

        assert.exists(db.friends, 'db.friends is installed');
        assert.strictEqual(db.friends, db.table('friends'), 'same instance');
        assert.deepEqual(
            db.tables.map((t) => t.name),
            ['friends'],
        );

        await dispose(db);
    });

    test('later versions inherit earlier schemas', async () => {
        const db = new Nexie(freshName());
        db.version(1).stores({ a: '++id' });
        db.version(2).stores({ b: '++id' });

        assert.deepEqual(db.tables.map((t) => t.name).sort(), ['a', 'b']);
        await db.open();
        assert.deepEqual(
            Array.from(db.backendDB()!.objectStoreNames).sort(),
            ['a', 'b'],
        );

        await dispose(db);
    });

    test('a table set to null is dropped in the later version', async () => {
        const db = new Nexie(freshName());
        db.version(1).stores({ keep: '++id', drop: '++id' });
        db.version(2).stores({ drop: null });

        await db.open();
        assert.deepEqual(Array.from(db.backendDB()!.objectStoreNames), ['keep']);

        await dispose(db);
    });

    test('indexes declared in the spec exist on the store', async () => {
        const db = new Nexie(freshName());
        db.version(1).stores({ friends: '++id, name, &email, *tags, [a+b]' });
        await db.open();

        const idbtrans = db.backendDB()!.transaction('friends', 'readonly');
        const store = idbtrans.objectStore('friends');

        assert.deepEqual(Array.from(store.indexNames).sort(), [
            '[a+b]',
            'email',
            'name',
            'tags',
        ]);
        assert.isTrue(store.index('email').unique);
        assert.isTrue(store.index('tags').multiEntry);
        assert.deepEqual(store.index('[a+b]').keyPath, ['a', 'b']);

        await dispose(db);
    });

    test('table() rejects an unknown name', () => {
        const db = new Nexie(freshName());
        db.version(1).stores({ items: '++id' });
        assert.throws(() => db.table('nope'), /does not exist/);
    });
});
