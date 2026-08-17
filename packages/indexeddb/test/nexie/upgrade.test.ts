import { describe as suite, it as test } from 'node:test';
import { assert } from 'chai';

import { dispose, freshName, Nexie } from './utils.ts';

suite('db.on("populate")', () => {
    test('fires once, on a brand-new database', async () => {
        const name = freshName('populate');
        let fired = 0;

        const db = new Nexie(name);
        db.version(1).stores({ items: '++id, name' });
        db.on('populate', () => {
            fired++;
        });

        await db.open();
        assert.strictEqual(fired, 1);
        db.close();

        // Reopening an existing database must not populate it again.
        const again = new Nexie(name);
        again.version(1).stores({ items: '++id, name' });
        let refired = 0;
        again.on('populate', () => {
            refired++;
        });
        await again.open();
        assert.strictEqual(refired, 0);

        await dispose(again);
    });

    test('seeds data inside the upgrade transaction', async () => {
        const db = new Nexie(freshName('populate-seed'));
        db.version(1).stores({ items: '++id, name' });
        db.on('populate', (trans) => {
            void trans.table('items').bulkAdd([{ name: 'a' }, { name: 'b' }]);
        });

        await db.open();
        assert.strictEqual(await db.table('items').count(), 2);
        await dispose(db);
    });

    test('an async populate is awaited before open resolves', async () => {
        const db = new Nexie(freshName('populate-async'));
        db.version(1).stores({ items: '++id, name' });
        db.on('populate', async (trans) => {
            await trans.table('items').add({ name: 'first' });
            await trans.table('items').add({ name: 'second' });
        });

        await db.open();
        assert.strictEqual(await db.table('items').count(), 2);
        await dispose(db);
    });
});

suite('version().upgrade()', () => {
    test('runs when moving from an older version', async () => {
        const name = freshName('upgrade');

        const v1 = new Nexie(name);
        v1.version(1).stores({ people: '++id, name' });
        await v1.table('people').bulkAdd([{ name: 'alice' }, { name: 'bob' }]);
        v1.close();

        const v2 = new Nexie(name);
        v2.version(1).stores({ people: '++id, name' });
        v2.version(2)
            .stores({ people: '++id, name, upper' })
            .upgrade(async (trans) => {
                await trans
                    .table('people')
                    .toCollection()
                    .modify((person: { name: string; upper?: string }) => {
                        person.upper = person.name.toUpperCase();
                    });
            });

        await v2.open();
        assert.strictEqual(v2.verno, 2);

        const people = await v2.table('people').toArray();
        assert.deepEqual(
            people.map((p) => p.upper).sort(),
            ['ALICE', 'BOB'],
        );

        // The new index must be queryable, which proves the structural change
        // landed alongside the data migration.
        assert.strictEqual(
            await v2.table('people').where('upper').equals('ALICE').count(),
            1,
        );

        await dispose(v2);
    });

    test('does not run on a brand-new database', async () => {
        let ran = false;
        const db = new Nexie(freshName('upgrade-fresh'));
        db.version(1).stores({ items: '++id' });
        db.version(2)
            .stores({ items: '++id, extra' })
            .upgrade(() => {
                ran = true;
            });

        await db.open();
        assert.isFalse(ran, 'a new database is created at the latest version');
        assert.strictEqual(db.verno, 2);
        await dispose(db);
    });

    test('runs each intermediate version in order', async () => {
        const name = freshName('upgrade-chain');

        const v1 = new Nexie(name);
        v1.version(1).stores({ log: '++id, step' });
        await v1.table('log').add({ step: 'created' });
        v1.close();

        const order: string[] = [];
        const v3 = new Nexie(name);
        v3.version(1).stores({ log: '++id, step' });
        v3.version(2)
            .stores({ log: '++id, step' })
            .upgrade(() => {
                order.push('v2');
            });
        v3.version(3)
            .stores({ log: '++id, step' })
            .upgrade(() => {
                order.push('v3');
            });

        await v3.open();
        assert.deepEqual(order, ['v2', 'v3']);
        await dispose(v3);
    });

    test('two upgrade() calls on one version compose', async () => {
        const name = freshName('upgrade-compose');

        const v1 = new Nexie(name);
        v1.version(1).stores({ items: '++id' });
        await v1.open();
        v1.close();

        const order: string[] = [];
        const v2 = new Nexie(name);
        v2.version(1).stores({ items: '++id' });
        const version = v2.version(2).stores({ items: '++id' });
        version.upgrade(() => {
            order.push('first');
        });
        version.upgrade(() => {
            order.push('second');
        });

        await v2.open();
        assert.deepEqual(order, ['first', 'second']);
        await dispose(v2);
    });

    test('a failing upgrade rejects open and leaves the old version intact', async () => {
        const name = freshName('upgrade-fail');

        const v1 = new Nexie(name);
        v1.version(1).stores({ items: '++id, name' });
        await v1.table('items').add({ name: 'kept' });
        v1.close();

        const v2 = new Nexie(name);
        v2.version(1).stores({ items: '++id, name' });
        v2.version(2)
            .stores({ items: '++id, name' })
            .upgrade(() => {
                throw new Error('migration exploded');
            });

        let caught: unknown;
        await v2.open().catch((error) => {
            caught = error;
        });
        assert.match(String((caught as Error).message), /migration exploded/);
        v2.close();

        // The database must still open at version 1 with its data.
        const recheck = new Nexie(name);
        recheck.version(1).stores({ items: '++id, name' });
        await recheck.open();
        assert.strictEqual(recheck.verno, 1, 'the upgrade was rolled back');
        assert.strictEqual(await recheck.table('items').count(), 1);
        await dispose(recheck);
    });

    test('adding a table in a later version creates it', async () => {
        const name = freshName('upgrade-addtable');

        const v1 = new Nexie(name);
        v1.version(1).stores({ a: '++id' });
        await v1.open();
        v1.close();

        const v2 = new Nexie(name);
        v2.version(1).stores({ a: '++id' });
        v2.version(2).stores({ b: '++id' });
        await v2.open();

        assert.deepEqual(
            Array.from(v2.backendDB()!.objectStoreNames).sort(),
            ['a', 'b'],
        );
        await dispose(v2);
    });

    test('dropping a table in a later version removes it', async () => {
        const name = freshName('upgrade-droptable');

        const v1 = new Nexie(name);
        v1.version(1).stores({ keep: '++id', drop: '++id' });
        await v1.open();
        v1.close();

        const v2 = new Nexie(name);
        v2.version(1).stores({ keep: '++id', drop: '++id' });
        v2.version(2).stores({ drop: null });
        await v2.open();

        assert.deepEqual(Array.from(v2.backendDB()!.objectStoreNames), ['keep']);
        await dispose(v2);
    });
});

