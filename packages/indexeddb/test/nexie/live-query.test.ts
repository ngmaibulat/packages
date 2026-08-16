import { describe as suite, it as test, beforeEach, afterEach } from 'node:test';
import { assert } from 'chai';

import { dispose, freshName, Nexie } from './utils.ts';
import { globalEvents } from '../../src/nexie/globals/global-events.ts';
import { liveQuery } from '../../src/nexie/live-query/live-query.ts';
import type { Subscription } from '../../src/nexie/live-query/live-query.ts';

let db: Nexie;
const open: Subscription[] = [];

beforeEach(() => {
    db = new Nexie(freshName('lq'));
    db.version(1).stores({ friends: '++id, name, age' });
});

afterEach(async () => {
    while (open.length > 0) open.pop()!.unsubscribe();
    await dispose(db);
});

/** Track a subscription so teardown can close it even if the test fails. */
function track(subscription: Subscription): Subscription {
    open.push(subscription);
    return subscription;
}

/**
 * Wait for a condition rather than for a duration.
 *
 * A fixed sleep is a test that passes on an idle machine and fails in CI, which
 * is worse than no test: the failure then looks like a bug in the library.
 */
async function waitUntil(
    condition: () => boolean,
    what = 'condition',
): Promise<void> {
    const deadline = Date.now() + 5000;
    while (!condition()) {
        if (Date.now() > deadline) {
            throw new Error(`timed out waiting for ${what}`);
        }
        await new Promise((resolve) => setTimeout(resolve, 5));
    }
}

/**
 * Run `fn` and resolve once its commit notification has reached every listener.
 *
 * `run()` starts the querier synchronously inside that delivery, so a test
 * asserting a query did NOT re-run can assert it the moment this resolves --
 * no sleep, and no race in the other direction either.
 */
async function afterMutation(fn: () => PromiseLike<unknown>): Promise<void> {
    let fired!: () => void;
    const delivered = new Promise<void>((resolve) => {
        fired = resolve;
    });
    const listener = () => fired();
    globalEvents.storagemutated.subscribe(listener);
    try {
        await fn();
        await delivered;
    } finally {
        globalEvents.storagemutated.unsubscribe(listener);
    }
}

/** Collects every value a live query emits. */
function collect<T>(querier: () => PromiseLike<T>): {
    values: T[];
    errors: unknown[];
    subscription: Subscription;
} {
    const values: T[] = [];
    const errors: unknown[] = [];
    const subscription = track(
        liveQuery(querier).subscribe(
            (value) => values.push(value),
            (error) => errors.push(error),
        ),
    );
    return { values, errors, subscription };
}

