import { NexiePromise } from '../zone/nexie-promise.ts';
import { newZone } from '../zone/zone.ts';
import type { Nexie } from './nexie.ts';
import type { Transaction } from './transaction.ts';

/**
 * Run a single operation in a transaction of its own.
 *
 * This is what makes `db.friends.get(1)` work outside any `db.transaction()`
 * scope. The operation still runs inside a zone carrying the transaction, so
 * anything it triggers -- a read hook, a nested table call -- joins it rather
 * than opening a second one.
 */
export function tempTransaction<R>(
    db: Nexie,
    mode: IDBTransactionMode,
    storeNames: string[],
    fn: (trans: Transaction) => R | PromiseLike<R>,
    bWriteLock?: boolean,
): NexiePromise<R> {
    if (!db.isOpen()) {
        // autoOpen: the first operation on a closed db opens it.
        if (!db._options.autoOpen) {
            return NexiePromise.reject(db._closedError());
        }
        return db
            .open()
            .then(() => tempTransaction(db, mode, storeNames, fn, bWriteLock));
    }

    const trans = db._createTransaction(mode, storeNames);
    trans.create();

    return newZone(
        () =>
            NexiePromise.resolve(
                trans._promise(mode, () => fn(trans), bWriteLock),
            ).then((result) =>
                // Resolve only once the transaction has actually committed, so a
                // caller that awaits a write knows it is durable.
                trans._completion.then(() => result),
            ),
        { trans, transless: undefined },
    );
}
