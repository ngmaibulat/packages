import { NexiePromise } from '../zone/nexie-promise.ts';

/**
 * The bridge from IndexedDB's event API into our promise engine.
 *
 * Deliberately NOT built on `src/wrap-idb-value.ts`. That module's
 * `promisifyRequest` returns a NATIVE promise, and `await` on a native promise
 * bypasses `.then` entirely -- so the zone would die on every single request and
 * no amount of echoing could rescue it. The low-level `.` entry and this layer
 * therefore stay disjoint graphs, which also means tsdown emits no shared chunk
 * between them and `dist/index.js` is unaffected by anything here.
 *
 * The duplication is about thirty lines and the two have genuinely different
 * contracts: that one hands back a wrapped, proxied value, this one resolves
 * straight into the virtual microtask queue with no proxy in the way.
 */

/** Resolve when the request succeeds, reject with its error if it fails. */
export function bridge<T>(request: IDBRequest<T>): NexiePromise<T> {
    return new NexiePromise<T>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => {
            // Stop the error bubbling to the transaction, which would abort it.
            // Callers that want the abort re-raise explicitly.
            reject(request.error);
        };
    });
}

/**
 * Like {@link bridge}, but prevents the failure from aborting the transaction.
 *
 * `preventDefault()` on the error event is what lets one failed write inside a
 * bulk operation be reported without taking the other writes down with it --
 * the behaviour `BulkError.failures` depends on. `stopPropagation()` is there
 * for the same reason the low-level entry's `ignoreConstraints` needs it.
 */
export function bridgeNonAborting<T>(
    request: IDBRequest<T>,
): NexiePromise<T | undefined> {
    return new NexiePromise<T | undefined>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = (event) => {
            event.preventDefault();
            event.stopPropagation();
            reject(request.error);
        };
    });
}

/** Settles when the transaction completes, rejects if it aborts or errors. */
export function transactionCompletion(
    idbtrans: IDBTransaction,
): NexiePromise<void> {
    return new NexiePromise<void>((resolve, reject) => {
        idbtrans.oncomplete = () => resolve();
        idbtrans.onabort = () => {
            reject(
                idbtrans.error ??
                    new DOMException('A transaction was aborted.', 'AbortError'),
            );
        };
        idbtrans.onerror = (event) => {
            // An error that reaches here has not been handled by the request
            // that raised it, so the transaction is about to abort. Let `onabort`
            // do the rejecting so the reason is consistent.
            event.preventDefault();
        };
    });
}
