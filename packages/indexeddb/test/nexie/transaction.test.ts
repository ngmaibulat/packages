import { describe as suite, it as test, afterEach } from 'node:test';
import { assert } from 'chai';

import { dispose, friendsDb, type Friend } from './utils.ts';
import { Nexie } from '../../src/nexie/classes/nexie.ts';
import type { Transaction } from '../../src/nexie/classes/transaction.ts';

let db = friendsDb();
afterEach(async () => {
    await dispose(db);
    db = friendsDb();
});

suite('transaction: zone joining', () => {
    // The defining Dexie ergonomic: nested table calls join the enclosing
    // transaction without being handed it.
    test('table calls inside a scope join it, across every await', async () => {
        await db.transaction('rw', db.friends, async (trans) => {
            assert.strictEqual(Nexie.currentTransaction, trans);

            await db.friends.add({ name: 'a', age: 1 });
            assert.strictEqual(
                Nexie.currentTransaction,
                trans,
                'after one write',
            );

            await db.friends.add({ name: 'b', age: 2 });
            assert.strictEqual(
                Nexie.currentTransaction,
                trans,
                'after two writes',
            );

            for (let i = 0; i < 10; i++) {
                await db.friends.get(1);
                assert.strictEqual(
                    Nexie.currentTransaction,
                    trans,
                    `after read ${i + 1}`,
                );
            }
        });

        assert.isNull(Nexie.currentTransaction, 'released after the scope');
        assert.strictEqual(await db.friends.count(), 2);
    });

    test('every operation runs in ONE IDBTransaction', async () => {
        const opened: IDBTransaction[] = [];
        const original = IDBDatabase.prototype.transaction;
        IDBDatabase.prototype.transaction = function (
            this: IDBDatabase,
            ...args: Parameters<IDBDatabase['transaction']>
        ) {
            const idbtrans = original.apply(this, args);
            opened.push(idbtrans);
            return idbtrans;
        };

        try {
            await db.transaction('rw', db.friends, async (trans) => {
                const first = trans.idbtrans;
                for (let i = 0; i < 5; i++) {
                    await db.friends.add({ name: `n${i}`, age: i });
                    assert.strictEqual(
                        trans.idbtrans,
                        first,
                        `same idbtrans after write ${i + 1}`,
                    );
                }
            });
        } finally {
            IDBDatabase.prototype.transaction = original;
        }

        assert.lengthOf(opened, 1, 'exactly one transaction was opened');
    });

    test('two interleaved scopes keep their own transactions', async () => {
        const run = (label: string) =>
            db.transaction('rw', db.friends, async (trans) => {
                for (let i = 0; i < 5; i++) {
                    await db.friends.add({ name: `${label}${i}`, age: i });
                    assert.strictEqual(
                        Nexie.currentTransaction,
                        trans,
                        `${label} @${i}`,
                    );
                }
                return label;
            });

        // Started without awaiting, so they interleave.
        const results = await Promise.all([run('A'), run('B')]);
        assert.deepEqual(results, ['A', 'B']);
        assert.strictEqual(await db.friends.count(), 10);
    });

    test('trans.<table> is bound to the transaction', async () => {
        await db.transaction('rw', db.friends, async (trans) => {
            const bound = (trans as Transaction & { friends: typeof db.friends })
                .friends;
            assert.strictEqual(
                bound,
                trans.table<Friend, number>('friends'),
                'memoized',
            );
            await bound.add({ name: 'via trans', age: 5 });
        });
        assert.strictEqual(await db.friends.count(), 1);
    });

    test('trans.table() rejects a table outside the transaction', async () => {
        await db.transaction('rw', db.friends, (trans) => {
            assert.throws(
                () => trans.table('nope'),
                /not part of transaction/,
            );
        });
    });
});

