import { enqueue, atEndOfTick } from './scheduler.ts';
import {
    getZone,
    newZone,
    release,
    retain,
    runInZone,
    type Zone,
} from './zone.ts';

/**
 * NexiePromise -- the `PromiseExtended` implementation, and a genuinely
 * non-native thenable rather than a `Promise` subclass.
 *
 * That is not a stylistic choice. For `await x`, the spec does
 * `PromiseResolve(%Promise%, x)`: if `x` is a native promise whose constructor
 * is `%Promise%`, it is returned as-is and the engine uses the internal
 * `PerformPromiseThen` slot, so an overridden `.then` is never consulted. Only
 * a non-native thenable gets `PromiseResolveThenableJob`, which is the single
 * hook the zone design depends on.
 *
 * The invariant that keeps the engine honest: **a NexiePromise never settles
 * fulfilled with a thenable.** Adoption happens inside `_resolve`, so a settled
 * instance always carries a plain value and resolving the awaiting promise
 * enqueues exactly one reaction job.
 */

const PENDING = 0;
const FULFILLED = 1;
const REJECTED = 2;

type State = typeof PENDING | typeof FULFILLED | typeof REJECTED;

interface Listener {
    zone: Zone;
    onFulfilled: (value: unknown) => void;
    onRejected: (reason: unknown) => void;
}

export type Fulfilled<T, R> =
    | ((value: T) => R | PromiseLike<R>)
    | undefined
    | null;
export type Rejected<R> =
    | ((reason: any) => R | PromiseLike<R>)
    | undefined
    | null;

/** Matches an error by constructor or by `error.name`. */
type ErrorFilter = (new (...args: any[]) => unknown) | string;

function isThenable(value: unknown): value is PromiseLike<unknown> {
    return (
        value !== null &&
        (typeof value === 'object' || typeof value === 'function') &&
        typeof (value as PromiseLike<unknown>).then === 'function'
    );
}

export class NexiePromise<T> implements PromiseLike<T> {
    /**
     * Normalises rejection reasons library-wide. `errors.ts` installs
     * `mapError` here, which is how a raw `DOMException` becomes the matching
     * NexieError subclass without every call site having to convert.
     */
    static rejectionMapper: (reason: unknown) => unknown = (reason) => reason;

    /**
     * Assert the engine's own invariant. Surfaced as `Nexie.debug`.
     *
     * The echo FIFO is kept 1:1 with pending native resume jobs, which holds
     * only while a settlement enqueues exactly one reaction. Fulfilling with a
     * thenable would slide a `PromiseResolveThenableJob` in between and
     * desynchronise it -- and the damage is a zone silently attributed to the
     * wrong continuation, not an exception. Adoption happens inside `_resolve`,
     * so this should be unreachable; that is exactly why it is worth asserting.
     */
    static debug = false;

    private _state: State = PENDING;
    private _value: unknown = undefined;
    private _listeners: Listener[] = [];
    private readonly _zone: Zone;

    constructor(
        executor?: (
            resolve: (value: T | PromiseLike<T>) => void,
            reject: (reason?: unknown) => void,
        ) => void,
    ) {
        this._zone = getZone();
        retain(this._zone);

        if (executor) {
            try {
                executor(
                    (value) => this._resolve(value),
                    (reason) => this._reject(reason),
                );
            } catch (error) {
                this._reject(error);
            }
        }
    }

    get [Symbol.toStringTag](): string {
        return 'Nexie.Promise';
    }

    // ------------------------------------------------------------ settling

    private _resolve(value: unknown): void {
        if (this._state !== PENDING) return;

        if (isThenable(value)) {
            // Adopt here, inside the engine, so we never settle with a thenable.
            let settled = false;
            try {
                value.then(
                    (inner) => {
                        if (settled) return;
                        settled = true;
                        this._resolve(inner);
                    },
                    (reason) => {
                        if (settled) return;
                        settled = true;
                        this._settle(REJECTED, reason);
                    },
                );
            } catch (error) {
                if (!settled) {
                    settled = true;
                    this._settle(REJECTED, error);
                }
            }
            return;
        }

        this._settle(FULFILLED, value);
    }

    private _reject(reason: unknown): void {
        if (this._state === PENDING) {
            this._settle(REJECTED, NexiePromise.rejectionMapper(reason));
        }
    }

    private _settle(state: State, value: unknown): void {
        if (
            NexiePromise.debug &&
            state === FULFILLED &&
            isThenable(value)
        ) {
            throw new Error(
                'Nexie internal invariant violated: a NexiePromise fulfilled with a ' +
                    'thenable. Adoption must happen inside the engine, or the zone echo ' +
                    'desynchronises.',
            );
        }

        this._state = state;
        this._value = value;

        const listeners = this._listeners;
        this._listeners = [];
        for (const listener of listeners) this._schedule(listener);

        release(this._zone);
    }

