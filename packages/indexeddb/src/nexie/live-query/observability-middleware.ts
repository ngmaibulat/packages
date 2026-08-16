import { isValidKey } from '../functions/cmp.ts';
import { getByKeyPath, isArray } from '../functions/utils.ts';
import { MAX_KEY, MIN_KEY } from '../globals/constants.ts';
import { globalEvents } from '../globals/global-events.ts';
import { NexiePromise } from '../zone/nexie-promise.ts';
import { publishMutations } from './propagate-locally.ts';
import { getSubscr } from '../zone/zone.ts';
import {
    obsKey,
    partOf,
    rangeOf,
    type ObservabilitySet,
} from './obs-set.ts';
import type { Transaction } from '../classes/transaction.ts';
import type {
    DBCore,
    DBCoreIndexName,
    DBCoreMutateRequest,
    DBCoreTable,
    Middleware,
} from '../types/dbcore.ts';
import type { IndexableType, IndexSpec, TableSchema } from '../types/schema.ts';

/**
 * The middleware that makes `liveQuery` possible.
 *
 * Two halves that never meet directly:
 *
 * - **Reads** are recorded into the observation set on the current zone, which
 *   a `liveQuery` querier installs before calling the user's function. A query
 *   that reads nothing observable is a query that will never re-run.
 * - **Writes** are accumulated on the root transaction and published to
 *   `globalEvents.storagemutated` when it COMMITS. Publishing earlier would
 *   announce changes an abort then took back.
 *
 * It sits outermost in the stack, above the hooks middleware. That way the
 * internal read a `creating` hook performs before a write is not mistaken for
 * one of the caller's reads, and the primary keys recorded come from the
 * mutation's own response -- authoritative even when the store generated them.
 *
 * ### Precision, and where it deliberately stops
 *
 * Primary keys are always exact. Secondary indexes are exact for `add` (the new
 * record's keys) and for `put` and `delete`, which additionally read the records
 * they displace so the index entries being REMOVED are known too -- a query on
 * `where('name').equals('old')` has to be woken by a rename, and the new value
 * says nothing about the old one.
 *
 * That read is skipped entirely unless something is actually listening, so an
 * application with no `liveQuery` pays nothing for it. When it is skipped, and
 * for `deleteRange` -- where the displaced set is a whole range and reading it
 * would mean pulling an unbounded number of records into memory to be more
 * precise about invalidating them -- the affected indexes are widened to their
 * full range instead. The direction of that approximation is the point: a
 * superset re-runs a query that need not have re-run, while a subset leaves a
 * view silently stale.
 *
 * Dexie splits the read into a separate `cacheExistingValues` middleware
 * because its query cache consumes it too. There is no query cache here, so a
 * second layer would be a protocol between two files with one caller.
 */

const ALL = { from: MIN_KEY, to: MAX_KEY };

/**
 * The physical keys an index would store for `value` -- plural, because a
 * multiEntry index stores one entry per array element.
 *
 * Anything IndexedDB would refuse to index yields no keys, which is the right
 * answer twice over: the record is genuinely absent from that index, and an
 * invalid key would throw out of `cmp` deep inside a range insert.
 */
function indexKeysOf(index: IndexSpec, value: unknown): IndexableType[] {
    const extracted = getByKeyPath(value, index.keyPath as string | string[]);

    if (isArray(index.keyPath)) {
        // A compound index skips the record entirely unless every component is
        // present.
        const parts = extracted as unknown[];
        return parts.every(isValidKey) ? [parts as IndexableType] : [];
    }

    if (index.multi && isArray(extracted)) {
        return (extracted as unknown[]).filter(isValidKey);
    }

    return isValidKey(extracted) ? [extracted] : [];
}

function secondaryIndexes(schema: TableSchema): readonly IndexSpec[] {
    return schema.indexes;
}

