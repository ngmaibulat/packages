import { describe as suite, it as test, beforeEach, afterEach } from 'node:test';
import { assert } from 'chai';

import { dispose, freshName, Nexie } from './utils.ts';

let db: Nexie;

beforeEach(() => {
    db = new Nexie(freshName('scope'));
    db.version(1).stores({ friends: '++id, name, age', logs: '++id, message' });
});

afterEach(async () => {
    await dispose(db);
});

/** A promise this library did not create, resolving after a task boundary. */
function foreign<T>(value: T): Promise<T> {
    return new Promise((resolve) => setTimeout(() => resolve(value), 5));
}

suite('Nexie.ignoreTransaction', () => {
    test('runs its body outside the ambient transaction', async () => {
        await db.transaction('rw', db.table('friends'), async () => {
            assert.isNotNull(Nexie.currentTransaction);
            Nexie.ignoreTransaction(() => {
                assert.isNull(
                    Nexie.currentTransaction,
                    'the ambient transaction is hidden inside',
                );
            });
            assert.isNotNull(
                Nexie.currentTransaction,
                'and restored on the way out',
            );
        });
    });

    test('its writes survive a rollback of the transaction that started them', async () => {
        let logged: Promise<unknown> | undefined;

        await db
            .transaction('rw', db.table('friends'), async () => {
                await db.table('friends').add({ name: 'Alice', age: 30 });
                // A separate transaction of its own, so the abort below cannot
                // take it with it -- which is the entire point.
                logged = Nexie.ignoreTransaction(() =>
                    db.table('logs').add({ message: 'attempted' }),
                ) as unknown as Promise<unknown>;
                throw new Error('rolling back');
            })
            .catch(() => undefined);

        await logged;
        assert.equal(await db.table('friends').count(), 0, 'rolled back');
        assert.equal(await db.table('logs').count(), 1, 'kept');
    });

    test('outside a transaction it simply runs the function', () => {
        assert.equal(
            Nexie.ignoreTransaction(() => 42),
            42,
        );
    });
});

suite('Nexie.vip', () => {
    test('keeps the ambient transaction', async () => {
        await db.transaction('rw', db.table('friends'), async (trans) => {
            Nexie.vip(() => {
                assert.strictEqual(Nexie.currentTransaction, trans);
            });
        });
    });

    test('a populate subscriber can open a transaction of its own', async () => {
        // Without VIP this deadlocks: db.transaction() would wait for the open
        // that fires populate in the first place.
        const fresh = new Nexie(freshName('vip'));
        fresh.version(1).stores({ friends: '++id, name' });
        fresh.on('populate', () =>
            fresh.transaction('rw', fresh.table('friends'), async () => {
                await fresh.table('friends').add({ name: 'seeded' });
            }),
        );

        try {
            await fresh.open();
            assert.equal(await fresh.table('friends').count(), 1);
        } finally {
            await dispose(fresh);
        }
    });

    test('a ready subscriber can query the database', async () => {
        const fresh = new Nexie(freshName('vip-ready'));
        fresh.version(1).stores({ friends: '++id, name' });

        let seen = -1;
        fresh.on('ready', async () => {
            seen = await fresh.table('friends').count();
        });

        try {
            await fresh.open();
            assert.equal(seen, 0);
        } finally {
            await dispose(fresh);
        }
    });
});

suite('zone attribution', () => {
    // Both of these were broken while the database happened to be open already,
    // and fine while it was opened lazily by the first operation -- which is
    // exactly the kind of difference a suite that always opens lazily never
    // sees. `enterTransactionScope` reaches the scope synchronously on an open
    // database, so the caller's `await` reads `then` at a moment when the echo
    // front is the scope's own zone; a derived promise created there attributed
    // the caller's work to the scope.

    test('a fire-and-forget scope completes on an already-open database', async () => {
        await db.open();

        await db.transaction('rw', db.table('friends'), () => {
            // Started, never awaited, never returned.
            void db.table('friends').add({ name: 'a', age: 1 });
            void db.table('friends').add({ name: 'b', age: 2 });
        });

        assert.equal(await db.table('friends').count(), 2);
    });

    test('the diagnosis fires whether the database was open or not', async () => {
        await db.open();

        let caught: unknown;
        await db
            .transaction('rw', db.table('friends'), async () => {
                await db.table('friends').add({ name: 'Alice', age: 30 });
                await foreign('nothing');
                await db.table('friends').add({ name: 'Bob', age: 40 });
            })
            .catch((error) => {
                caught = error;
            });

        assert.equal((caught as Error).name, 'ForeignAwaitError');
    });
});