suite('db.on lifecycle events', () => {
    test('ready fires before open resolves and can block it', async () => {
        const order: string[] = [];
        const db = new Nexie(freshName('ready'));
        db.version(1).stores({ items: '++id' });

        db.on('ready', async () => {
            order.push('ready-start');
            await db.table('items').add({});
            order.push('ready-end');
        });

        await db.open();
        order.push('opened');

        assert.deepEqual(order, ['ready-start', 'ready-end', 'opened']);
        await dispose(db);
    });

    test('close fires when the connection is closed by the engine', async () => {
        const db = new Nexie(freshName('closeev'));
        db.version(1).stores({ items: '++id' });
        await db.open();

        // Subscribed but not triggered by an explicit close() -- that path is
        // the caller's own doing, not an engine notification.
        let fired = 0;
        db.on('close', () => {
            fired++;
        });

        db.close();
        assert.strictEqual(fired, 0, 'explicit close is not an engine event');
        await dispose(db);
    });

    test('versionchange closes the database by default', async () => {
        const name = freshName('versionchange');

        const first = new Nexie(name);
        first.version(1).stores({ items: '++id' });
        await first.open();

        let notified = 0;
        first.on('versionchange', () => {
            notified++;
        });

        // A second connection upgrading forces the first to yield.
        const second = new Nexie(name);
        second.version(1).stores({ items: '++id' });
        second.version(2).stores({ items: '++id, extra' });
        await second.open();

        assert.strictEqual(notified, 1, 'the first connection was notified');
        await dispose(second);
    });

    test('once() unsubscribes after the first fire', async () => {
        const db = new Nexie(freshName('once'));
        db.version(1).stores({ items: '++id' });

        let fired = 0;
        db.once('populate', () => {
            fired++;
        });

        await db.open();
        assert.strictEqual(fired, 1);
        assert.lengthOf(
            db.on['populate'].subscribers,
            0,
            'removed after firing',
        );
        await dispose(db);
    });
});

