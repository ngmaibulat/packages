import { NexiePromise } from '../zone/nexie-promise.ts';
import { bridge, bridgeNonAborting } from './request.ts';
import type {
    DBCore,
    DBCoreCursor,
    DBCoreIndexName,
    DBCoreMutateRequest,
    DBCoreMutateResponse,
    DBCoreOpenCursorRequest,
    DBCoreTable,
} from '../types/dbcore.ts';
import type { Transaction } from '../classes/transaction.ts';
import type { DbSchema, IndexableType } from '../types/schema.ts';

/**
 * The bottom of the middleware stack: DBCore implemented directly on
 * IndexedDB.
 *
 * Every read and every write in the library funnels through here, which is what
 * makes one hooks middleware sufficient to observe all the writes and one
 * observability middleware sufficient to observe all the reads.
 */
export function createIdbCore(name: string, schema: DbSchema): DBCore {
    const tables = new Map<string, DBCoreTable>();

    const core: DBCore = {
        name,
        schema,
        table(name: string): DBCoreTable {
            const cached = tables.get(name);
            if (cached) return cached;

            const tableSchema = schema[name]!;
            const store = (request: DBCoreMutateRequest['trans']) =>
                request.idbtrans.objectStore(name);

            /** The store itself for the primary key, or the named index. */
            const source = (
                trans: Transaction,
                index: DBCoreIndexName | undefined,
            ): IDBObjectStore | IDBIndex => {
                const objectStore = trans.idbtrans.objectStore(name);
                return index === null || index === undefined
                    ? objectStore
                    : objectStore.index(index);
            };

            const table: DBCoreTable = {
                name,
                schema: tableSchema,

                mutate(request) {
                    const objectStore = store(request.trans);

                    if (request.type === 'deleteRange') {
                        const target = request.range;
                        return bridge(
                            target
                                ? objectStore.delete(target)
                                : objectStore.clear(),
                        ).then(() => emptyResponse());
                    }

                    if (request.type === 'delete') {
                        const keys = request.keys ?? [];
                        return runAll(
                            keys.map((key) =>
                                bridgeNonAborting(
                                    objectStore.delete(key as IDBValidKey),
                                ),
                            ),
                            request.wantResults ?? false,
                        );
                    }

                    const values = request.values ?? [];
                    const keys = request.keys;
                    const op = request.type;

                    return runAll(
                        values.map((value, index) => {
                            const key = keys?.[index];
                            // A failure here must not abort the transaction --
                            // that is what lets BulkError report a partial
                            // outcome rather than losing the successful writes.
                            try {
                                return bridgeNonAborting<IDBValidKey>(
                                    key === undefined
                                        ? objectStore[op](value)
                                        : objectStore[op](
                                              value,
                                              key as IDBValidKey,
                                          ),
                                );
                            } catch (error) {
                                return NexiePromise.reject(error);
                            }
                        }),
                        request.wantResults ?? false,
                    );
                },

                get(request) {
                    return bridge(
                        store(request.trans).get(request.key as IDBValidKey),
                    );
                },

                getMany(request) {
                    const objectStore = store(request.trans);
                    return NexiePromise.all(
                        request.keys.map((key) =>
                            bridge(objectStore.get(key as IDBValidKey)),
                        ),
                    );
                },

                count(request) {
                    return bridge(
                        source(request.trans, request.index).count(
                            request.range ?? undefined,
                        ),
                    );
                },

                query(request) {
                    const from = source(request.trans, request.index);
                    const range = request.range ?? undefined;
                    // IndexedDB reads a count of 0 as "no limit", so an
                    // explicit 0 must never reach it. Callers short-circuit
                    // that case; this guards the contract anyway.
                    const limit =
                        request.limit === undefined ||
                        request.limit === Infinity
                            ? undefined
                            : request.limit;

                    return bridge<any[]>(
                        (request.values
                            ? from.getAll(range, limit)
                            : from.getAllKeys(range, limit)) as IDBRequest<any[]>,
                    ).then((result) => ({ result }));
                },

                openCursor(request) {
                    return NexiePromise.resolve(makeCursor(source, request));
                },
            };

            tables.set(name, table);
            return table;
        },
    };

    return core;
}