suite('liveQuery', () => {
    test('emits the initial result, then again on a relevant write', async () => {
        const { values } = collect(() => db.table('friends').toArray());
        await waitUntil(() => values.length === 1, 'the initial result');
        assert.deepEqual(values[0], []);

        await afterMutation(() =>
            db.table('friends').add({ name: 'Alice', age: 30 }),
        );
        await waitUntil(() => values.length === 2, 'the re-run');

        assert.lengthOf(values[1] as unknown[], 1);
    });

    test('does not re-run for a write outside what it read', async () => {
        await db.table('friends').bulkAdd([
            { name: 'Alice', age: 30 },
            { name: 'Bob', age: 40 },
        ]);

        let runs = 0;
        const { values } = collect(() => {
            runs++;
            return db.table('friends').get(1);
        });
        await waitUntil(() => values.length === 1, 'the initial result');

        // Touches friend 2 only; the query read friend 1.
        await afterMutation(() => db.table('friends').update(2, { age: 41 }));
        assert.equal(runs, 1, 'an unrelated write must not re-run it');

        await afterMutation(() => db.table('friends').update(1, { age: 31 }));
        await waitUntil(() => values.length === 2, 'the re-run');
        assert.equal((values[1] as { age: number }).age, 31);
    });

    test('an index query re-runs on a write to that index', async () => {
        await db.table('friends').add({ name: 'Alice', age: 30 });

        const { values } = collect(() =>
            db.table('friends').where('age').above(35).toArray(),
        );
        await waitUntil(() => values.length === 1, 'the initial result');
        assert.lengthOf(values[0] as unknown[], 0);

        await afterMutation(() =>
            db.table('friends').add({ name: 'Bob', age: 40 }),
        );
        await waitUntil(() => values.length === 2, 'the re-run');
        assert.lengthOf(values[1] as unknown[], 1);
    });

    test('re-runs a query whose read came from a cursor walk', async () => {
        // The filter forces the walk rather than the getAll fast path. Before
        // the walk went through DBCore this query was unobservable, and this is
        // the test that says so.
        await db.table('friends').add({ name: 'Alice', age: 30 });

        const { values } = collect(() =>
            db
                .table('friends')
                .filter((friend: { name: string }) => friend.name.startsWith('A'))
                .toArray(),
        );
        await waitUntil(() => values.length === 1, 'the initial result');
        assert.lengthOf(values[0] as unknown[], 1);

        await afterMutation(() =>
            db.table('friends').add({ name: 'Amy', age: 20 }),
        );
        await waitUntil(() => values.length === 2, 'the re-run');
        assert.lengthOf(values[1] as unknown[], 2);
    });

    test('unsubscribe stops delivery', async () => {
        let runs = 0;
        const { values, subscription } = collect(() => {
            runs++;
            return db.table('friends').toArray();
        });
        await waitUntil(() => values.length === 1, 'the initial result');
        assert.isFalse(subscription.closed);

        subscription.unsubscribe();
        assert.isTrue(subscription.closed);

        await afterMutation(() =>
            db.table('friends').add({ name: 'Alice', age: 30 }),
        );
        assert.equal(runs, 1);
        assert.lengthOf(values, 1);
    });

    test('unsubscribe is idempotent', async () => {
        const { values, subscription } = collect(() =>
            db.table('friends').toArray(),
        );
        await waitUntil(() => values.length === 1, 'the initial result');
        subscription.unsubscribe();
        subscription.unsubscribe();
        assert.isTrue(subscription.closed);
    });

    test('a write landing mid-query causes exactly one more run', async () => {
        await db.table('friends').add({ name: 'Alice', age: 30 });

        let runs = 0;
        let releaseFirstRun: (() => void) | null = null;

        const { values } = collect(async () => {
            runs++;
            const result = await db.table('friends').toArray();
            if (runs === 1) {
                // Hold the first run open long enough for a write to land while
                // it is still in flight.
                await new Promise<void>((resolve) => {
                    releaseFirstRun = resolve;
                });
            }
            return result;
        });

        await waitUntil(() => releaseFirstRun !== null, 'the first run to park');

        await afterMutation(() =>
            db.table('friends').add({ name: 'Bob', age: 40 }),
        );
        (releaseFirstRun as unknown as () => void)();

        await waitUntil(() => values.length === 1, 'the fresh result');
        // Two runs: the original, and the one the mid-flight write forced. The
        // stale first result is never delivered.
        assert.equal(runs, 2);
        assert.lengthOf(values[0] as unknown[], 2);
    });

    test('reports a synchronous throw through the error callback', async () => {
        // Thrown before the first await, so it comes straight back out of the
        // zone call -- it must not escape to whoever called subscribe().
        const errors: unknown[] = [];
        track(
            liveQuery<never>(() => {
                throw new Error('sync boom');
            }).subscribe(
                () => undefined,
                (error) => errors.push(error),
            ),
        );
        await waitUntil(() => errors.length === 1, 'the error');
        assert.equal((errors[0] as Error).message, 'sync boom');
    });

    test('reports a failing querier through the error callback', async () => {
        const { values, errors } = collect(async () => {
            await db.table('friends').toArray();
            throw new Error('boom');
        });
        await waitUntil(() => errors.length === 1, 'the error');

        assert.lengthOf(values, 0);
        assert.equal((errors[0] as Error).message, 'boom');
    });

    test('a failed query still re-runs when its reads change', async () => {
        let failing = true;
        const { values, errors } = collect(async () => {
            const all = await db.table('friends').toArray();
            if (failing) throw new Error('not ready');
            return all;
        });
        await waitUntil(() => errors.length === 1, 'the first failure');

        failing = false;
        await afterMutation(() =>
            db.table('friends').add({ name: 'Alice', age: 30 }),
        );
        await waitUntil(() => values.length === 1, 'the recovered result');
    });

    test('accepts an observer object as well as callbacks', async () => {
        const values: unknown[] = [];
        track(
            liveQuery(() => db.table('friends').toArray()).subscribe({
                next: (value) => values.push(value),
            }),
        );
        await waitUntil(() => values.length === 1, 'the initial result');
    });

    test('sees writes made through a second connection to the same database', async () => {
        const { values } = collect(() => db.table('friends').toArray());
        await waitUntil(() => values.length === 1, 'the initial result');

        // A different Nexie instance over the same store: the notification bus
        // is process-wide precisely so this is not invisible.
        const other = new Nexie(db.name);
        other.version(1).stores({ friends: '++id, name, age' });
        try {
            await afterMutation(() =>
                other.table('friends').add({ name: 'Alice', age: 30 }),
            );
            await waitUntil(() => values.length === 2, 'the re-run');
        } finally {
            other.close();
        }
    });

    test('exposes the rxjs interop key', () => {
        const observable = liveQuery(() =>
            db.table('friends').toArray(),
        ) as unknown as Record<string | symbol, unknown>;
        const key =
            (Symbol as { observable?: symbol }).observable ?? '@@observable';
        assert.isFunction(observable[key]);
        assert.equal((observable[key] as () => unknown)(), observable);
    });
});