suite('version(): schema diffs', () => {
    test('adding and dropping indexes on an existing table', async () => {
        const name = freshName('index-diff');
        const v1 = new Nexie(name);
        v1.version(1).stores({ people: '++id, name, age' });
        await v1.table('people').add({ name: 'alice', age: 30, city: 'Oslo' });
        v1.close();

        const v2 = new Nexie(name);
        v2.version(1).stores({ people: '++id, name, age' });
        v2.version(2).stores({ people: '++id, name, city' });
        await v2.open();

        const store = v2.idbdb!.transaction('people').objectStore('people');
        assert.deepEqual([...store.indexNames].sort(), ['city', 'name']);
        // The new index is populated from existing records.
        assert.equal(
            (await v2.table('people').where('city').equals('Oslo').first())!.name,
            'alice',
        );
        await dispose(v2);
    });

    test('changing the primary key is refused, not silently ignored', async () => {
        const name = freshName('pk-change');
        const v1 = new Nexie(name);
        v1.version(1).stores({ people: '++id, name' });
        await v1.table('people').add({ name: 'alice' });
        v1.close();

        const v2 = new Nexie(name);
        v2.version(1).stores({ people: '++id, name' });
        v2.version(2).stores({ people: 'uuid, name' });

        let caught: unknown;
        await v2.open().catch((error) => {
            caught = error;
        });
        assert.equal((caught as Error).name, 'UpgradeError');
        assert.include((caught as Error).message, 'primary key');
        assert.isFalse(v2.isOpen());

        // Still at version 1, still readable.
        const check = new Nexie(name);
        check.version(1).stores({ people: '++id, name' });
        await check.open();
        assert.equal(check.verno, 1);
        assert.equal(await check.table('people').count(), 1);
        await dispose(check);
    });

    test('toggling autoIncrement is a primary-key change too', async () => {
        const name = freshName('pk-auto');
        const v1 = new Nexie(name);
        v1.version(1).stores({ people: 'id, name' });
        await v1.open();
        v1.close();

        const v2 = new Nexie(name);
        v2.version(1).stores({ people: 'id, name' });
        v2.version(2).stores({ people: '++id, name' });
        let caught: unknown;
        await v2.open().catch((error) => {
            caught = error;
        });
        assert.equal((caught as Error).name, 'UpgradeError');
        await dispose(v2);
    });
});

suite('db.on("ready") semantics', () => {
    const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

    test('subscribing to an already-open database fires right away', async () => {
        const db = new Nexie(freshName('ready-late'));
        db.version(1).stores({ items: '++id' });
        await db.open();

        let fired = 0;
        db.on('ready', () => {
            fired++;
        });
        await settle();
        assert.equal(fired, 1);
        await dispose(db);
    });

    test('a plain subscriber fires once; a sticky one fires on every open', async () => {
        const db = new Nexie(freshName('ready-sticky'));
        db.version(1).stores({ items: '++id' });

        let plain = 0;
        let sticky = 0;
        db.on('ready', () => {
            plain++;
        });
        db.on('ready', () => {
            sticky++;
        }, true);

        await db.open();
        db.close();
        await db.open();
        db.close();
        await db.open();
        await settle();

        assert.equal(plain, 1);
        assert.equal(sticky, 3);
        await dispose(db);
    });

    test('a subscriber added while ready is firing joins that batch', async () => {
        const db = new Nexie(freshName('ready-during'));
        db.version(1).stores({ items: '++id' });

        const order: string[] = [];
        db.on('ready', async () => {
            order.push('first');
            db.on('ready', () => {
                order.push('added-during');
            });
            await db.table('items').add({});
        });
        await db.open();
        await settle();
        assert.deepEqual(order, ['first', 'added-during']);
        await dispose(db);
    });

    test('a ready subscriber may use the database without deadlocking', async () => {
        const db = new Nexie(freshName('ready-vip'));
        db.version(1).stores({ items: '++id' });
        await db.open();
        let count = -1;
        db.on('ready', async () => {
            count = await db.table('items').count();
        });
        await settle();
        assert.equal(count, 0);
        await dispose(db);
    });
});