    private _schedule(listener: Listener): void {
        // Retain across the enqueue, not just across the job: a chain
        // `p.then(a).then(b)` would otherwise hit zero between `a` returning and
        // `b` being enqueued, and `follow()` would resolve early.
        retain(listener.zone);
        enqueue(() => {
            const handler =
                this._state === FULFILLED
                    ? listener.onFulfilled
                    : listener.onRejected;
            try {
                runInZone(listener.zone, handler, this._value);
            } finally {
                release(listener.zone);
            }
        });
    }

    // -------------------------------------------------------------- then

    /**
     * A getter, and that is the whole trick.
     *
     * `ResolvePromise` performs `Get(resolution, "then")` SYNCHRONOUSLY at the
     * await point and only afterwards enqueues `PromiseResolveThenableJob` with
     * the already-read function. Reading the property is therefore a synchronous
     * hook at exactly the moment the awaiting code suspends, where the current
     * zone is still correct by construction. The returned closure carries that
     * zone, so it no longer matters what the current zone happens to be when the
     * thenable job eventually runs.
     *
     * A plain `p.then(cb)` reads the same property in the same expression and so
     * captures the same, equally correct, zone.
     */
    get then(): <R1 = T, R2 = never>(
        onFulfilled?: Fulfilled<T, R1>,
        onRejected?: Rejected<R2>,
    ) => NexiePromise<R1 | R2> {
        const zoneAtAccess = getZone();
        return (onFulfilled, onRejected) =>
            this._thenIn(zoneAtAccess, onFulfilled, onRejected);
    }

    /** Registers a continuation in an explicit zone. */
    _thenIn<R1 = T, R2 = never>(
        zone: Zone,
        onFulfilled?: Fulfilled<T, R1>,
        onRejected?: Rejected<R2>,
    ): NexiePromise<R1 | R2> {
        const result = new NexiePromise<R1 | R2>();

        const listener: Listener = {
            zone,
            onFulfilled: (value) => {
                try {
                    result._resolve(
                        onFulfilled ? onFulfilled(value as T) : (value as R1),
                    );
                } catch (error) {
                    result._reject(error);
                }
            },
            onRejected: (reason) => {
                if (onRejected) {
                    try {
                        result._resolve(onRejected(reason));
                    } catch (error) {
                        result._reject(error);
                    }
                } else {
                    result._reject(reason);
                }
            },
        };

        if (this._state === PENDING) this._listeners.push(listener);
        else this._schedule(listener);

        return result;
    }

    // ------------------------------------------------------------- catch

    catch<R = never>(onRejected?: Rejected<R>): NexiePromise<T | R>;
    catch<R = never>(
        filter: ErrorFilter,
        onRejected: (reason: any) => R | PromiseLike<R>,
    ): NexiePromise<T | R>;
    catch<R = never>(
        filterOrHandler?: ErrorFilter | Rejected<R>,
        maybeHandler?: (reason: any) => R | PromiseLike<R>,
    ): NexiePromise<T | R> {
        const zone = getZone();

        if (maybeHandler === undefined) {
            return this._thenIn<T, R>(
                zone,
                undefined,
                filterOrHandler as Rejected<R>,
            );
        }

        // Filtered form: `.catch(ConstraintError, h)` or `.catch('ConstraintError', h)`.
        // Matching on `error.name` as well as `instanceof` is what makes this
        // work across realms, where the constructor identity differs.
        const filter = filterOrHandler as ErrorFilter;
        const matches =
            typeof filter === 'string'
                ? (error: any) => error?.name === filter
                : (error: any) => error instanceof filter;

        return this._thenIn<T, T | R>(zone, undefined, (reason) => {
            if (matches(reason)) return maybeHandler(reason);
            throw reason;
        });
    }

    // ----------------------------------------------------------- finally

    finally(onFinally?: (() => unknown) | undefined | null): NexiePromise<T> {
        if (typeof onFinally !== 'function') return this;
        const zone = getZone();

        return this._thenIn<T, T>(
            zone,
            (value) =>
                NexiePromise.resolve(onFinally())._thenIn<T, never>(
                    zone,
                    () => value,
                ),
            (reason) =>
                NexiePromise.resolve(onFinally())._thenIn<never, never>(
                    zone,
                    () => {
                        throw reason;
                    },
                ),
        );
    }

    // ----------------------------------------------------------- timeout

    /**
     * Rejects with a `TimeoutError` if not settled within `ms`.
     *
     * Uses `setTimeout`, which is a task, so a transaction is long gone by the
     * time it fires -- this is for use outside a transaction scope.
     */
    timeout(ms: number, message?: string): NexiePromise<T> {
        if (!(ms < Infinity)) return this;

        return new NexiePromise<T>((resolve, reject) => {
            const handle = setTimeout(() => {
                const error: Error & { name: string } = new Error(
                    message ?? `Operation timed out after ${ms} ms`,
                );
                error.name = 'TimeoutError';
                reject(error);
            }, ms);

            this._thenIn(
                getZone(),
                (value) => {
                    clearTimeout(handle);
                    resolve(value);
                },
                (reason) => {
                    clearTimeout(handle);
                    reject(reason);
                },
            );
        });
    }

