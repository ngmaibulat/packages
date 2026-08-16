import {
    createEvent,
    nop,
    type NexieEvent,
} from '../functions/events.ts';
import {
    hookCreatingChain,
    hookDeletingChain,
    hookUpdatingChain,
    pureFunctionChain,
    type HookContext,
} from '../functions/chaining.ts';
import { getByKeyPath, isArray, setByKeyPath } from '../functions/utils.ts';
import { NexiePromise } from '../zone/nexie-promise.ts';
import type {
    DBCore,
    DBCoreMutateRequest,
    DBCoreMutateResponse,
    DBCoreTable,
    Middleware,
} from '../types/dbcore.ts';
import type { IndexableType, TableSchema } from '../types/schema.ts';

/**
 * The four CRUD hooks, and the middleware that fires them.
 *
 * `creating` and `updating` are distinguished by whether the record already
 * exists, which means a `put` with either hook subscribed has to read before it
 * writes. That read is skipped entirely when nothing is listening -- the whole
 * design is built so the unsubscribed path costs one call to a no-op.
 */

export interface TableHooks {
    (
        eventName: 'creating',
        subscriber: (
            this: HookContext,
            primKey: any,
            obj: any,
            transaction: any,
        ) => any,
    ): void;
    (
        eventName: 'reading',
        subscriber: (obj: any) => any,
    ): void;
    (
        eventName: 'updating',
        subscriber: (
            this: HookContext,
            modifications: any,
            primKey: any,
            obj: any,
            transaction: any,
        ) => any,
    ): void;
    (
        eventName: 'deleting',
        subscriber: (
            this: HookContext,
            primKey: any,
            obj: any,
            transaction: any,
        ) => any,
    ): void;

    creating: NexieEvent;
    reading: NexieEvent;
    updating: NexieEvent;
    deleting: NexieEvent;
}

/** Lazily attach the hook event set to a table schema. */
export function getTableHooks(schema: TableSchema): TableHooks {
    const existing = (schema as { hooks?: TableHooks }).hooks;
    if (existing) return existing;

    const creating = createEvent(hookCreatingChain, nop);
    const reading = createEvent(pureFunctionChain, (value: unknown) => value);
    const updating = createEvent(hookUpdatingChain, nop);
    const deleting = createEvent(hookDeletingChain, nop);

    const hooks = function (
        eventName: 'creating' | 'reading' | 'updating' | 'deleting',
        subscriber: (...args: any[]) => any,
    ) {
        const event = hooks[eventName];
        if (!event) throw new TypeError(`Unknown hook: ${eventName}`);
        event.subscribe(subscriber);

        // The read hook doubles as the collection's value mapper, so wiring it
        // here means every read path picks it up without further plumbing.
        if (eventName === 'reading') {
            schema.readHook = reading.fire as (value: any) => any;
        }
        return hooks;
    } as unknown as TableHooks;

    Object.defineProperties(hooks, {
        creating: { value: creating, enumerable: true },
        reading: { value: reading, enumerable: true },
        updating: { value: updating, enumerable: true },
        deleting: { value: deleting, enumerable: true },
    });

    (schema as { hooks?: TableHooks }).hooks = hooks;
    return hooks;
}

function primaryKeyOf(
    schema: TableSchema,
    value: unknown,
    explicitKey: IndexableType | undefined,
): IndexableType | undefined {
    if (explicitKey !== undefined) return explicitKey;
    const keyPath = schema.primKey.keyPath;
    if (keyPath === null) return undefined;
    return getByKeyPath(value, keyPath) as IndexableType | undefined;
}

/**
 * Compute what changed between the stored record and the one being written, as
 * a flat keyPath -> value map. That is the shape an `updating` subscriber
 * receives and may add to.
 */
function diff(existing: unknown, incoming: unknown): Record<string, unknown> {
    const changes: Record<string, unknown> = {};

    const walk = (from: any, to: any, prefix: string): void => {
        const fromKeys = from && typeof from === 'object' ? Object.keys(from) : [];
        const toKeys = to && typeof to === 'object' ? Object.keys(to) : [];

        for (const key of new Set([...fromKeys, ...toKeys])) {
            const path = prefix ? `${prefix}.${key}` : key;
            const before = from?.[key];
            const after = to?.[key];

            if (
                before &&
                after &&
                typeof before === 'object' &&
                typeof after === 'object' &&
                !isArray(before) &&
                !isArray(after) &&
                !(before instanceof Date) &&
                !(after instanceof Date)
            ) {
                walk(before, after, path);
                continue;
            }
            if (before !== after) changes[path] = after;
        }
    };

    walk(existing, incoming, '');
    return changes;
}

