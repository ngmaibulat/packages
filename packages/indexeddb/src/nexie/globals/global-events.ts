import { rootZone, runInZone } from '../zone/zone.ts';
import type { ObservabilitySet } from '../live-query/obs-set.ts';

/**
 * Process-wide events, currently just one: `storagemutated`.
 *
 * Module-global rather than per-database on purpose. A `liveQuery` has to see
 * writes made through any connection to the same database -- a second
 * `new Nexie('friends')` in the same page is a different `Nexie` instance over
 * the same store, and a query that ignored its writes would go stale with no
 * indication. Cross-TAB propagation is the same argument one level up; see
 * propagate-locally.ts.
 */

export type StorageMutatedListener = (parts: ObservabilitySet) => void;

const listeners = new Set<StorageMutatedListener>();

export const globalEvents = {
    storagemutated: {
        subscribe(listener: StorageMutatedListener): void {
            listeners.add(listener);
        },

        unsubscribe(listener: StorageMutatedListener): void {
            listeners.delete(listener);
        },

        get hasSubscribers(): boolean {
            return listeners.size > 0;
        },

        /**
         * A listener that throws must not stop the others, and must not take
         * down the transaction whose commit fired this.
         *
         * Listeners run in the root zone. This fires from the committing
         * transaction's completion, inside that transaction's zone -- and a
         * listener is not part of that transaction. Left as is, a `liveQuery`
         * woken by a commit would run its observer inside a transaction that
         * has just ended.
         */
        fire(parts: ObservabilitySet): void {
            for (const listener of [...listeners]) {
                try {
                    runInZone(rootZone, listener, parts);
                } catch (error) {
                    queueMicrotask(() => {
                        throw error;
                    });
                }
            }
        },
    },
};
