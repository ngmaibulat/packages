import { exceptions } from '../errors/errors.ts';
import { cmp } from '../functions/cmp.ts';
import { getByKeyPath, isArray } from '../functions/utils.ts';
import {
    applyUpdateSpec,
    type UpdateSpec,
} from '../functions/prop-modification.ts';
import { toLogicalKey, type ResolvedIndex } from '../dbcore/index-resolver.ts';
import { NexiePromise } from '../zone/nexie-promise.ts';
import type { Table } from './table.ts';
import type { Transaction } from './transaction.ts';
import type { WhereClause } from './where-clause.ts';
import type { IndexableType } from '../types/schema.ts';

const ModifyError = exceptions['Modify']!;

/**
 * A cursor-position decision.
 *
 * Returning false skips the record. Calling `advance(fn)` takes over cursor
 * movement -- which is how `anyOf` jumps straight to the next needle instead of
 * walking every key between. Calling `stop()` ends the iteration.
 */
export type CursorAlgorithm = (
    cursor: IDBCursor,
    advance: (fn: () => void) => void,
    stop: () => void,
) => boolean;

/**
 * Algorithms are stateful (a needle index, a seen-set), so they are built fresh
 * per iteration rather than stored ready-made -- otherwise reusing a Collection
 * for a second query would resume mid-state. The direction is passed in because
 * `reverse()` may be called after the operator that installed the algorithm.
 */
export type AlgorithmFactory = (dir: 'next' | 'prev') => CursorAlgorithm;

export interface CollectionContext {
    table: Table;
    resolved: ResolvedIndex;
    range: IDBKeyRange | null;
    dir: 'next' | 'prev';
    unique: boolean;
    algorithmFactory: AlgorithmFactory | null;
    filter: CursorAlgorithm | null;
    offset: number;
    limit: number;
    error: unknown;
    or: Collection<any, any> | null;
    valueMapper: ((value: any) => any) | null;
}

interface IterationState {
    offsetLeft: number;
    limitLeft: number;
    stopped: boolean;
    seen: Set<string> | null;
}

/** A stable string form for any valid key, for de-duplication. */
function keyToString(key: unknown): string {
    if (isArray(key)) return `[${key.map(keyToString).join(',')}]`;
    if (key instanceof Date) return `D${key.getTime()}`;
    if (key instanceof ArrayBuffer || ArrayBuffer.isView(key)) {
        const bytes =
            key instanceof ArrayBuffer
                ? new Uint8Array(key)
                : new Uint8Array(
                      key.buffer,
                      key.byteOffset,
                      key.byteLength,
                  );
        return `B${Array.from(bytes).join(',')}`;
    }
    return `${typeof key}:${String(key)}`;
}

function combineAlgorithms(
    a: CursorAlgorithm | null,
    b: CursorAlgorithm,
): CursorAlgorithm {
    if (!a) return b;
    return (cursor, advance, stop) =>
        a(cursor, advance, stop) && b(cursor, advance, stop);
}

export class Collection<T = any, TKey = IndexableType> {
    _ctx: CollectionContext;

    constructor(ctx: CollectionContext) {
        this._ctx = ctx;
    }

    get db() {
        return this._ctx.table.db;
    }

    /** Prototypal clone -- cheap, and what makes the chaining API non-mutating. */
    clone(props?: Partial<CollectionContext>): Collection<T, TKey> {
        const ctx = Object.create(this._ctx) as CollectionContext;
        if (props) Object.assign(ctx, props);
        return new Collection<T, TKey>(ctx);
    }

    raw(): Collection<T, TKey> {
        return this.clone({ valueMapper: null });
    }

    // ------------------------------------------------------------ internals

    _addFilter(filter: CursorAlgorithm): void {
        this._ctx.filter = combineAlgorithms(this._ctx.filter, filter);
    }

    _addAlgorithm(factory: AlgorithmFactory): void {
        const existing = this._ctx.algorithmFactory;
        this._ctx.algorithmFactory = existing
            ? (dir) => combineAlgorithms(existing(dir), factory(dir))
            : factory;
    }

    private _read<R>(
        fn: (trans: Transaction) => R | PromiseLike<R>,
    ): NexiePromise<R> {
        // A collection built from an invalid operator carries its reason and
        // must never reach a cursor -- the fast paths below touch the store
        // before any iteration would check.
        if (this._ctx.error) return NexiePromise.reject(this._ctx.error);
        return this._ctx.table._trans('readonly', fn);
    }

