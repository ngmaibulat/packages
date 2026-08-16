import { describe as suite, it as test, afterEach } from 'node:test';
import { assert } from 'chai';

import { dispose, friendsDb, Nexie, type Friend } from './utils.ts';

let db = friendsDb();
afterEach(async () => {
    await dispose(db);
    db = friendsDb();
});

suite('Table: reading and writing', () => {
    test('add returns the generated key and writes it back onto the object', async () => {
        const friend: Friend = { name: 'Alice', age: 30 };
        const id = await db.friends.add(friend);

        assert.strictEqual(typeof id, 'number');
        assert.strictEqual(
            friend.id,
            id,
            'the caller-supplied object gets its key',
        );
    });

    test('get round-trips a record', async () => {
        const id = await db.friends.add({ name: 'Bob', age: 25 });
        const found = await db.friends.get(id);
        assert.deepEqual(found, { id, name: 'Bob', age: 25 });
    });

    test('get returns undefined for a missing key', async () => {
        assert.isUndefined(await db.friends.get(9999));
    });

    test('get rejects on a null or undefined key', async () => {
        let caught: unknown;
        await db.friends.get(null as unknown as number).catch((e) => {
            caught = e;
        });
        assert.instanceOf(caught, TypeError);
    });

    test('put overwrites an existing record', async () => {
        const id = await db.friends.add({ name: 'Carol', age: 40 });
        await db.friends.put({ id, name: 'Carol', age: 41 });

        const found = await db.friends.get(id);
        assert.strictEqual(found?.age, 41);
        assert.strictEqual(await db.friends.count(), 1, 'no duplicate row');
    });

    test('delete removes a record', async () => {
        const id = await db.friends.add({ name: 'Dan', age: 20 });
        await db.friends.delete(id);
        assert.isUndefined(await db.friends.get(id));
        assert.strictEqual(await db.friends.count(), 0);
    });

    test('clear empties the table', async () => {
        await db.friends.bulkAdd([
            { name: 'a', age: 1 },
            { name: 'b', age: 2 },
        ]);
        await db.friends.clear();
        assert.strictEqual(await db.friends.count(), 0);
    });

    test('toArray returns every record', async () => {
        await db.friends.bulkAdd([
            { name: 'a', age: 1 },
            { name: 'b', age: 2 },
        ]);
        const all = await db.friends.toArray();
        assert.deepEqual(
            all.map((f) => f.name).sort(),
            ['a', 'b'],
        );
    });

    test('a unique index rejects a duplicate', async () => {
        await db.friends.add({ name: 'a', age: 1, email: 'x@example.com' });

        let caught: unknown;
        await db.friends
            .add({ name: 'b', age: 2, email: 'x@example.com' })
            .catch((e) => {
                caught = e;
            });

        assert.strictEqual(
            (caught as Error).name,
            'ConstraintError',
            'mapped to a Nexie error class, not a raw DOMException',
        );
    });
});

suite('Table: bulk operations', () => {
    test('bulkAdd inserts everything and returns the last key', async () => {
        const lastKey = await db.friends.bulkAdd([
            { name: 'a', age: 1 },
            { name: 'b', age: 2 },
            { name: 'c', age: 3 },
        ]);
        assert.strictEqual(await db.friends.count(), 3);
        assert.strictEqual(typeof lastKey, 'number');
    });

    test('bulkAdd with allKeys returns every key', async () => {
        const keys = await db.friends.bulkAdd(
            [
                { name: 'a', age: 1 },
                { name: 'b', age: 2 },
            ],
            { allKeys: true },
        );
        assert.isArray(keys);
        assert.lengthOf(keys, 2);
    });

    test('bulkGet resolves in the requested order, with gaps as undefined', async () => {
        const keys = (await db.friends.bulkAdd(
            [
                { name: 'a', age: 1 },
                { name: 'b', age: 2 },
            ],
            { allKeys: true },
        )) as number[];

        const found = await db.friends.bulkGet([keys[1]!, 9999, keys[0]!]);
        assert.strictEqual(found[0]?.name, 'b');
        assert.isUndefined(found[1]);
        assert.strictEqual(found[2]?.name, 'a');
    });

    test('bulkPut upserts', async () => {
        const id = await db.friends.add({ name: 'a', age: 1 });
        await db.friends.bulkPut([
            { id, name: 'a', age: 99 },
            { name: 'new', age: 2 },
        ]);

        assert.strictEqual((await db.friends.get(id))?.age, 99);
        assert.strictEqual(await db.friends.count(), 2);
    });

    test('bulkDelete removes every listed key', async () => {
        const keys = (await db.friends.bulkAdd(
            [
                { name: 'a', age: 1 },
                { name: 'b', age: 2 },
                { name: 'c', age: 3 },
            ],
            { allKeys: true },
        )) as number[];

        await db.friends.bulkDelete([keys[0]!, keys[2]!]);
        assert.strictEqual(await db.friends.count(), 1);
    });

    test('a partial failure throws BulkError but keeps the good rows', async () => {
        let caught: any;
        await db.friends
            .bulkAdd([
                { name: 'a', age: 1, email: 'dup@example.com' },
                { name: 'b', age: 2, email: 'dup@example.com' },
                { name: 'c', age: 3, email: 'ok@example.com' },
            ])
            .catch((error) => {
                caught = error;
            });

        assert.strictEqual(caught?.name, 'BulkError');
        assert.match(caught.message, /1 of 3 operations failed/);
        assert.lengthOf(caught.failures, 1);
        assert.exists(caught.failuresByPos[1], 'keyed by caller-side index');

        // The whole batch must not have been rolled back by the one failure.
        assert.strictEqual(await db.friends.count(), 2);
    });

    test('empty bulk calls are no-ops', async () => {
        assert.isUndefined(await db.friends.bulkAdd([]));
        assert.deepEqual(await db.friends.bulkAdd([], { allKeys: true }), []);
        await db.friends.bulkDelete([]);
    });
});

suite('Table: outbound keys', () => {
    test('a table with an outbound key takes explicit keys', async () => {
        const outbound = new Nexie(`${db.name}-outbound`);
        outbound.version(1).stores({ items: '' });

        const items = outbound.table<{ v: number }, string>('items');
        await items.add({ v: 1 }, 'first');
        assert.deepEqual(await items.get('first'), { v: 1 });

        await dispose(outbound);
    });

    test('supplying keys for an inbound table is rejected', async () => {
        let caught: unknown;
        await db.friends
            .bulkAdd([{ name: 'a', age: 1 }], [1] as never)
            .catch((e) => {
                caught = e;
            });
        assert.strictEqual((caught as Error).name, 'InvalidArgumentError');
    });
});
