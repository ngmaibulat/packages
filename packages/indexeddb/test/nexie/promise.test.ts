import { describe as suite, it as test } from 'node:test';
import { assert } from 'chai';

import { NexiePromise } from '../../src/nexie/zone/nexie-promise.ts';
import { exceptions, NexieError } from '../../src/nexie/errors/errors.ts';

const ConstraintError = exceptions['Constraint']!;

function later<V>(value: V): NexiePromise<V> {
    return new NexiePromise<V>((resolve) =>
        queueMicrotask(() => resolve(value)),
    );
}

function fails(reason: unknown): NexiePromise<never> {
    return new NexiePromise<never>((_, reject) =>
        queueMicrotask(() => reject(reason)),
    );
}

suite('NexiePromise', () => {
    test('is not a native promise, so await reads its then', () => {
        const p = NexiePromise.resolve(1);
        assert.notInstanceOf(p, Promise);
        assert.strictEqual(Object.prototype.toString.call(p), '[object Nexie.Promise]');
    });

    test('resolves, and resolve() is idempotent on an instance', async () => {
        const p = NexiePromise.resolve(42);
        assert.strictEqual(NexiePromise.resolve(p), p);
        assert.strictEqual(await p, 42);
    });

    test('adopts a thenable rather than settling with it', async () => {
        const inner = later(7);
        const outer = new NexiePromise<number>((resolve) => resolve(inner));
        const value = await outer;
        assert.strictEqual(value, 7, 'unwrapped, not handed back the thenable');
    });

    test('adopts a native promise', async () => {
        assert.strictEqual(await NexiePromise.resolve(Promise.resolve(3)), 3);
    });

    test('then chains and transforms', async () => {
        const result = await later(2)
            .then((v) => v * 3)
            .then((v) => `n=${v}`);
        assert.strictEqual(result, 'n=6');
    });

    test('a throw in then rejects the chain', async () => {
        let caught: unknown;
        await later(1)
            .then(() => {
                throw new Error('nope');
            })
            .catch((e) => {
                caught = e;
            });
        assert.match(String((caught as Error).message), /nope/);
    });
});

suite('NexiePromise.catch', () => {
    test('plain form catches everything', async () => {
        const seen = await fails(new Error('x')).catch((e: Error) => e.message);
        assert.strictEqual(seen, 'x');
    });

    test('filtered by constructor', async () => {
        const seen = await fails(new ConstraintError('dup')).catch(
            ConstraintError,
            () => 'handled',
        );
        assert.strictEqual(seen, 'handled');
    });

    test('filtered by error name string', async () => {
        const seen = await fails(new ConstraintError('dup')).catch(
            'ConstraintError',
            () => 'handled',
        );
        assert.strictEqual(seen, 'handled');
    });

    test('a non-matching filter rethrows', async () => {
        let escaped: unknown;
        await fails(new ConstraintError('dup'))
            .catch('AbortError', () => 'wrong handler')
            .catch((e) => {
                escaped = e;
            });
        assert.strictEqual((escaped as NexieError).name, 'ConstraintError');
    });
});

suite('NexiePromise.finally', () => {
    test('runs and passes the value through', async () => {
        let ran = false;
        const value = await later(5).finally(() => {
            ran = true;
        });
        assert.isTrue(ran);
        assert.strictEqual(value, 5);
    });

    test('runs and passes the rejection through', async () => {
        let ran = false;
        let caught: unknown;
        await fails(new Error('boom'))
            .finally(() => {
                ran = true;
            })
            .catch((e) => {
                caught = e;
            });
        assert.isTrue(ran);
        assert.match(String((caught as Error).message), /boom/);
    });

    test('awaits a promise returned from the callback', async () => {
        const order: string[] = [];
        await later('v')
            .finally(() => later('cleanup').then(() => order.push('cleanup')))
            .then(() => order.push('after'));
        assert.deepEqual(order, ['cleanup', 'after']);
    });
});

suite('NexiePromise.timeout', () => {
    test('rejects with a TimeoutError when too slow', async () => {
        const slow = new NexiePromise<number>((resolve) =>
            setTimeout(() => resolve(1), 60),
        );
        let caught: unknown;
        await slow.timeout(5).catch((e) => {
            caught = e;
        });
        assert.strictEqual((caught as Error).name, 'TimeoutError');
    });

    test('passes through when fast enough', async () => {
        assert.strictEqual(await later(9).timeout(1000), 9);
    });

    test('Infinity is a no-op', () => {
        const p = later(1);
        assert.strictEqual(p.timeout(Infinity), p);
    });
});

suite('NexiePromise statics', () => {
    test('all resolves in order', async () => {
        assert.deepEqual(await NexiePromise.all([later(1), 2, later(3)]), [
            1, 2, 3,
        ]);
    });

    test('all of an empty list resolves immediately', async () => {
        assert.deepEqual(await NexiePromise.all([]), []);
    });

    test('all rejects on the first failure', async () => {
        let caught: unknown;
        await NexiePromise.all([later(1), fails(new Error('bad'))]).catch(
            (e) => {
                caught = e;
            },
        );
        assert.match(String((caught as Error).message), /bad/);
    });

    test('race takes the first settled', async () => {
        const slow = new NexiePromise<string>((resolve) =>
            setTimeout(() => resolve('slow'), 50),
        );
        assert.strictEqual(
            await NexiePromise.race([slow, later('fast')]),
            'fast',
        );
    });

    test('allSettled reports both outcomes', async () => {
        const results = await NexiePromise.allSettled([
            later(1),
            fails(new Error('no')),
        ]);
        assert.strictEqual(results[0]?.status, 'fulfilled');
        assert.strictEqual(results[1]?.status, 'rejected');
    });

    test('any takes the first success', async () => {
        const value = await NexiePromise.any([
            fails(new Error('a')),
            later('ok'),
        ]);
        assert.strictEqual(value, 'ok');
    });

    test('any rejects with an AggregateError when all fail', async () => {
        let caught: unknown;
        await NexiePromise.any([
            fails(new Error('a')),
            fails(new Error('b')),
        ]).catch((e) => {
            caught = e;
        });
        assert.strictEqual((caught as Error).name, 'AggregateError');
    });

    test('withResolvers hands back the settlers', async () => {
        const { promise, resolve } = NexiePromise.withResolvers<string>();
        queueMicrotask(() => resolve('done'));
        assert.strictEqual(await promise, 'done');
    });
});

suite('NexiePromise.follow', () => {
    test('waits for fire-and-forget work started inside it', async () => {
        let finished = false;

        await NexiePromise.follow(() => {
            // Deliberately not returned -- this is the on('populate') shape.
            void later(1)
                .then(() => later(2))
                .then(() => {
                    finished = true;
                });
        });

        assert.isTrue(finished, 'follow waited for the whole chain');
    });

    test('resolves when nothing asynchronous was started', async () => {
        let ran = false;
        await NexiePromise.follow(() => {
            ran = true;
        });
        assert.isTrue(ran);
    });

    test('rejects if the body throws synchronously', async () => {
        let caught: unknown;
        await NexiePromise.follow(() => {
            throw new Error('sync boom');
        }).catch((e) => {
            caught = e;
        });
        assert.match(String((caught as Error).message), /sync boom/);
    });
});
