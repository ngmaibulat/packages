import { describe as suite, it as test, afterEach } from 'node:test';
import { assert } from 'chai';
import { assert as typeAssert, type IsExact } from 'conditional-type-checks';

import { dispose, freshName, friendsDb, Nexie, type Friend } from './utils.ts';
import { cmp, isValidKey } from '../../src/nexie/functions/cmp.ts';
import type { Table } from '../../src/nexie/classes/table.ts';
import type {
    EntityTable,
    InsertType,
} from '../../src/nexie/types/entity-table.ts';
import type { NexiePromise } from '../../src/nexie/zone/nexie-promise.ts';

/**
 * Dexie-compat surface added by the review: `Transaction.on`, `EntityTable`,
 * `Table.get(criteria)`, `defineClass`, `blocked` on delete, key validity.
 */

let db = friendsDb();
afterEach(async () => {
    await dispose(db);
    db = friendsDb();
});

suite('Transaction.on', () => {
    test('complete fires once the transaction has committed', async () => {
        const order: string[] = [];
        await db.transaction('rw', db.friends, async (trans) => {
            trans.on('complete', () => order.push('complete'));
            trans.on('error', () => order.push('error'));
            trans.on('abort', () => order.push('abort'));
            await db.friends.add({ name: 'a', age: 1 });
            order.push('body-done');
        });
        assert.deepEqual(order, ['body-done', 'complete']);
    });

    test('error and abort fire when the transaction fails', async () => {
        const fired: string[] = [];
        let reason: unknown;
        await db
            .transaction('rw', db.friends, async (trans) => {
                trans.on('error', (error: unknown) => {
                    fired.push('error');
                    reason = error;
                });
                trans.on('abort', () => fired.push('abort'));
                trans.on('complete', () => fired.push('complete'));
                await db.friends.add({ name: 'a', age: 1 });
                throw new Error('boom');
            })
            .catch(() => {});
        // `abort` is the engine's event and arrives a turn after the scope's
        // own rejection.
        await new Promise((resolve) => setTimeout(resolve, 10));
        assert.include(fired, 'error');
        assert.include(fired, 'abort');
        assert.notInclude(fired, 'complete');
        assert.match(String((reason as Error).message), /boom/);
        assert.equal(await db.friends.count(), 0);
    });

    test('a nested transaction has its own events', async () => {
        const fired: string[] = [];
        await db.transaction('rw', db.friends, async () => {
            await db.transaction('rw', db.friends, async (inner) => {
                inner.on('complete', () => fired.push('inner-complete'));
                await db.friends.add({ name: 'a', age: 1 });
            });
            fired.push('outer-body-done');
        });
        assert.deepEqual(fired, ['inner-complete', 'outer-body-done']);
    });
});

suite('EntityTable and InsertType', () => {
    interface Person {
        id: number;
        name: string;
        age: number;
        shout(): string;
    }

    test('the insert type makes the key optional and drops methods', () => {
        typeAssert<
            IsExact<
                InsertType<Person, 'id'>,
                { name: string; age: number } & { id?: number }
            >
        >(true);
        typeAssert<
            IsExact<
                EntityTable<Person, 'id'>,
                Table<Person, number, InsertType<Person, 'id'>>
            >
        >(true);
    });

    test('add() accepts a record without its generated key', async () => {
        interface People extends Nexie {
            people: EntityTable<{ id: number; name: string }, 'id'>;
        }
        const typed = new Nexie(freshName('entity')) as People;
        typed.version(1).stores({ people: '++id, name' });

        const key = await typed.people.add({ name: 'alice' });
        typeAssert<IsExact<typeof key, number>>(true);
        const read = await typed.people.get(key);
        typeAssert<IsExact<typeof read, { id: number; name: string } | undefined>>(
            true,
        );
        assert.deepEqual(read, { id: key, name: 'alice' });

        // The three-parameter form is what db.table() and trans.table() give.
        const viaTable = typed.table<
            { id: number; name: string },
            number,
            InsertType<{ id: number; name: string }, 'id'>
        >('people');
        await viaTable.bulkAdd([{ name: 'bob' }, { name: 'carol' }]);
        assert.equal(await viaTable.count(), 3);
        await dispose(typed);
    });
});

suite('Table.get(criteria) and defineClass', () => {
    test('get with an object matches on every criterion', async () => {
        await db.friends.bulkAdd([
            { name: 'a', age: 1 },
            { name: 'a', age: 2 },
            { name: 'b', age: 2 },
        ]);
        const found = await db.friends.get({ name: 'a', age: 2 });
        assert.equal(found?.age, 2);
        assert.equal(found?.name, 'a');
        assert.isUndefined(await db.friends.get({ name: 'b', age: 1 }));
        // Unindexed criteria filter too.
        await db.friends.update(found!.id!, { email: 'x' });
        assert.equal((await db.friends.get({ name: 'a', email: 'x' }))?.age, 2);
    });

    test('a null or undefined key is still refused', async () => {
        let caught: unknown;
        await db.friends.get(undefined as unknown as number).catch((e) => {
            caught = e;
        });
        assert.instanceOf(caught, TypeError);
    });

    test('defineClass returns a class the table is mapped to', async () => {
        const FriendClass = db.friends.defineClass();
        const instance = new FriendClass({ name: 'x', age: 1 });
        assert.equal(instance.name, 'x');

        await db.friends.add({ name: 'a', age: 1 });
        const read = (await db.friends.toArray())[0];
        assert.instanceOf(read, FriendClass);
        assert.strictEqual(db.friends.schema.mappedClass, FriendClass);
    });

    test('Nexie.defineClass is the unmapped static form', () => {
        const Class = Nexie.defineClass<Friend>();
        const instance = new Class({ name: 'x', age: 2 });
        assert.equal(instance.age, 2);
        assert.isUndefined(db.friends.schema.mappedClass);
    });
});

suite('delete: blocked', () => {
    test('db.delete() fires blocked while another connection is open', async () => {
        const name = freshName('blocked');
        const holder = new Nexie(name);
        holder.version(1).stores({ items: '++id' });
        // The default versionchange handler closes the connection, which is
        // exactly what would UNblock the delete; hold on instead.
        holder.on('versionchange', () => false);
        await holder.open();

        const deleter = new Nexie(name);
        let blocked = 0;
        deleter.on('blocked', () => {
            blocked++;
        });
        const deletion = deleter.delete();
        // Give the request time to be blocked, then release it.
        await new Promise((resolve) => setTimeout(resolve, 20));
        assert.equal(blocked, 1);
        holder.close();
        await deletion;
        assert.isFalse(await Nexie.exists(name));
    });
});

suite('key validity', () => {
    test('NaN and an invalid Date are not keys', () => {
        assert.isFalse(isValidKey(NaN));
        assert.isFalse(isValidKey(new Date(NaN)));
        assert.isTrue(isValidKey(-Infinity));
        assert.isTrue(isValidKey(new Date(0)));
        assert.throws(() => cmp(NaN, 1), /Invalid key/);
    });
});

// A promise-returning surface must stay a NexiePromise everywhere.
typeAssert<
    IsExact<ReturnType<Table<Friend, number>['get']>, NexiePromise<Friend | undefined>>
>(true);
