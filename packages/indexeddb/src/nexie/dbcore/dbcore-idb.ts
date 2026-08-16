import { NexiePromise } from '../zone/nexie-promise.ts';
import { bridge, bridgeNonAborting } from './request.ts';
import type {
    DBCore,
    DBCoreMutateRequest,
    DBCoreMutateResponse,
    DBCoreTable,
} from '../types/dbcore.ts';
import type { DbSchema, IndexableType } from '../types/schema.ts';

/**
 * The bottom of the middleware stack: DBCore implemented directly on
 * IndexedDB.
 *
 * Every write in the library funnels through `mutate`, which is what makes a
 * single hooks middleware sufficient to observe them all.
 */
export function createIdbCore(schema: DbSchema): DBCore {
    const tables = new Map<string, DBCoreTable>();

    const core: DBCore = {
        schema,
        table(name: string): DBCoreTable {
            const cached = tables.get(name);
            if (cached) return cached;

            const tableSchema = schema[name]!;
            const store = (request: DBCoreMutateRequest['trans']) =>
                request.idbtrans.objectStore(name);

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
                        store(request.trans).count(request.range ?? undefined),
                    );
                },
            };

            tables.set(name, table);
            return table;
        },
    };

    return core;
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
