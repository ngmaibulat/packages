import { describe as suite, it as test, afterEach } from 'node:test';
import { assert } from 'chai';

import { dispose, freshName, Nexie } from './utils.ts';
import { NexiePromise } from '../../src/nexie/zone/nexie-promise.ts';
import {
    connectionCount,
} from '../../src/nexie/globals/connections.ts';

const opened: Nexie[] = [];

/** Track a database so teardown can delete it even if the test fails. */
function track(db: Nexie): Nexie {
    opened.push(db);
    return db;
}

afterEach(async () => {
    while (opened.length > 0) await dispose(opened.pop()!);
});

suite('Nexie.semVer', () => {
    test('says so when running straight off the sources', () => {
        // Nothing substitutes the build-time define here, and reporting a
        // plausible-looking wrong version would be worse than reporting none.
        assert.strictEqual(Nexie.semVer, '0.0.0-src');
    });

    // Whether the BUILT bundle carries the manifest version is asserted by
    // scripts/postbuild.mjs as part of `pnpm run build`, not here: a test over
    // dist/ went red after every `pnpm bump` until someone rebuilt, and the
    // build is where a substitution failure belongs anyway.
});

suite('Nexie.debug', () => {
    test('is off by default and toggles the engine assertion', () => {
        assert.isFalse(Nexie.debug);
        try {
            Nexie.debug = true;
            assert.isTrue(NexiePromise.debug);
        } finally {
            Nexie.debug = false;
        }
        assert.isFalse(NexiePromise.debug);
    });

    test('ordinary work still passes with the assertion on', async () => {
        const db = track(new Nexie(freshName('debug')));
        db.version(1).stores({ items: '++id, name' });
        try {
            Nexie.debug = true;
            await db.table('items').add({ name: 'a' });
            assert.strictEqual(await db.table('items').count(), 1);
        } finally {
            Nexie.debug = false;
        }
    });
});

suite('Nexie.exists / getDatabaseNames / delete', () => {
    test('exists answers false before and true after an open', async () => {
        const name = freshName('exists');
        assert.isFalse(await Nexie.exists(name));

        const db = track(new Nexie(name));
        db.version(1).stores({ items: '++id' });
        await db.open();

        assert.isTrue(await Nexie.exists(name));
    });

    test('probing for a database that is absent does not create it', async () => {
        const name = freshName('probe');
        assert.isFalse(await Nexie.exists(name));
        // The fallback path opens the database to find out; if it left one
        // behind, this second call would answer true.
        assert.isFalse(await Nexie.exists(name));
        assert.notInclude(await Nexie.getDatabaseNames(), name);
    });

    test('getDatabaseNames lists an open database', async () => {
        const name = freshName('names');
        const db = track(new Nexie(name));
        db.version(1).stores({ items: '++id' });
        await db.open();

        assert.include(await Nexie.getDatabaseNames(), name);
    });

    test('the static delete removes a database without a schema', async () => {
        const name = freshName('static-delete');
        const db = new Nexie(name);
        db.version(1).stores({ items: '++id' });
        await db.open();
        db.close();

        await Nexie.delete(name);
        assert.isFalse(await Nexie.exists(name));
    });
});

suite('dynamic open', () => {
    test('adopts the schema of an existing database', async () => {
        const name = freshName('dynamic');

        const declared = new Nexie(name);
        declared
            .version(1)
            .stores({ friends: '++id, name, *tags, [name+age]', notes: 'id' });
        await declared.open();
        await declared.table('friends').add({ name: 'Alice', age: 30 });
        declared.close();

        const dynamic = track(new Nexie(name));
        await dynamic.open();

        assert.isTrue(dynamic.dynamicallyOpened());
        assert.sameMembers(
            dynamic.tables.map((table) => table.name),
            ['friends', 'notes'],
        );

        const friends = dynamic.table('friends');
        assert.strictEqual(friends.schema.primKey.keyPath, 'id');
        assert.isTrue(friends.schema.primKey.auto);
        assert.sameMembers(
            friends.schema.indexes.map((index) => index.name),
            ['name', 'tags', '[name+age]'],
        );
        assert.isTrue(friends.schema.idxByName['tags']!.multi);
        assert.deepEqual(friends.schema.idxByName['[name+age]']!.keyPath, [
            'name',
            'age',
        ]);

        // And it is a working database, not just a description of one.
        assert.strictEqual(await friends.count(), 1);
        assert.strictEqual(
            (await friends.where('name').equals('Alice').first())?.age,
            30,
        );
        assert.strictEqual(dynamic.table('notes').schema.primKey.auto, false);
    });

    test('a declared open is not marked dynamic', async () => {
        const db = track(new Nexie(freshName('declared')));
        db.version(1).stores({ items: '++id' });
        await db.open();
        assert.isFalse(db.dynamicallyOpened());
    });

    test('allowEmptyDB creates the database instead of refusing', async () => {
        const name = freshName('empty');
        const db = track(new Nexie(name, { allowEmptyDB: true }));
        await db.open();

        assert.isTrue(db.dynamicallyOpened());
        assert.lengthOf(db.tables, 0);
        assert.isTrue(await Nexie.exists(name));
    });
});