    private _write<R>(
        fn: (trans: Transaction) => R | PromiseLike<R>,
    ): NexiePromise<R> {
        if (this._ctx.error) return NexiePromise.reject(this._ctx.error);
        // Mutations take the write lock so sub-operations serialise rather than
        // interleaving requests into the same transaction.
        return this._ctx.table._trans('readwrite', fn, true);
    }

    private _source(trans: Transaction): IDBObjectStore | IDBIndex {
        const store = trans.idbtrans.objectStore(this._ctx.table.name);
        return this._ctx.resolved.isPrimaryKey
            ? store
            : store.index(this._ctx.resolved.index!.name);
    }

    private _direction(): IDBCursorDirection {
        return (this._ctx.dir +
            (this._ctx.unique ? 'unique' : '')) as IDBCursorDirection;
    }

    /** True when the query is a bare key range, so a getAll fast path applies. */
    private _isPlain(): boolean {
        const ctx = this._ctx;
        return !ctx.algorithmFactory && !ctx.filter && !ctx.or;
    }

    private _mapValue(value: any): any {
        const mapper = this._ctx.valueMapper;
        return mapper ? mapper(value) : value;
    }

    /**
     * Walk the cursor, applying the algorithm and filters, and hand every
     * surviving record to `emit`. `emit` returns false to end the walk.
     */
    private _walk(
        trans: Transaction,
        keysOnly: boolean,
        state: IterationState,
        emit: (cursor: IDBCursor) => boolean,
    ): NexiePromise<void> {
        return new NexiePromise<void>((resolve, reject) => {
            const ctx = this._ctx;
            if (state.stopped) {
                resolve();
                return;
            }

            const algorithm = ctx.algorithmFactory
                ? ctx.algorithmFactory(ctx.dir)
                : null;
            const filter = ctx.filter;

            const source = this._source(trans);
            const direction = this._direction();

            // A key cursor exposes no `value`, and user filters are written
            // against the record. So a filtered `count()` or `keys()` still has
            // to walk a value cursor -- the caller only asked not to be HANDED
            // values, not for them to be unavailable to its own predicate.
            // Algorithms are exempt: they read `cursor.key` only.
            const request =
                keysOnly && !filter
                    ? source.openKeyCursor(ctx.range, direction)
                    : source.openCursor(ctx.range, direction);

            // Held in an object rather than a local: the algorithm assigns
            // these from inside a callback, and TypeScript's control-flow
            // analysis would otherwise narrow the locals to their initial
            // values at every use site.
            const control = {
                advancer: null as (() => void) | null,
                finished: false,
            };

            const advance = (fn: () => void) => {
                control.advancer = fn;
            };
            const stop = () => {
                control.finished = true;
                state.stopped = true;
                // Must settle here. Operators hand `stop` to `advance()` rather
                // than calling it inline, so by the time it runs it IS the
                // cursor-movement step -- if it does not resolve, nothing else
                // will and the walk simply stalls.
                resolve();
            };

            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                try {
                    step();
                } catch (error) {
                    // A throwing user filter must reject the query. Left
                    // uncaught it would escape the IDB event dispatch and the
                    // promise would simply never settle, which reads as a hang.
                    reject(error);
                }
            };

            const step = () => {
                const cursor = request.result;
                if (!cursor || state.stopped) {
                    resolve();
                    return;
                }

                control.advancer = null;
                let include = true;

                if (algorithm) include = algorithm(cursor, advance, stop);
                if (include && filter) include = filter(cursor, advance, stop);

                if (control.finished) {
                    // `until` includes its stop entry before ending, so honour
                    // the algorithm's verdict before unwinding.
                    if (include) emit(cursor);
                    resolve();
                    return;
                }

                // Read through an explicit annotation: the assignment to null
                // above narrows the property, and TypeScript does not widen it
                // again for the callback that may have reassigned it.
                const advancer = control.advancer as (() => void) | null;

                if (!include) {
                    if (advancer) advancer();
                    else cursor.continue();
                    return;
                }

                if (!emit(cursor)) {
                    resolve();
                    return;
                }

                if (advancer) advancer();
                else cursor.continue();
            };
        });
    }

    /**
     * Iterate this collection, and anything unioned onto it by `or()`,
     * de-duplicating by primary key and applying offset and limit across the
     * whole result rather than per branch.
     */
    private _iterate(
        trans: Transaction,
        keysOnly: boolean,
        onItem: (cursor: IDBCursor) => void,
    ): NexiePromise<void> {
        const ctx = this._ctx;
        if (ctx.error) return NexiePromise.reject(ctx.error);

        const state: IterationState = {
            offsetLeft: ctx.offset,
            limitLeft: ctx.limit,
            stopped: false,
            seen: ctx.or ? new Set<string>() : null,
        };

        if (state.limitLeft <= 0) return NexiePromise.resolve();

        const emit = (cursor: IDBCursor): boolean => {
            if (state.seen) {
                const id = keyToString(cursor.primaryKey);
                if (state.seen.has(id)) return true;
                state.seen.add(id);
            }
            if (state.offsetLeft > 0) {
                state.offsetLeft--;
                return true;
            }
            onItem(cursor);
            if (--state.limitLeft <= 0) {
                state.stopped = true;
                return false;
            }
            return true;
        };

        const branches: Collection<any, any>[] = [];
        for (
            let branch: Collection<any, any> | null = this;
            branch;
            branch = branch._ctx.or
        ) {
            branches.unshift(branch);
        }

        // Sequential rather than concurrent: the shared seen-set and the shared
        // limit both need a deterministic order to be reproducible.
        return branches.reduce<NexiePromise<void>>(
            (chain, branch) =>
                chain.then(() =>
                    state.stopped
                        ? undefined
                        : branch._walk(trans, keysOnly, state, emit),
                ),
            NexiePromise.resolve(),
        );
    }

    // -------------------------------------------------------------- reading

    toArray(): NexiePromise<T[]> {
        // `limit(0)` and the empty collections the operators build must not
        // reach getAll, where a count of 0 means "no limit" rather than "none".
        if (this._ctx.limit <= 0) return NexiePromise.resolve([] as T[]);

        return this._read((trans) => {
            const ctx = this._ctx;

            // getAll skips the per-record cursor round trip entirely. Only safe
            // when nothing has to inspect records as they go by, and only
            // forwards -- getAll has no direction argument.
            if (this._isPlain() && ctx.dir === 'next' && ctx.offset === 0) {
                const count =
                    ctx.limit === Infinity ? undefined : ctx.limit;
                return NexiePromise.resolve(
                    new NexiePromise<T[]>((resolve, reject) => {
                        const request = this._source(trans).getAll(
                            ctx.range ?? undefined,
                            count,
                        );
                        request.onsuccess = () => resolve(request.result as T[]);
                        request.onerror = () => reject(request.error);
                    }),
                ).then((values) =>
                    ctx.valueMapper ? values.map((v) => this._mapValue(v)) : values,
                );
            }

            const values: T[] = [];
            return this._iterate(trans, false, (cursor) => {
                values.push(
                    this._mapValue((cursor as IDBCursorWithValue).value),
                );
            }).then(() => values);
        });
    }

    count(): NexiePromise<number> {
        if (this._ctx.limit <= 0) return NexiePromise.resolve(0);

        return this._read((trans) => {
            const ctx = this._ctx;
            if (
                this._isPlain() &&
                ctx.offset === 0 &&
                ctx.limit === Infinity &&
                !ctx.unique
            ) {
                return new NexiePromise<number>((resolve, reject) => {
                    const request = this._source(trans).count(ctx.range ?? undefined);
                    request.onsuccess = () => resolve(request.result);
                    request.onerror = () => reject(request.error);
                });
            }

            let total = 0;
            // Counting needs no values, so a key cursor is enough.
            return this._iterate(trans, true, () => {
                total++;
            }).then(() => total);
        });
    }

    primaryKeys(): NexiePromise<TKey[]> {
        if (this._ctx.limit <= 0) return NexiePromise.resolve([] as TKey[]);

        return this._read((trans) => {
            const ctx = this._ctx;
            if (this._isPlain() && ctx.dir === 'next' && ctx.offset === 0) {
                const count = ctx.limit === Infinity ? undefined : ctx.limit;
                return new NexiePromise<TKey[]>((resolve, reject) => {
                    const request = this._source(trans).getAllKeys(
                        ctx.range ?? undefined,
                        count,
                    );
                    request.onsuccess = () =>
                        resolve(request.result as TKey[]);
                    request.onerror = () => reject(request.error);
                });
            }

            const keys: TKey[] = [];
            return this._iterate(trans, true, (cursor) => {
                keys.push(cursor.primaryKey as TKey);
            }).then(() => keys);
        });
    }

    keys(): NexiePromise<IndexableType[]> {
        return this._read((trans) => {
            const keys: IndexableType[] = [];
            return this._iterate(trans, true, (cursor) => {
                keys.push(
                    toLogicalKey(this._ctx.resolved, cursor.key as IndexableType),
                );
            }).then(() => keys);
        });
    }

    uniqueKeys(): NexiePromise<IndexableType[]> {
        return this.clone({ unique: true }).keys();
    }

    first(): NexiePromise<T | undefined> {
        return this.limit(1)
            .toArray()
            .then((values) => values[0]);
    }

    last(): NexiePromise<T | undefined> {
        return this.reverse().first();
    }

    firstKey(): NexiePromise<IndexableType | undefined> {
        return this.limit(1)
            .keys()
            .then((keys) => keys[0]);
    }

    lastKey(): NexiePromise<IndexableType | undefined> {
        return this.reverse().firstKey();
    }

    each(
        callback: (
            value: T,
            cursor: { key: IndexableType; primaryKey: TKey },
        ) => unknown,
    ): NexiePromise<void> {
        return this._read((trans) =>
            this._iterate(trans, false, (cursor) => {
                callback(this._mapValue((cursor as IDBCursorWithValue).value), {
                    key: toLogicalKey(
                        this._ctx.resolved,
                        cursor.key as IndexableType,
                    ),
                    primaryKey: cursor.primaryKey as TKey,
                });
            }),
        );
    }

    eachKey(
        callback: (
            key: IndexableType,
            cursor: { key: IndexableType; primaryKey: TKey },
        ) => unknown,
    ): NexiePromise<void> {
        return this._read((trans) =>
            this._iterate(trans, true, (cursor) => {
                const key = toLogicalKey(
                    this._ctx.resolved,
                    cursor.key as IndexableType,
                );
                callback(key, { key, primaryKey: cursor.primaryKey as TKey });
            }),
        );
    }

    eachPrimaryKey(
        callback: (
            key: TKey,
            cursor: { key: IndexableType; primaryKey: TKey },
        ) => unknown,
    ): NexiePromise<void> {
        return this._read((trans) =>
            this._iterate(trans, true, (cursor) => {
                callback(cursor.primaryKey as TKey, {
                    key: toLogicalKey(
                        this._ctx.resolved,
                        cursor.key as IndexableType,
                    ),
                    primaryKey: cursor.primaryKey as TKey,
                });
            }),
        );
    }

    eachUniqueKey(
        callback: (
            key: IndexableType,
            cursor: { key: IndexableType; primaryKey: TKey },
        ) => unknown,
    ): NexiePromise<void> {
        return this.clone({ unique: true }).eachKey(callback);
    }

    sortBy(keyPath: string): NexiePromise<T[]> {
        const descending = this._ctx.dir === 'prev';
        return this.toArray().then((values) =>
            values.sort((a, b) => {
                const left = getByKeyPath(a, keyPath);
                const right = getByKeyPath(b, keyPath);
                const result = cmp(left, right);
                return descending ? -result : result;
            }),
        );
    }

    // ------------------------------------------------------------- chaining

    limit(n: number): Collection<T, TKey> {
        return this.clone({ limit: n });
    }

    offset(n: number): Collection<T, TKey> {
        return this.clone({ offset: n });
    }

    reverse(): Collection<T, TKey> {
        return this.clone({ dir: this._ctx.dir === 'next' ? 'prev' : 'next' });
    }

    /** Alias kept for symmetry with `reverse()`. */
    desc(): Collection<T, TKey> {
        return this.reverse();
    }

    filter(predicate: (value: T) => boolean): Collection<T, TKey> {
        const clone = this.clone();
        clone._addFilter((cursor) =>
            predicate(
                clone._mapValue((cursor as IDBCursorWithValue).value) as T,
            ),
        );
        return clone;
    }

    and(predicate: (value: T) => boolean): Collection<T, TKey> {
        return this.filter(predicate);
    }

    until(
        predicate: (value: T) => boolean,
        includeStopEntry = false,
    ): Collection<T, TKey> {
        const clone = this.clone();
        clone._addFilter((cursor, advance, stop) => {
            if (predicate((cursor as IDBCursorWithValue).value as T)) {
                // Stop after this record, including it only if asked.
                advance(stop);
                return includeStopEntry;
            }
            return true;
        });
        return clone;
    }

    /**
     * Collapse duplicate records.
     *
     * Only a multiEntry index can yield the same record twice (once per array
     * element), so this is a no-op anywhere else -- matching Dexie.
     */
    distinct(): Collection<T, TKey> {
        const index = this._ctx.resolved.index;
        if (!index?.multi) return this.clone();

        const clone = this.clone();
        const seen = new Set<string>();
        clone._addFilter((cursor) => {
            const id = keyToString(cursor.primaryKey);
            if (seen.has(id)) return false;
            seen.add(id);
            return true;
        });
        return clone;
    }

    /** Union with another indexed query. */
    or(indexName: string): WhereClause<T, TKey> {
        return this._ctx.table._whereClause(
            indexName,
            this as unknown as Collection<any, any>,
        ) as unknown as WhereClause<T, TKey>;
    }

    // ------------------------------------------------------------ mutations

    modify(
        changes:
            | ((value: T, ctx: { value: T | null }) => unknown)
            | UpdateSpec<T>,
    ): NexiePromise<number> {
        const applyChange =
            typeof changes === 'function'
                ? (changes as (value: T, ctx: { value: T | null }) => unknown)
                : (value: T) => {
                      applyUpdateSpec(value, changes as Record<string, unknown>);
                  };

        return this._write((trans) => {
            const table = this._ctx.table;
            const outbound = table.schema.primKey.keyPath === null;

            const updates: unknown[] = [];
            const updateKeys: IndexableType[] = [];
            const deleteKeys: IndexableType[] = [];
            const failures: unknown[] = [];
            const failedKeys: IndexableType[] = [];

            // Collected during the walk and written afterwards, rather than
            // updated through the cursor. Writing mid-walk would mutate the
            // very index being iterated, and going through core is what lets
            // the CRUD hooks observe these changes at all.
            return this._iterate(trans, false, (cursor) => {
                const primaryKey = cursor.primaryKey as IndexableType;
                const wrapper: { value: T | null } = {
                    value: (cursor as IDBCursorWithValue).value,
                };

                try {
                    applyChange(wrapper.value as T, wrapper);
                } catch (error) {
                    failures.push(error);
                    failedKeys.push(primaryKey);
                    return;
                }

                // A callback that nulls out ctx.value asks for the record to be
                // removed; this is how `delete()` is expressed.
                if (wrapper.value === null) {
                    deleteKeys.push(primaryKey);
                } else {
                    updates.push(wrapper.value);
                    updateKeys.push(primaryKey);
                }
            })
                .then(() => {
                    const operations: NexiePromise<{
                        numFailures: number;
                        failures: Record<number, unknown>;
                    }>[] = [];

                    if (updates.length > 0) {
                        operations.push(
                            table.core.mutate({
                                type: 'put',
                                trans,
                                values: updates,
                                ...(outbound ? { keys: updateKeys } : {}),
                            }),
                        );
                    }
                    if (deleteKeys.length > 0) {
                        operations.push(
                            table.core.mutate({
                                type: 'delete',
                                trans,
                                keys: deleteKeys,
                            }),
                        );
                    }

                    return NexiePromise.all(operations);
                })
                .then((responses) => {
                    let attempted = updates.length + deleteKeys.length;
                    for (const response of responses) {
                        for (const index of Object.keys(response.failures)) {
                            failures.push(response.failures[Number(index)]);
                        }
                        attempted -= response.numFailures;
                    }

                    if (failures.length > 0) {
                        const error = new ModifyError(
                            `${table.name}.modify(): ${failures.length} of ${failures.length + attempted} operations failed`,
                        ) as InstanceType<typeof ModifyError> & {
                            failures: unknown[];
                            failedKeys: IndexableType[];
                            successCount: number;
                        };
                        error.failures = failures;
                        error.failedKeys = failedKeys;
                        error.successCount = attempted;
                        throw error;
                    }

                    return attempted;
                });
        });
    }

    delete(): NexiePromise<number> {
        const ctx = this._ctx;

        // A plain range over the primary key can be deleted wholesale, which
        // avoids walking a cursor over every record. The count has to be taken
        // first, since the promise still resolves the number deleted.
        //
        // Not available once a `deleting` hook is subscribed: that hook is
        // handed the record being removed, and a range delete never reads one.
        const hooks = (ctx.table.schema as { hooks?: { deleting: { hasSubscribers: boolean } } })
            .hooks;
        const canRangeDelete = !hooks?.deleting.hasSubscribers;

        if (
            canRangeDelete &&
            this._isPlain() &&
            ctx.resolved.isPrimaryKey &&
            ctx.offset === 0 &&
            ctx.limit === Infinity
        ) {
            return this._write((trans) => {
                const store = trans.idbtrans.objectStore(ctx.table.name);
                return new NexiePromise<number>((resolve, reject) => {
                    const countRequest = store.count(ctx.range ?? undefined);
                    countRequest.onerror = () => reject(countRequest.error);
                    countRequest.onsuccess = () => {
                        const total = countRequest.result;
                        const deleteRequest = ctx.range
                            ? store.delete(ctx.range)
                            : store.clear();
                        deleteRequest.onsuccess = () => resolve(total);
                        deleteRequest.onerror = () =>
                            reject(deleteRequest.error);
                    };
                });
            });
        }

        return this.modify((_value, context) => {
            context.value = null;
        });
    }
}
