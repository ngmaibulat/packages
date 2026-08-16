import { describe as suite, it as test } from 'node:test';
import { assert } from 'chai';

import {
    getZone,
    newZone,
    rootZone,
    type Zone,
} from '../../src/nexie/zone/zone.ts';
import { NexiePromise } from '../../src/nexie/zone/nexie-promise.ts';

/**
 * Enter a fresh zone and hand the body its own zone object.
 *
 * Returns a NexiePromise, never the async function's native promise: `await
 * nativePromise` takes the PromiseResolve fast path and never reads `.then`, so
 * a scope that handed back a native promise would lose the zone at its own call
 * site. Every public Nexie API has to obey the same rule.
 */
function scope<R>(fn: (zone: Zone) => R): NexiePromise<Awaited<R>> {
    return NexiePromise.resolve(
        newZone(() => fn(getZone())),
    ) as NexiePromise<Awaited<R>>;
}

/** Stands in for an IndexedDB request: settles from a native microtask. */
function request<V>(value: V): NexiePromise<V> {
    return new NexiePromise<V>((resolve) =>
        queueMicrotask(() => resolve(value)),
    );
}

suite('zone', () => {
    test('is current synchronously inside the scope, and restored after', () => {
        let inner: Zone | undefined;
        let handed: Zone | undefined;

        newZone(() => {
            inner = getZone();
            handed = getZone();
        });

        assert.strictEqual(inner, handed);
        assert.notStrictEqual(inner, rootZone);
        assert.strictEqual(getZone(), rootZone);
    });

    test('survives one await', async () => {
        await scope(async (zone) => {
            await request(1);
            assert.strictEqual(getZone(), zone);
        });
    });

    test('survives two awaits', async () => {
        await scope(async (zone) => {
            await request(1);
            assert.strictEqual(getZone(), zone, 'after 1');
            await request(2);
            assert.strictEqual(getZone(), zone, 'after 2');
        });
    });

    test('survives a chain of twenty awaits', async () => {
        await scope(async (zone) => {
            for (let i = 0; i < 20; i++) {
                await request(i);
                assert.strictEqual(getZone(), zone, `after ${i + 1}`);
            }
        });
    });

    // The one that catches an echo implemented as a stack, or coalesced.
    test('two interleaved scopes each keep their own zone', async () => {
        const run = (label: string) =>
            scope(async (zone) => {
                for (let i = 0; i < 10; i++) {
                    await request(i);
                    assert.strictEqual(getZone(), zone, `${label} @${i + 1}`);
                }
                return label;
            });

        // Deliberately started without awaiting, so they interleave.
        const a = run('A');
        const b = run('B');
        assert.deepEqual(await NexiePromise.all([a, b]), ['A', 'B']);
    });

    test('eight interleaved scopes at staggered depths', async () => {
        const run = (label: string, depth: number) =>
            scope(async (zone) => {
                for (let i = 0; i < depth; i++) {
                    await request(i);
                    assert.strictEqual(getZone(), zone, `${label} @${i + 1}`);
                }
                return label;
            });

        const labels = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
        const runs = labels.map((l, i) => run(l, (i % 5) + 1));
        assert.deepEqual(await NexiePromise.all(runs), labels);
    });

    test('nested scopes restore the outer zone', async () => {
        await scope(async (outer) => {
            await request(1);
            assert.strictEqual(getZone(), outer, 'outer before nesting');

            await scope(async (inner) => {
                assert.notStrictEqual(inner, outer);
                await request(2);
                assert.strictEqual(getZone(), inner, 'inner keeps its own');
            });

            assert.strictEqual(getZone(), outer, 'outer restored');
            await request(3);
            assert.strictEqual(getZone(), outer, 'and survives a later await');
        });
    });

    test('awaiting a promise created in another zone resumes in the awaiting zone', async () => {
        let foreign!: NexiePromise<string>;
        await scope(async () => {
            foreign = request('shared');
        });

        await scope(async (zone) => {
            assert.strictEqual(await foreign, 'shared');
            assert.strictEqual(getZone(), zone);
        });
    });

    test('survives NexiePromise.all of our own thenables', async () => {
        await scope(async (zone) => {
            const values = await NexiePromise.all([
                request(1),
                request(2),
                request(3),
            ]);
            assert.deepEqual(values, [1, 2, 3]);
            assert.strictEqual(getZone(), zone, 'after all()');
            await request(4);
            assert.strictEqual(getZone(), zone, 'and after a further await');
        });
    });

    test('survives an await inside a then callback', async () => {
        await scope(async (zone) => {
            await request(1).then(async (value) => {
                assert.strictEqual(value, 1);
                assert.strictEqual(getZone(), zone, 'in the callback');
                await request(2);
                assert.strictEqual(getZone(), zone, 'after awaiting inside it');
            });
            assert.strictEqual(getZone(), zone, 'back in the scope body');
        });
    });

    test('does not leak the zone after the scope settles', async () => {
        await scope(async () => {
            await request(1);
        });
        assert.strictEqual(getZone(), rootZone, 'immediately after');

        await new Promise<void>((r) => queueMicrotask(r));
        assert.strictEqual(getZone(), rootZone, 'after a bare microtask');

        await new Promise<void>((r) => setTimeout(r, 0));
        assert.strictEqual(getZone(), rootZone, 'after a macrotask');
    });

    test('does not leak into an unrelated native promise chain', async () => {
        const unrelated = Promise.resolve().then(() => getZone());
        void scope(async () => {
            await request(1);
        });
        assert.strictEqual(await unrelated, rootZone);
    });

    test('a caught rejection keeps the zone', async () => {
        await scope(async (zone) => {
            const boom = new NexiePromise<never>((_, reject) =>
                queueMicrotask(() => reject(new Error('boom'))),
            );

            let caught: unknown;
            try {
                await boom;
            } catch (error) {
                caught = error;
            }

            assert.match(String((caught as Error)?.message), /boom/);
            assert.strictEqual(getZone(), zone);
        });
    });
});

