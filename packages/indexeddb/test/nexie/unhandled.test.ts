import { describe as suite, it as test, afterEach, beforeEach } from 'node:test';
import { assert } from 'chai';

import { dispose, freshName, friendsDb, Nexie } from './utils.ts';
import { NexiePromise } from '../../src/nexie/zone/nexie-promise.ts';

/**
 * Unhandled rejections.
 *
 * A NexiePromise that rejects with nobody listening by the end of the tick is
 * reported: inside a `follow()` scope (populate, upgrade, a fire-and-forget
 * transaction body) it fails the scope, exactly as Dexie does; at the root it
 * goes to `NexiePromise.onUnhandled`. The one thing it must never do is
 * vanish -- a write that failed and was never looked at is the failure most
 * likely to reach production unnoticed.
 */

let db = friendsDb('id, &email');
afterEach(async () => {
    await dispose(db);
    db = friendsDb('id, &email');
});

const originalOnUnhandled = NexiePromise.onUnhandled;
let reported: unknown[] = [];
beforeEach(() => {
    reported = [];
    NexiePromise.onUnhandled = (reason) => {
        reported.push(reason);
    };
});
afterEach(() => {
    NexiePromise.onUnhandled = originalOnUnhandled;
});

const tick = () => new Promise((resolve) => setTimeout(resolve, 20));

suite('unhandled rejections: inside a follow scope', () => {
    test('a failing write nobody awaited fails on("populate") and the open', async () => {
        db.on('populate', () => {
            // Two writes, started and forgotten. The second violates the
            // unique index and rejects with no listener.
            void db.friends.add({ id: 1, name: 'a', age: 1, email: 'x' });
            void db.friends.add({ id: 2, name: 'b', age: 2, email: 'x' });
        });

        let caught: unknown;
        await db.open().catch((error) => {
            caught = error;
        });

        assert.equal((caught as Error).name, 'ConstraintError');
        assert.isFalse(db.isOpen());
        // The upgrade was aborted, so nothing was seeded either.
        assert.isFalse(await Nexie.exists(db.name));
    });

    test('a failing write nobody awaited fails a fire-and-forget scope', async () => {
        await db.friends.add({ id: 1, name: 'a', age: 1, email: 'x' });

        let caught: unknown;
        await db
            .transaction('rw', db.friends, () => {
                void db.friends.add({ id: 3, name: 'c', age: 3, email: 'z' });
                void db.friends.add({ id: 2, name: 'b', age: 2, email: 'x' });
            })
            .catch((error) => {
                caught = error;
            });

        assert.equal((caught as Error).name, 'ConstraintError');
        // Aborted as a whole: the write that would have succeeded is gone too.
        assert.equal(await db.friends.count(), 1);
    });

    test('a failing write nobody awaited fails version().upgrade()', async () => {
        db.close();
        const name = freshName('upgrade-unhandled');
        const v1 = new Nexie(name);
        v1.version(1).stores({ friends: 'id, &email' });
        await v1.table('friends').add({ id: 1, name: 'a', age: 1, email: 'x' });
        v1.close();

        const v2 = new Nexie(name);
        v2.version(1).stores({ friends: 'id, &email' });
        v2.version(2)
            .stores({ friends: 'id, &email, name' })
            .upgrade((trans) => {
                void trans
                    .table('friends')
                    .add({ id: 2, name: 'b', age: 2, email: 'x' });
            });

        let caught: unknown;
        await v2.open().catch((error) => {
            caught = error;
        });
        assert.equal((caught as Error).name, 'ConstraintError');

        // The database is still at version 1.
        const check = new Nexie(name);
        check.version(1).stores({ friends: 'id, &email' });
        await check.open();
        assert.equal(check.verno, 1);
        await dispose(check);
    });

    test('a handled rejection is nobody\'s business', async () => {
        await db.friends.add({ id: 1, name: 'a', age: 1, email: 'x' });

        let swallowed = 0;
        await db.transaction('rw', db.friends, () => {
            void db.friends
                .add({ id: 2, name: 'b', age: 2, email: 'x' })
                .catch('ConstraintError', () => {
                    swallowed++;
                });
        });

        assert.equal(swallowed, 1);
        assert.equal(await db.friends.count(), 1);
        assert.deepEqual(reported, []);
    });

    test('an async scope commits (Dexie parity) but the failure is reported', async () => {
        await db.friends.add({ id: 1, name: 'a', age: 1, email: 'x' });

        // With an async body the scope's own promise decides the outcome, as
        // in Dexie. What must not happen is silence.
        await db.transaction('rw', db.friends, async () => {
            void db.friends.add({ id: 2, name: 'b', age: 2, email: 'x' });
            await db.friends.get(1);
        });
        await tick();

        assert.equal(await db.friends.count(), 1);
        assert.lengthOf(reported, 1);
        assert.equal((reported[0] as Error).name, 'ConstraintError');
    });
});

suite('unhandled rejections: at the root', () => {
    test('a rejection nobody subscribes to reaches NexiePromise.onUnhandled', async () => {
        NexiePromise.reject(new Error('lost'));
        await tick();
        assert.lengthOf(reported, 1);
        assert.equal((reported[0] as Error).message, 'lost');
    });

    test('awaiting is subscribing, even though the engine calls then later', async () => {
        // `await` reads `then` synchronously and calls it a microtask later;
        // the end-of-tick check runs in between and must not misfire.
        try {
            await NexiePromise.reject(new Error('awaited'));
        } catch {
            // expected
        }
        await tick();
        assert.deepEqual(reported, []);
    });

    test('a late catch still counts, if it lands within the tick', async () => {
        const promise = NexiePromise.reject(new Error('late'));
        promise.catch(() => {});
        await tick();
        assert.deepEqual(reported, []);
    });

    test('a failing top-level write nobody awaits is reported once', async () => {
        await db.friends.add({ id: 1, name: 'a', age: 1, email: 'x' });
        void db.friends.add({ id: 2, name: 'b', age: 2, email: 'x' });
        await tick();
        assert.lengthOf(reported, 1);
        assert.equal((reported[0] as Error).name, 'ConstraintError');
    });
});