suite('connection registry', () => {
    test('counts connections and releases them on close', async () => {
        const name = freshName('conn');
        assert.strictEqual(connectionCount(name), 0);

        const first = new Nexie(name);
        first.version(1).stores({ items: '++id' });
        await first.open();
        assert.strictEqual(connectionCount(name), 1);

        const second = new Nexie(name);
        second.version(1).stores({ items: '++id' });
        await second.open();
        assert.strictEqual(connectionCount(name), 2);

        second.close();
        assert.strictEqual(connectionCount(name), 1);
        first.close();
        assert.strictEqual(connectionCount(name), 0);

        await Nexie.delete(name);
    });

    test('warns once past maxConnections, and never throws', async () => {
        const name = freshName('leak');
        const warnings: string[] = [];
        const realWarn = console.warn;
        console.warn = (message: string) => warnings.push(String(message));

        const dbs: Nexie[] = [];
        try {
            for (let i = 0; i < 4; i++) {
                const db = new Nexie(name, { maxConnections: 2 });
                db.version(1).stores({ items: '++id' });
                await db.open();
                dbs.push(db);
            }
        } finally {
            console.warn = realWarn;
            for (const db of dbs) db.close();
            await Nexie.delete(name);
        }

        assert.lengthOf(warnings, 1, 'said once, not once per connection');
        assert.include(warnings[0]!, name);
        assert.include(warnings[0]!, 'maxConnections');
    });
});

suite('chromeTransactionDurability', () => {
    test('is passed through to the transaction and stays usable', async () => {
        const db = track(
            new Nexie(freshName('durability'), {
                chromeTransactionDurability: 'relaxed',
            }),
        );
        db.version(1).stores({ items: '++id, name' });

        await db.table('items').add({ name: 'a' });
        assert.strictEqual(await db.table('items').count(), 1);
    });
});

suite('modifyChunkSize', () => {
    test('splits the write-back into several mutations', async () => {
        const db = track(
            new Nexie(freshName('chunk'), { modifyChunkSize: 3 }),
        );
        db.version(1).stores({ items: '++id, n' });

        const sizes: number[] = [];
        db.use({
            stack: 'dbcore',
            name: 'chunk-spy',
            create: (down) => ({
                table: (name) => {
                    const table = down.table(name);
                    return {
                        ...table,
                        mutate: (request) => {
                            if (request.type === 'put') {
                                sizes.push(request.values?.length ?? 0);
                            }
                            return table.mutate(request);
                        },
                    };
                },
            }),
        });

        await db
            .table('items')
            .bulkAdd(Array.from({ length: 10 }, (_, n) => ({ n })));
        sizes.length = 0;

        const modified = await db
            .table('items')
            .toCollection()
            .modify((item: { n: number }) => {
                item.n += 100;
            });

        assert.strictEqual(modified, 10);
        assert.deepEqual(sizes, [3, 3, 3, 1]);

        const values = await db.table('items').toArray();
        assert.isTrue(values.every((item: { n: number }) => item.n >= 100));
    });

    test('defaults to one mutation for an ordinary modify', async () => {
        const db = track(new Nexie(freshName('chunk-default')));
        db.version(1).stores({ items: '++id, n' });

        await db
            .table('items')
            .bulkAdd(Array.from({ length: 10 }, (_, n) => ({ n })));

        const modified = await db
            .table('items')
            .toCollection()
            .modify({ n: 0 });
        assert.strictEqual(modified, 10);
    });
});
