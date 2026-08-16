import { globalEvents } from '../globals/global-events.ts';
import { NexiePromise } from '../zone/nexie-promise.ts';
import { newZone } from '../zone/zone.ts';
import { listenForRemoteMutations } from './propagate-locally.ts';
import { obsSetsOverlap, type ObservabilitySet } from './obs-set.ts';

/**
 * `liveQuery` -- a query that re-runs itself when its own result could have
 * changed.
 *
 * ```ts
 * const subscription = liveQuery(() =>
 *     db.friends.where('age').above(25).toArray(),
 * ).subscribe((friends) => render(friends));
 * ```
 *
 * The querier runs inside a zone that records every read it makes (see
 * observability-middleware.ts). That set of key ranges is then compared against
 * what each committed transaction wrote, and the query re-runs only on an
 * intersection -- so a `liveQuery` over `db.friends.get(7)` ignores every write
 * to every other friend.
 *
 * **The querier must await only Nexie promises.** Awaiting a native promise --
 * `fetch`, a bare `setTimeout` wrapper, a foreign library -- loses the zone, and
 * reads made after that point are not recorded. The query still works; it just
 * stops re-running for those reads. `Nexie.waitFor()` is the escape hatch, and
 * doing the foreign work OUTSIDE the querier is better still.
 */

export interface Subscription {
    unsubscribe(): void;
    readonly closed: boolean;
}

export interface Observer<T> {
    next?: (value: T) => void;
    error?: (error: unknown) => void;
    complete?: () => void;
}

export interface Observable<T> {
    subscribe(observer: Observer<T>): Subscription;
    subscribe(
        next?: (value: T) => void,
        error?: (error: unknown) => void,
        complete?: () => void,
    ): Subscription;
}

/**
 * The rxjs interop key.
 *
 * Read off `Symbol` rather than declared on it: Dexie augments the global
 * `SymbolConstructor`, which leaks into every consumer's type environment for
 * the benefit of one interop point. `'@@observable'` is the fallback rxjs
 * itself uses when no polyfill has defined the symbol.
 */
const OBSERVABLE_KEY: symbol | string =
    (Symbol as { observable?: symbol }).observable ?? '@@observable';

function toObserver<T>(
    observerOrNext?: Observer<T> | ((value: T) => void),
    error?: (error: unknown) => void,
    complete?: () => void,
): Observer<T> {
    return typeof observerOrNext === 'function'
        ? { next: observerOrNext, error, complete }
        : (observerOrNext ?? {});
}

export function liveQuery<T>(querier: () => T | PromiseLike<T>): Observable<T> {
    const observable = {
        subscribe(
            observerOrNext?: Observer<T> | ((value: T) => void),
            error?: (error: unknown) => void,
            complete?: () => void,
        ): Subscription {
            const observer = toObserver(observerOrNext, error, complete);

            let closed = false;
            let running = false;
            /** A mutation landed while the querier was in flight. */
            let restart = false;
            let observed: ObservabilitySet | null = null;

            const run = (): void => {
                if (closed) return;
                if (running) {
                    // Whatever this run is about to report was read before the
                    // write landed, so it is already stale. Re-run rather than
                    // race it.
                    restart = true;
                    return;
                }

                running = true;
                restart = false;

                const subscr: ObservabilitySet = {};

                // The zone has to be entered synchronously here, not inside a
                // `.then`: it is what the querier's very first read looks up.
                NexiePromise.resolve(
                    newZone(() => querier(), { subscr }),
                ).then(
                    (value) => {
                        running = false;
                        observed = subscr;
                        if (closed) return;
                        if (restart) {
                            run();
                            return;
                        }
                        observer.next?.(value);
                    },
                    (failure) => {
                        running = false;
                        observed = subscr;
                        if (closed) return;
                        if (restart) {
                            run();
                            return;
                        }
                        // A failed query still gets to re-run: whatever it
                        // managed to read before failing is recorded, so a
                        // later write that fixes the cause revives it.
                        observer.error?.(failure);
                    },
                );
            };

            const onMutated = (parts: ObservabilitySet): void => {
                if (closed) return;
                // Before the first run finishes there is nothing to compare
                // against, and the run in flight is already covered by `restart`.
                if (!observed) {
                    if (running) restart = true;
                    return;
                }
                if (obsSetsOverlap(observed, parts)) run();
            };

            // Opened here rather than at module load: a channel nobody is
            // listening on is a handle held for nothing.
            listenForRemoteMutations();
            globalEvents.storagemutated.subscribe(onMutated);
            run();

            return {
                get closed() {
                    return closed;
                },
                unsubscribe(): void {
                    if (closed) return;
                    closed = true;
                    globalEvents.storagemutated.unsubscribe(onMutated);
                },
            };
        },
    };

    // Attached rather than declared: see OBSERVABLE_KEY.
    (observable as Record<string | symbol, unknown>)[OBSERVABLE_KEY] = () =>
        observable;

    return observable as Observable<T>;
}