suite('zone: the then getter', () => {
    // The load-bearing spec claim, asserted directly rather than inferred:
    // ResolvePromise does Get(resolution, "then") synchronously at the await
    // point, before any job runs.
    test('then is read synchronously at the await point', async () => {
        let readAt: string | null = null;
        let jobRan = false;

        const probe = {
            get then() {
                readAt = jobRan ? 'after a job ran' : 'synchronously';
                return (resolve: (v: number) => void) => resolve(1);
            },
        };

        await (async () => {
            queueMicrotask(() => {
                jobRan = true;
            });
            await probe;
        })();

        assert.strictEqual(readAt, 'synchronously');
    });

    test('captures the zone at access time, not at call time', async () => {
        await scope(async (zone) => {
            const boundThen = request(1).then; // read inside the zone
            assert.strictEqual(getZone(), zone);

            const seen = await new NexiePromise<Zone>((resolve) => {
                queueMicrotask(() => {
                    assert.strictEqual(getZone(), rootZone, 'caller at root');
                    boundThen(() => resolve(getZone()));
                });
            });

            assert.strictEqual(seen, zone, 'delivered into the captured zone');
        });
    });
});

suite('zone: documented failure modes', () => {
    // No hook exists for either of these -- which is exactly why Nexie needs
    // ForeignAwaitError and Nexie.waitFor. Pinned so the detection layer has a
    // concrete behaviour to fire on.
    test('loses the zone across a native promise await', async () => {
        let before = false;
        let after = true;

        await scope(async (zone) => {
            await request(1);
            before = getZone() === zone;
            await new Promise<void>((r) => setTimeout(r, 0));
            after = getZone() === zone;
        });

        assert.isTrue(before, 'ours preserves it');
        assert.isFalse(after, 'native does not');
    });

    test('loses the zone across `await <non-thenable>`', async () => {
        let after = true;

        await scope(async (zone) => {
            await request(1);
            assert.strictEqual(getZone(), zone);
            await 5;
            after = getZone() === zone;
        });

        assert.isFalse(after);
    });
});