    // ----------------------------------------------------------- statics

    static resolve(): NexiePromise<void>;
    static resolve<V>(value: V | PromiseLike<V>): NexiePromise<V>;
    static resolve<V>(value?: V | PromiseLike<V>): NexiePromise<V> {
        if (value instanceof NexiePromise) return value as NexiePromise<V>;
        const promise = new NexiePromise<V>();
        promise._resolve(value);
        return promise;
    }

    static reject<V = never>(reason?: unknown): NexiePromise<V> {
        const promise = new NexiePromise<V>();
        promise._reject(reason);
        return promise;
    }

    static withResolvers<V>(): {
        promise: NexiePromise<V>;
        resolve: (value: V | PromiseLike<V>) => void;
        reject: (reason?: unknown) => void;
    } {
        let resolve!: (value: V | PromiseLike<V>) => void;
        let reject!: (reason?: unknown) => void;
        const promise = new NexiePromise<V>((res, rej) => {
            resolve = res;
            reject = rej;
        });
        return { promise, resolve, reject };
    }

    static all<V>(items: Iterable<V | PromiseLike<V>>): NexiePromise<V[]> {
        return new NexiePromise<V[]>((resolve, reject) => {
            const results: V[] = [];
            let remaining = 0;
            let iterated = false;

            for (const item of items) {
                const index = remaining++;
                NexiePromise.resolve(item).then((value) => {
                    results[index] = value;
                    if (--remaining === 0 && iterated) resolve(results);
                }, reject);
            }

            iterated = true;
            if (remaining === 0) resolve(results);
        });
    }

    static race<V>(items: Iterable<V | PromiseLike<V>>): NexiePromise<V> {
        return new NexiePromise<V>((resolve, reject) => {
            for (const item of items) {
                NexiePromise.resolve(item).then(resolve, reject);
            }
        });
    }

    static allSettled<V>(
        items: Iterable<V | PromiseLike<V>>,
    ): NexiePromise<PromiseSettledResult<V>[]> {
        return new NexiePromise<PromiseSettledResult<V>[]>((resolve) => {
            const results: PromiseSettledResult<V>[] = [];
            let remaining = 0;
            let iterated = false;

            const settle = (index: number, result: PromiseSettledResult<V>) => {
                results[index] = result;
                if (--remaining === 0 && iterated) resolve(results);
            };

            for (const item of items) {
                const index = remaining++;
                NexiePromise.resolve(item).then(
                    (value) => settle(index, { status: 'fulfilled', value }),
                    (reason) => settle(index, { status: 'rejected', reason }),
                );
            }

            iterated = true;
            if (remaining === 0) resolve(results);
        });
    }

    static any<V>(items: Iterable<V | PromiseLike<V>>): NexiePromise<V> {
        return new NexiePromise<V>((resolve, reject) => {
            const errors: unknown[] = [];
            let remaining = 0;
            let iterated = false;

            const fail = (index: number, reason: unknown) => {
                errors[index] = reason;
                if (--remaining === 0 && iterated) {
                    const error: Error & { errors?: unknown[] } = new Error(
                        'All promises were rejected',
                    );
                    error.name = 'AggregateError';
                    error.errors = errors;
                    reject(error);
                }
            };

            for (const item of items) {
                const index = remaining++;
                NexiePromise.resolve(item).then(resolve, (reason) =>
                    fail(index, reason),
                );
            }

            iterated = true;
            if (remaining === 0) fail(-1, undefined);
        });
    }

    /**
     * Run `fn` in a fresh zone and resolve once every promise transitively
     * created inside it has settled -- Dexie's `Promise.follow`.
     *
     * This is what lets `on('populate')` and `version().upgrade()` fire off
     * operations without returning them, and still be waited on.
     */
    static follow(fn: () => void, props?: Partial<Zone>): NexiePromise<void> {
        return new NexiePromise<void>((resolve, reject) => {
            newZone(() => {
                const zone = getZone();
                // Compose, never replace. `newZone` has already installed a
                // finalize that decrements the PARENT's counter, and dropping
                // it strands the parent at a non-zero count forever. That only
                // bites when one follow sits inside another -- an `on('populate')`
                // subscriber opening a transaction scope, say -- and the symptom
                // is a database that opens and never resolves.
                const parentFinalize = zone.finalize;
                zone.finalize = () => {
                    parentFinalize();
                    // Quiescence is only meaningful once the virtual queue has
                    // drained: the counter can legitimately touch zero mid-tick.
                    atEndOfTick(() => {
                        if (zone.pending === 0) resolve();
                    });
                };
                try {
                    fn();
                } catch (error) {
                    reject(error);
                    return;
                }
                // Nothing asynchronous was started.
                if (zone.pending === 0) atEndOfTick(() => resolve());
            }, props);
        });
    }
}