export function createObservabilityMiddleware(): Middleware<DBCore> {
    return {
        stack: 'dbcore',
        name: 'ObservabilityMiddleware',
        // Above the hooks middleware (20), so it observes what the caller asked
        // for rather than what the hooks then did about it.
        level: 30,

        create(down: DBCore): Partial<DBCore> {
            const dbName = down.name;

            return {
                table(tableName: string): DBCoreTable {
                    const table = down.table(tableName);
                    const schema = table.schema;

                    const keyFor = (index: DBCoreIndexName | undefined) =>
                        obsKey(dbName, tableName, index);

                    /** Record a read of `range` on `index`, if anyone is observing. */
                    const observeRead = (
                        index: DBCoreIndexName | undefined,
                        range: { from: IndexableType; to: IndexableType },
                    ): void => {
                        const subscr = getSubscr() as
                            | ObservabilitySet
                            | undefined;
                        if (!subscr) return;
                        partOf(subscr, keyFor(index)).addRange(
                            range.from,
                            range.to,
                        );
                    };

                    const observeKeys = (keys: readonly IndexableType[]): void => {
                        const subscr = getSubscr() as
                            | ObservabilitySet
                            | undefined;
                        if (!subscr) return;
                        partOf(subscr, keyFor(null)).addKeys(keys);
                    };

                    /**
                     * Stage this transaction's changes, and arrange for them to
                     * be published once -- and only if -- it commits.
                     */
                    const mutatedParts = (trans: Transaction): ObservabilitySet => {
                        const root = trans._root();
                        const existing = root._mutatedParts as
                            | ObservabilitySet
                            | undefined;
                        if (existing) return existing;

                        const parts: ObservabilitySet = {};
                        root._mutatedParts = parts;

                        // The rejection handler is not optional: `_completion`
                        // already has its own catch, and adding a bare `.then`
                        // to it would create a second, unhandled rejection out
                        // of every aborted transaction.
                        void root._completion.then(
                            () => {
                                root._mutatedParts = undefined;
                                if (Object.keys(parts).length > 0) {
                                    publishMutations(parts);
                                }
                            },
                            () => {
                                root._mutatedParts = undefined;
                            },
                        );

                        return parts;
                    };

                    /**
                     * The primary keys a `put` or `delete` will displace, as
                     * far as they can be known before the write.
                     *
                     * An insert with a generated key displaces nothing, and
                     * says so by having no key to look up.
                     */
                    const displacedKeys = (
                        request: DBCoreMutateRequest,
                    ): IndexableType[] => {
                        if (request.keys) return [...request.keys];

                        const keyPath = schema.primKey.keyPath;
                        if (keyPath === null) return [];

                        const keys: IndexableType[] = [];
                        for (const value of request.values ?? []) {
                            const key = getByKeyPath(value, keyPath);
                            if (isValidKey(key)) keys.push(key);
                        }
                        return keys;
                    };

                    const recordMutation = (
                        request: DBCoreMutateRequest,
                        resultKeys: readonly IndexableType[],
                        displaced: readonly any[],
                    ): void => {
                        const parts = mutatedParts(request.trans);
                        const primary = partOf(parts, keyFor(null));

                        if (request.type === 'deleteRange') {
                            const range = rangeOf(request.range);
                            primary.addRange(range.from, range.to);
                        } else {
                            const keys =
                                resultKeys.length > 0
                                    ? resultKeys
                                    : (request.keys ?? []);
                            if (keys.length > 0) primary.addKeys(keys);
                            else primary.addRange(ALL.from, ALL.to);
                        }

                        // An `add` cannot displace anything, so its new keys are
                        // the whole story. A `put` or `delete` is exact only if
                        // the records it displaced were read first.
                        const exact =
                            request.type === 'add' ||
                            ((request.type === 'put' ||
                                request.type === 'delete') &&
                                displaced.length > 0);

                        for (const index of secondaryIndexes(schema)) {
                            const part = partOf(parts, keyFor(index.name));
                            if (!exact) {
                                part.addRange(ALL.from, ALL.to);
                                continue;
                            }
                            for (const value of request.values ?? []) {
                                part.addKeys(indexKeysOf(index, value));
                            }
                            for (const value of displaced) {
                                if (value === undefined) continue;
                                part.addKeys(indexKeysOf(index, value));
                            }
                        }
                    };

                    return {
                        ...table,

                        mutate(request) {
                            // The displacement read is worth doing only when
                            // something is listening AND there is a secondary
                            // index whose precision it would buy.
                            const wantsDisplaced =
                                globalEvents.storagemutated.hasSubscribers &&
                                secondaryIndexes(schema).length > 0 &&
                                (request.type === 'put' ||
                                    request.type === 'delete');

                            const keys = wantsDisplaced
                                ? displacedKeys(request)
                                : [];

                            const before =
                                keys.length > 0
                                    ? table.getMany({
                                          trans: request.trans,
                                          keys,
                                      })
                                    : NexiePromise.resolve([] as any[]);

                            // Ask for the resulting keys even when the caller
                            // did not: `runAll` collects them regardless, so
                            // this costs nothing and is the only way to learn
                            // the key of an auto-incremented insert.
                            return before.then((displaced) =>
                                table
                                    .mutate({ ...request, wantResults: true })
                                    .then((response) => {
                                        recordMutation(
                                            request,
                                            (response.results ?? []).filter(
                                                (key) => key !== undefined,
                                            ),
                                            displaced,
                                        );
                                        return response;
                                    }),
                            );
                        },

                        get(request) {
                            observeKeys([request.key]);
                            return table.get(request);
                        },

                        getMany(request) {
                            observeKeys(request.keys);
                            return table.getMany(request);
                        },

                        count(request) {
                            observeRead(request.index, rangeOf(request.range));
                            return table.count(request);
                        },

                        query(request) {
                            observeRead(request.index, rangeOf(request.range));
                            return table.query(request);
                        },

                        openCursor(request) {
                            observeRead(request.index, rangeOf(request.range));
                            return table.openCursor(request);
                        },
                    };
                },
            };
        },
    };
}