suite('ForeignAwaitError', () => {
    test('a foreign await inside a scope names the problem', async () => {
        let caught: unknown;

        await db
            .transaction('rw', db.table('friends'), async () => {
                await db.table('friends').add({ name: 'Alice', age: 30 });
                // The zone dies here: `await` on a native promise never reads
                // our `then`. Left undefended the next line would open a second
                // transaction and lose atomicity with no error at all.
                await foreign('nothing');
                await db.table('friends').add({ name: 'Bob', age: 40 });
            })
            .catch((error) => {
                caught = error;
            });

        assert.isDefined(caught);
        assert.oneOf((caught as Error).name, [
            'ForeignAwaitError',
            'PrematureCommitError',
        ]);
        assert.equal(
            (caught as Error).name,
            'ForeignAwaitError',
            'the precise diagnosis, not the fallback',
        );
        assert.include((caught as Error).message, 'Nexie.waitFor');
    });

    test('Nexie.waitFor is the sanctioned way through', async () => {
        await db.transaction('rw', db.table('friends'), async (trans) => {
            await db.table('friends').add({ name: 'Alice', age: 30 });
            const value = await Nexie.waitFor(foreign('fetched'));
            assert.equal(value, 'fetched');
            assert.strictEqual(
                Nexie.currentTransaction,
                trans,
                'the zone survived',
            );
            await db.table('friends').add({ name: 'Bob', age: 40 });
        });

        assert.equal(await db.table('friends').count(), 2);
    });

    test('ignoreTransaction opts out of the diagnosis', async () => {
        // Same shape as the failing case, but the caller has said the work is
        // deliberately outside the transaction.
        await db.transaction('rw', db.table('friends'), async () => {
            await db.table('friends').add({ name: 'Alice', age: 30 });
            await foreign('nothing');
            await Nexie.ignoreTransaction(() =>
                db.table('logs').add({ message: 'outside' }),
            );
        }).catch(() => undefined);

        assert.equal(await db.table('logs').count(), 1);
    });

    test('does not fire for concurrent work the scope is not waiting on', async () => {
        // The scope is busy with OUR operations throughout, so nothing about it
        // is lost -- an unrelated caller touching the same table must not be
        // told otherwise. This is the false positive the check is shaped to
        // avoid.
        const scope = db.transaction('rw', db.table('friends'), async () => {
            for (let i = 0; i < 10; i++) {
                await db.table('friends').add({ name: `in-${i}`, age: i });
            }
        });

        const outside = db.table('friends').count();

        await scope;
        // The concurrent read must have succeeded rather than been rejected.
        assert.isNumber(await outside);
        assert.equal(await db.table('friends').count(), 10);
    });

    test('does not fire for a table the scope does not cover', async () => {
        await db
            .transaction('rw', db.table('friends'), async () => {
                await db.table('friends').add({ name: 'Alice', age: 30 });
                await foreign('nothing');
                // `logs` is outside the scope, so this is an ordinary operation
                // in its own transaction, not a lost one.
                await db.table('logs').add({ message: 'unrelated' });
            })
            .catch(() => undefined);

        assert.equal(await db.table('logs').count(), 1);
    });
});

suite('zone accounting across nested scopes', () => {
    test('the diagnosis survives a nested scope', async () => {
        // A child zone paying its parent back once per await -- against a
        // single up-front charge -- drove the parent's counter negative, after
        // which "no work outstanding" was unreachable and the precise
        // ForeignAwaitError degraded to the PrematureCommit fallback.
        await db.open();

        let caught: unknown;
        await db
            .transaction('rw', db.table('friends'), async () => {
                await db.transaction('rw', db.table('friends'), async () => {
                    await db.table('friends').add({ name: 'nested', age: 1 });
                    await db.table('friends').count();
                });
                await db.table('friends').add({ name: 'a', age: 2 });
                await foreign('nothing');
                await db.table('friends').add({ name: 'b', age: 3 });
            })
            .catch((error) => {
                caught = error;
            });

        assert.equal(
            (caught as Error).name,
            'ForeignAwaitError',
            'the precise diagnosis, not the fallback',
        );
    });

    test('an outer scope waits for work an inner scope started', async () => {
        await db.open();
        let innerDone = false;
        await db.transaction('rw', db.table('friends'), () => {
            void db.transaction('rw', db.table('friends'), async () => {
                await db.table('friends').add({ name: 'inner', age: 1 });
                await db.table('friends').add({ name: 'inner2', age: 2 });
                innerDone = true;
            });
        });
        assert.isTrue(innerDone, 'the outer scope resolved before the inner finished');
        assert.equal(await db.table('friends').count(), 2);
    });
});
