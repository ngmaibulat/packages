import { exceptions } from '../errors/errors.ts';
import { NexiePromise } from '../zone/nexie-promise.ts';
import { getZone } from '../zone/zone.ts';
import type { Nexie } from './nexie.ts';
import type { Transaction } from './transaction.ts';

const PrematureCommitError = exceptions['PrematureCommit']!;

type ScopeFunc<R> = (trans: Transaction) => R | PromiseLike<R>;

function isThenable(value: unknown): value is PromiseLike<unknown> {
    return (
        value !== null &&
        typeof value === 'object' &&
        typeof (value as PromiseLike<unknown>).then === 'function'
    );
}

/**
 * Run an explicit `db.transaction(...)` scope.
 *
 * The scope function is invoked inside a zone carrying the transaction, which
 * is what lets `db.friends.add(x)` in its body join it without being handed
 * anything. `NexiePromise.follow` covers the fire-and-forget shape, where the
 * body starts operations without returning them.
 */
export function enterTransactionScope<R>(
    db: Nexie,
    idbMode: IDBTransactionMode,
    storeNames: string[],
    parent: Transaction | undefined,
    scopeFunc: ScopeFunc<R>,
): NexiePromise<R> {
    // Hop into our engine first, so everything below runs on the virtual queue.
    return NexiePromise.resolve().then(() => {
        const trans = db._createTransaction(idbMode, storeNames, parent);
        trans.explicit = true;
        // Created eagerly so `complete`/`abort` fire even for an empty scope.
        trans.create();

        const zone = getZone();
        const zoneProps = {
            trans,
            transless: zone.transless ?? zone,
        };

        let returned: unknown;
        const followed = NexiePromise.follow(() => {
            returned = scopeFunc.call(trans, trans);
        }, zoneProps);

        const settled = isThenable(returned)
            ? NexiePromise.resolve(returned).then((value) => {
                  if (!trans.active) {
                      // Prefer the recorded cause: an explicit abort(), or the
                      // error that aborted the transaction, is far more useful
                      // than the generic diagnosis below.
                      if (trans._completionError) throw trans._completionError;

                      // Otherwise the transaction ended while the body was away
                      // -- almost always an await on something outside our engine.
                      throw new PrematureCommitError(
                          'Transaction committed too early. Await the operations you start, ' +
                              'and wrap any foreign promise in Nexie.waitFor().',
                      );
                  }
                  return value as R;
              })
            : followed.then(() => returned as R);

        return settled
            .then((value) => {
                // A sub-transaction reports success to its parent rather than
                // waiting on an IDB commit it does not own.
                if (parent) trans._resolve();
                return trans._completion.then(() => value);
            })
            .catch((error) => {
                trans._reject(error);
                throw error;
            });
    });
}