suite('transaction: atomicity', () => {
    test('a throw rolls the whole scope back', async () => {
        let caught: unknown;
        await db
            .transaction('rw', db.friends, async () => {
                await db.friends.add({ name: 'a', age: 1 });
                await db.friends.add({ name: 'b', age: 2 });
                throw new Error('abort please');
            })
            .catch((error) => {
                caught = error;
            });

        assert.match(String((caught as Error).message), /abort please/);
        assert.strictEqual(
            await db.friends.count(),
            0,
            'both writes were rolled back',
        );
    });

    test('an explicit abort rolls back and rejects', async () => {
        let caught: unknown;
        await db
            .transaction('rw', db.friends, async (trans) => {
                await db.friends.add({ name: 'a', age: 1 });
                trans.abort();
            })
            .catch((error) => {
                caught = error;
            });

        assert.strictEqual((caught as Error).name, 'AbortError');
        assert.strictEqual(await db.friends.count(), 0);
    });

    test('a scope that returns a value resolves with it', async () => {
        const result = await db.transaction('rw', db.friends, async () => {
            await db.friends.add({ name: 'a', age: 1 });
            return 'done';
        });
        assert.strictEqual(result, 'done');
    });

    test('a scope that starts work without awaiting it still completes', async () => {
        // The fire-and-forget shape, which is what follow() covers.
        await db.transaction('rw', db.friends, () => {
            void db.friends.add({ name: 'a', age: 1 });
            void db.friends.add({ name: 'b', age: 2 });
        });
        assert.strictEqual(await db.friends.count(), 2);
    });
});

suite('transaction: modes and nesting', () => {
    test('a write inside a readonly scope is rejected', async () => {
        let caught: unknown;
        await db
            .transaction('r', db.friends, async () => {
                await db.friends.add({ name: 'a', age: 1 });
            })
            .catch((error) => {
                caught = error;
            });
        assert.strictEqual((caught as Error).name, 'ReadOnlyError');
    });

    test('a nested scope reuses the parent transaction', async () => {
        await db.transaction('rw', db.friends, async (outer) => {
            await db.transaction('rw', db.friends, async (inner) => {
                assert.strictEqual(
                    inner.idbtrans,
                    outer.idbtrans,
                    'rides on the parent',
                );
                await db.friends.add({ name: 'nested', age: 1 });
            });
        });
        assert.strictEqual(await db.friends.count(), 1);
    });

    test('a nested failure rolls back the outer scope too', async () => {
        let caught: unknown;
        await db
            .transaction('rw', db.friends, async () => {
                await db.friends.add({ name: 'outer', age: 1 });
                await db.transaction('rw', db.friends, async () => {
                    await db.friends.add({ name: 'inner', age: 2 });
                    throw new Error('inner boom');
                });
            })
            .catch((error) => {
                caught = error;
            });

        assert.match(String((caught as Error).message), /inner boom/);
        assert.strictEqual(await db.friends.count(), 0);
    });

    test('rw inside r is rejected, and rw? is tolerated', async () => {
        let caught: unknown;
        await db
            .transaction('r', db.friends, async () => {
                await db.transaction('rw', db.friends, async () => {});
            })
            .catch((error) => {
                caught = error;
            });
        assert.strictEqual((caught as Error).name, 'ReadOnlyError');
    });

    test('a table outside the parent transaction is rejected', async () => {
        const two = friendsDb();
        two.version(1).stores({ friends: '++id, name', others: '++id' });

        let caught: unknown;
        await two
            .transaction('rw', two.friends, async () => {
                await two.transaction('rw', two.table('others'), async () => {});
            })
            .catch((error) => {
                caught = error;
            });

        assert.strictEqual((caught as Error).name, 'SubTransactionError');
        await dispose(two);
    });
});

suite('transaction: waitFor', () => {
    // A raw task-boundary await kills the transaction; waitFor is the sanctioned
    // way to survive one.
    test('holds the transaction open across a task boundary', async () => {
        await db.transaction('rw', db.friends, async (trans) => {
            await db.friends.add({ name: 'before', age: 1 });

            await Nexie.waitFor(
                new Promise<void>((resolve) => setTimeout(resolve, 20)),
            );

            assert.isTrue(trans.active, 'still active after the wait');
            await db.friends.add({ name: 'after', age: 2 });
        });

        assert.strictEqual(
            await db.friends.count(),
            2,
            'both writes committed in one transaction',
        );
    });

    test('outside a transaction it is just a promise', async () => {
        assert.strictEqual(await Nexie.waitFor(Promise.resolve(7)), 7);
    });
});