/**
 * A {@link DBCoreCursor} over a real `IDBCursor`.
 *
 * No request is issued until `start`, which is what lets a middleware inspect
 * (or replace) the request between `openCursor` and the first record.
 */
function makeCursor(
    source: (
        trans: Transaction,
        index: DBCoreIndexName | undefined,
    ) => IDBObjectStore | IDBIndex,
    request: DBCoreOpenCursorRequest,
): DBCoreCursor {
    let idbRequest: IDBRequest<IDBCursor | null> | null = null;
    let resolveWalk: (() => void) | null = null;
    let rejectWalk: ((error: unknown) => void) | null = null;
    let finished = false;

    const currentCursor = (): IDBCursor => idbRequest!.result!;

    const cursor: DBCoreCursor = {
        get key(): IndexableType {
            return currentCursor().key as IndexableType;
        },
        get primaryKey(): IndexableType {
            return currentCursor().primaryKey as IndexableType;
        },
        get value(): any {
            return (idbRequest?.result as IDBCursorWithValue | null | undefined)
                ?.value;
        },

        continue(key?: IndexableType): void {
            if (key === undefined) currentCursor().continue();
            else currentCursor().continue(key as IDBValidKey);
        },

        start(onNext: () => void): NexiePromise<void> {
            return new NexiePromise<void>((resolve, reject) => {
                resolveWalk = resolve;
                rejectWalk = reject;

                const direction = ((request.reverse ? 'prev' : 'next') +
                    (request.unique ? 'unique' : '')) as IDBCursorDirection;
                const from = source(request.trans, request.index);
                const range = request.range ?? undefined;

                idbRequest = (
                    request.keysOnly
                        ? from.openKeyCursor(range, direction)
                        : from.openCursor(range, direction)
                ) as IDBRequest<IDBCursor | null>;

                idbRequest.onerror = () => cursor.fail(idbRequest!.error);
                idbRequest.onsuccess = () => {
                    if (finished) return;
                    if (!idbRequest!.result) {
                        cursor.stop();
                        return;
                    }
                    try {
                        onNext();
                    } catch (error) {
                        // A throwing callback must reject the walk. Left
                        // uncaught it would escape the IDB event dispatch and
                        // the promise would never settle, which reads as a hang.
                        cursor.fail(error);
                    }
                };
            });
        },

        stop(): void {
            if (finished) return;
            finished = true;
            resolveWalk?.();
        },

        fail(error: unknown): void {
            if (finished) return;
            finished = true;
            rejectWalk?.(error);
        },
    };

    return cursor;
}

function emptyResponse(): DBCoreMutateResponse {
    return {
        numFailures: 0,
        failures: {},
        lastResult: undefined,
    };
}

/**
 * Await every operation, collecting failures by their caller-side index rather
 * than rejecting on the first one.
 */
function runAll(
    operations: NexiePromise<unknown>[],
    wantResults: boolean,
): NexiePromise<DBCoreMutateResponse> {
    const failures: Record<number, unknown> = {};
    const results: IndexableType[] = [];
    let numFailures = 0;
    let lastResult: IndexableType | undefined;

    return NexiePromise.all(
        operations.map((operation, index) =>
            operation.then(
                (result) => {
                    results[index] = result as IndexableType;
                    lastResult = result as IndexableType;
                    return undefined;
                },
                (error) => {
                    numFailures++;
                    failures[index] = error;
                    return undefined;
                },
            ),
        ),
    ).then(() => {
        const response: DBCoreMutateResponse = {
            numFailures,
            failures,
            lastResult,
        };
        if (wantResults) response.results = results;
        return response;
    });
}