export function createHooksMiddleware(): Middleware<DBCore> {
    return {
        stack: 'dbcore',
        name: 'HooksMiddleware',
        level: 20,
        create(down: DBCore): Partial<DBCore> {
            return {
                table(name: string): DBCoreTable {
                    const table = down.table(name);
                    const hooks = getTableHooks(table.schema);

                    return {
                        ...table,
                        mutate(
                            request: DBCoreMutateRequest,
                        ): NexiePromise<DBCoreMutateResponse> {
                            const wantsCreate = hooks.creating.hasSubscribers;
                            const wantsUpdate = hooks.updating.hasSubscribers;
                            const wantsDelete = hooks.deleting.hasSubscribers;

                            // The fast path: nothing subscribed, nothing to do.
                            if (!wantsCreate && !wantsUpdate && !wantsDelete) {
                                return table.mutate(request);
                            }

                            if (request.type === 'deleteRange') {
                                // Range deletes carry no keys, so a deleting
                                // hook needs them resolved first. Left to the
                                // caller: Collection.delete() only takes the
                                // range path when no hook is subscribed.
                                return table.mutate(request);
                            }

                            if (request.type === 'delete') {
                                if (!wantsDelete) return table.mutate(request);
                                return applyDeleteHooks(
                                    table,
                                    hooks,
                                    request,
                                );
                            }

                            if (!wantsCreate && !wantsUpdate) {
                                return table.mutate(request);
                            }
                            return applyWriteHooks(table, hooks, request);
                        },
                    };
                },
            };
        },
    };
}

function applyDeleteHooks(
    table: DBCoreTable,
    hooks: TableHooks,
    request: DBCoreMutateRequest,
): NexiePromise<DBCoreMutateResponse> {
    const keys = (request.keys ?? []) as IndexableType[];

    return table
        .getMany({ trans: request.trans, keys })
        .then((existing) => {
            const contexts: HookContext[] = keys.map((key, index) => {
                const context: HookContext = {};
                if (existing[index] !== undefined) {
                    hooks.deleting.fire.call(
                        context,
                        key,
                        existing[index],
                        request.trans,
                    );
                }
                return context;
            });

            return table.mutate(request).then((response) => {
                notify(contexts, response, keys.length);
                return response;
            });
        });
}

function applyWriteHooks(
    table: DBCoreTable,
    hooks: TableHooks,
    request: DBCoreMutateRequest,
): NexiePromise<DBCoreMutateResponse> {
    const schema = table.schema;
    const values = [...(request.values ?? [])];
    const keys = request.keys ? [...request.keys] : undefined;

    const probeKeys = values.map((value, index) =>
        primaryKeyOf(schema, value, keys?.[index] as IndexableType | undefined),
    );

    // `add` can only ever create, so it needs no existence probe.
    const needsProbe =
        request.type === 'put' && probeKeys.some((key) => key !== undefined);

    const existingValues = needsProbe
        ? table.getMany({
              trans: request.trans,
              keys: probeKeys.map((key) => key ?? null) as IndexableType[],
          })
        : NexiePromise.resolve(values.map(() => undefined));

    return existingValues.then((existing) => {
        const contexts: HookContext[] = [];

        values.forEach((value, index) => {
            const context: HookContext = {};
            contexts.push(context);

            const key = probeKeys[index];
            const previous = existing[index];

            if (previous === undefined) {
                const result = hooks.creating.fire.call(
                    context,
                    key,
                    value,
                    request.trans,
                );
                // A creating hook may assign the primary key by returning it.
                if (result !== undefined) {
                    if (schema.primKey.keyPath === null) {
                        if (keys) keys[index] = result as IndexableType;
                    } else {
                        setByKeyPath(value, schema.primKey.keyPath, result);
                    }
                }
            } else {
                const modifications = diff(previous, value);
                const extra = hooks.updating.fire.call(
                    context,
                    modifications,
                    key,
                    previous,
                    request.trans,
                );
                // A subscriber contributes modifications by returning them. The
                // chain merges those between subscribers, but the LAST one's
                // return value only ever comes back here -- so with a single
                // subscriber this is the only place it is picked up.
                if (extra && typeof extra === 'object') {
                    Object.assign(modifications, extra);
                }
                // Anything the subscribers added to `modifications` has to be
                // folded back into the record actually being written.
                for (const path of Object.keys(modifications)) {
                    setByKeyPath(value, path, modifications[path]);
                }
            }
        });

        const outgoing: DBCoreMutateRequest = {
            ...request,
            values,
            ...(keys ? { keys } : {}),
        };

        return table.mutate(outgoing).then((response) => {
            notify(contexts, response, values.length);
            return response;
        });
    });
}

/** Deliver per-operation success and failure to the hook contexts. */
function notify(
    contexts: HookContext[],
    response: DBCoreMutateResponse,
    total: number,
): void {
    for (let index = 0; index < total; index++) {
        const context = contexts[index];
        if (!context) continue;
        const failure = response.failures[index];
        if (failure !== undefined) context.onerror?.(failure);
        else context.onsuccess?.(response.results?.[index]);
    }
}
