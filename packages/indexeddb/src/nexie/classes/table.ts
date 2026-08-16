import { exceptions } from '../errors/errors.ts';
import { getByKeyPath, isArray, isPlainObject, setByKeyPath } from '../functions/utils.ts';
import {
    applyUpdateSpec,
    type UpdateSpec,
} from '../functions/prop-modification.ts';
import { resolveIndex } from '../dbcore/index-resolver.ts';
import { getTableHooks, type TableHooks } from '../hooks/hooks-middleware.ts';
import { PRIMARY_KEY_NAME } from '../globals/constants.ts';
import { NexiePromise } from '../zone/nexie-promise.ts';
import { getZone } from '../zone/zone.ts';
import { Collection } from './collection.ts';
import { WhereClause } from './where-clause.ts';
import { tempTransaction } from './temp-transaction.ts';
import type { Transaction } from './transaction.ts';
import type { Nexie } from './nexie.ts';
import type { IndexableType, TableSchema } from '../types/schema.ts';
import type { DBCoreTable } from '../types/dbcore.ts';

const BulkError = exceptions['Bulk']!;
const InvalidArgumentError = exceptions['InvalidArgument']!;
const ConstraintError = exceptions['Constraint']!;

export interface BulkOptions {
    allKeys?: boolean;
}

export class Table<T = any, TKey = IndexableType> {
    readonly db: Nexie;
    readonly name: string;
    schema: TableSchema;

    /** Set when this instance is bound to an explicit transaction. */
    _tx: Transaction | undefined;

    /** The read hook installed by mapToClass, so a re-map can replace it. */
    private _mappedReadHook: ((value: any) => any) | undefined;

    constructor(db: Nexie, name: string, schema: TableSchema, tx?: Transaction) {
        this.db = db;
        this.name = name;
        this.schema = schema;
        this._tx = tx;
    }

    /**
     * Resolve which transaction this operation belongs to, and run `fn` in it.
     *
     * The order matters: an explicitly bound transaction wins, then the ambient
     * one carried by the zone -- which is how a table call inside
     * `db.transaction(...)` joins that transaction without being handed it.
     */
    _trans<R>(
        mode: IDBTransactionMode,
        fn: (trans: Transaction) => R | PromiseLike<R>,
        bWriteLock?: boolean,
    ): NexiePromise<R> {
        // zone.trans is stored structurally so the zone module stays at the
        // bottom of the import graph; it is always a Transaction in practice.
        const ambient = getZone().trans as Transaction | undefined;
        const trans = this._tx ?? ambient;

        if (trans && trans.db === this.db) {
            return trans._promise(mode, () => fn(trans), bWriteLock);
        }

        return tempTransaction(this.db, mode, [this.name], fn, bWriteLock);
    }

    /** This table's slot in the middleware stack. Every write goes through it. */
    get core(): DBCoreTable {
        return this.db.core.table(this.name);
    }

    /** CRUD hooks. Shared per table, since the schema object is shared. */
    get hook(): TableHooks {
        return getTableHooks(this.schema);
    }

    /**
     * Read records back as instances of `constructor`.
     *
     * Implemented as a `reading` hook rather than as a special case, so it
     * composes with any hook the caller already installed.
     */
    mapToClass(constructor: new (...args: any[]) => any): typeof constructor {
        this.schema.mappedClass = constructor;

        const previous = this._mappedReadHook;
        if (previous) this.hook.reading.unsubscribe(previous);

        const readHook = (value: any) => {
            if (value === null || typeof value !== 'object') return value;
            const instance = Object.create(constructor.prototype);
            Object.assign(instance, value);
            return instance;
        };

        this._mappedReadHook = readHook;
        this.hook('reading', readHook);
        return constructor;
    }

    /** Apply the read hook, if one is installed. */
    private _mapRead(value: any): any {
        const readHook = this.schema.readHook;
        return readHook && value !== undefined ? readHook(value) : value;
    }

    /** True when the store generates its own keys and we should write them back. */
    private get _writesBackKey(): boolean {
        const { primKey } = this.schema;
        return primKey.auto && primKey.keyPath !== null;
    }

    // -------------------------------------------------------------- reading

    get(key: TKey): NexiePromise<T | undefined> {
        if (key === null || key === undefined) {
            return NexiePromise.reject(
                new TypeError('Invalid key provided to get()'),
            );
        }
        return this._trans('readonly', (trans) =>
            this.core
                .get({ trans, key: key as IndexableType })
                .then((value) => this._mapRead(value) as T | undefined),
        );
    }

    count(): NexiePromise<number> {
        return this._trans('readonly', (trans) =>
            this.core.count({ trans, index: null, range: null }),
        );
    }

    toArray(): NexiePromise<T[]> {
        return this._trans('readonly', (trans) =>
            this.core
                .query({ trans, index: null, range: null, values: true })
                .then(({ result }) =>
                    this.schema.readHook
                        ? (result as T[]).map(
                              (value) => this._mapRead(value) as T,
                          )
                        : (result as T[]),
                ),
        );
    }

    bulkGet(keys: TKey[]): NexiePromise<(T | undefined)[]> {
        return this._trans('readonly', (trans) =>
            this.core
                .getMany({ trans, keys: keys as IndexableType[] })
                .then((values) =>
                    values.map(
                        (value) => this._mapRead(value) as T | undefined,
                    ),
                ),
        );
    }

    // -------------------------------------------------------------- writing

    add(item: T, key?: TKey): NexiePromise<TKey> {
        return this._trans('readwrite', (trans) =>
            this._write(trans, 'add', item, key),
        );
    }

    put(item: T, key?: TKey): NexiePromise<TKey> {
        return this._trans('readwrite', (trans) =>
            this._write(trans, 'put', item, key),
        );
    }

    private _write(
        trans: Transaction,
        op: 'add' | 'put',
        item: T,
        key?: TKey,
    ): NexiePromise<TKey> {
        return this.core
            .mutate({
                type: op,
                trans,
                values: [item],
                // An inbound store must NOT be handed a key; passing one is an
                // error rather than a no-op.
                ...(key === undefined
                    ? {}
                    : { keys: [key as IndexableType] }),
                wantResults: true,
            })
            .then((response) => {
                if (response.numFailures > 0) throw response.failures[0];

                const resultKey = response.results?.[0] ?? response.lastResult;
                // Documented Dexie behaviour: a generated key is written back
                // onto the object the caller passed, so `await
                // db.friends.add(friend)` leaves `friend.id` populated.
                if (
                    this._writesBackKey &&
                    item !== null &&
                    typeof item === 'object'
                ) {
                    setByKeyPath(item, this.schema.primKey.keyPath!, resultKey);
                }
                return resultKey as TKey;
            });
    }

    delete(key: TKey): NexiePromise<void> {
        return this._trans('readwrite', (trans) =>
            this.core
                .mutate({
                    type: 'delete',
                    trans,
                    keys: [key as IndexableType],
                })
                .then((response) => {
                    if (response.numFailures > 0) throw response.failures[0];
                    return undefined as void;
                }),
        );
    }

    clear(): NexiePromise<void> {
        return this._trans('readwrite', (trans) =>
            this.core
                .mutate({ type: 'deleteRange', trans, range: null })
                .then(() => undefined as void),
        );
    }

    // ----------------------------------------------------------------- bulk

    bulkAdd(
        items: readonly T[],
        keys?: readonly IndexableType[] | BulkOptions,
        options?: BulkOptions,
    ): NexiePromise<any> {
        return this._bulkWrite('add', items, keys, options);
    }

    bulkPut(
        items: readonly T[],
        keys?: readonly IndexableType[] | BulkOptions,
        options?: BulkOptions,
    ): NexiePromise<any> {
        return this._bulkWrite('put', items, keys, options);
    }

    private _bulkWrite(
        op: 'add' | 'put',
        items: readonly T[],
        keysOrOptions?: readonly IndexableType[] | BulkOptions,
        maybeOptions?: BulkOptions,
    ): NexiePromise<any> {
        // (items), (items, keys), (items, options) and (items, keys, options)
        // are all valid, so the second argument has to be disambiguated.
        const keys = isArray(keysOrOptions)
            ? (keysOrOptions as readonly IndexableType[])
            : undefined;
        const options =
            (isArray(keysOrOptions) ? maybeOptions : (keysOrOptions as BulkOptions)) ??
            {};
        const wantAllKeys = options.allKeys === true;

        if (keys && this.schema.primKey.keyPath !== null) {
            return NexiePromise.reject(
                new InvalidArgumentError(
                    `${this.name}.bulk${op === 'add' ? 'Add' : 'Put'}(): keys must not be supplied for a table with an inbound primary key`,
                ),
            );
        }

        if (items.length === 0) {
            return NexiePromise.resolve(wantAllKeys ? [] : undefined);
        }

        return this._trans('readwrite', (trans) =>
            this.core
                .mutate({
                    type: op,
                    trans,
                    values: items,
                    ...(keys ? { keys } : {}),
                    wantResults: true,
                })
                .then((response) => {
                    const resultKeys = response.results ?? [];

                    if (this._writesBackKey) {
                        items.forEach((item, index) => {
                            if (
                                response.failures[index] === undefined &&
                                item !== null &&
                                typeof item === 'object'
                            ) {
                                setByKeyPath(
                                    item,
                                    this.schema.primKey.keyPath!,
                                    resultKeys[index],
                                );
                            }
                        });
                    }

                    if (response.numFailures > 0) {
                        const label = op === 'add' ? 'Add' : 'Put';
                        const error = new BulkError(
                            `${this.name}.bulk${label}(): ${response.numFailures} of ${items.length} operations failed`,
                        ) as InstanceType<typeof BulkError> & {
                            failures: unknown[];
                            failuresByPos: Record<number, unknown>;
                        };
                        error.failuresByPos = response.failures;
                        error.failures = Object.values(response.failures);
                        throw error;
                    }

                    return wantAllKeys
                        ? resultKeys
                        : resultKeys[resultKeys.length - 1];
                }),
        );
    }

    // ---------------------------------------------------------- querying

    /** Internal factory, so Collection.or() can build a clause without a cycle. */
    _whereClause(
        indexName: string | null,
        orCollection?: Collection<T, TKey> | null,
    ): WhereClause<T, TKey> {
        return new WhereClause<T, TKey>(this, indexName, orCollection);
    }

    where(index: string | string[]): WhereClause<T, TKey>;
    where(equalityCriterias: Record<string, unknown>): Collection<T, TKey>;
    where(
        index: string | string[] | Record<string, unknown>,
    ): WhereClause<T, TKey> | Collection<T, TKey> {
        if (typeof index === 'string') return this._whereClause(index);
        if (isArray(index)) return this._whereClause(`[${index.join('+')}]`);
        return this._whereCriteria(index);
    }

    /**
     * `where({ first: 'Alice', last: 'Smith' })`.
     *
     * Prefers a compound index covering all the criteria -- including a virtual
     * one, so `[first+last+age]` serves a two-key query. Failing that it uses
     * whichever single criterion is indexed and filters the rest in memory, and
     * failing even that it scans.
     */
    private _whereCriteria(
        criteria: Record<string, unknown>,
    ): Collection<T, TKey> {
        const paths = Object.keys(criteria);
        if (paths.length === 0) return this.toCollection();

        if (paths.length === 1) {
            const only = paths[0]!;
            // Only reach for the index if there is one; an unindexed criterion
            // has to fall through to the scan-and-filter path below rather than
            // rejecting with SchemaError.
            if (resolveIndex(this.schema, only) !== null) {
                return this._whereClause(only).equals(
                    criteria[only] as IndexableType,
                );
            }
        }

        // A compound index only helps if its leading components are exactly the
        // criteria keys, in some order -- so try each permutation-free form by
        // matching against the declared compound indexes directly.
        for (const candidate of this.schema.indexes) {
            if (!isArray(candidate.keyPath) || candidate.multi) continue;
            const prefix = candidate.keyPath.slice(0, paths.length);
            if (prefix.length < paths.length) continue;
            if (!prefix.every((part) => paths.includes(part))) continue;

            const key = prefix.map(
                (part) => criteria[part] as IndexableType,
            ) as IndexableType;
            return this._whereClause(`[${prefix.join('+')}]`).equals(key);
        }

        // Fall back to the best single index, filtering the remaining criteria.
        const indexed = paths.find(
            (path) => resolveIndex(this.schema, path) !== null,
        );
        const remaining = indexed
            ? paths.filter((path) => path !== indexed)
            : paths;

        const base = indexed
            ? this._whereClause(indexed).equals(criteria[indexed] as IndexableType)
            : this.toCollection();

        return base.filter((value) =>
            remaining.every(
                (path) => getByKeyPath(value, path) === criteria[path],
            ),
        );
    }

    /** Every record, in primary key order. */
    toCollection(): Collection<T, TKey> {
        return this._whereClause(PRIMARY_KEY_NAME).aboveOrEqual(
            -Infinity as IndexableType,
        );
    }

    orderBy(index: string | string[]): Collection<T, TKey> {
        const name = isArray(index) ? `[${index.join('+')}]` : index;
        // An unbounded range over the index is what makes it the sort order.
        return this._whereClause(name).aboveOrEqual(
            -Infinity as IndexableType,
        );
    }

    reverse(): Collection<T, TKey> {
        return this.toCollection().reverse();
    }

    filter(predicate: (value: T) => boolean): Collection<T, TKey> {
        return this.toCollection().filter(predicate);
    }

    offset(n: number): Collection<T, TKey> {
        return this.toCollection().offset(n);
    }

    limit(n: number): Collection<T, TKey> {
        return this.toCollection().limit(n);
    }

    each(
        callback: (
            value: T,
            cursor: { key: IndexableType; primaryKey: TKey },
        ) => unknown,
    ): NexiePromise<void> {
        return this.toCollection().each(callback);
    }

    // ---------------------------------------------------------- updating

    /**
     * Apply changes to one record, addressed by key or by the record itself.
     *
     * @returns 1 if the record existed, 0 otherwise.
     */
    update(
        keyOrObject: TKey | T,
        changes:
            | UpdateSpec<T>
            | ((value: T, ctx: { value: T | null }) => unknown),
    ): NexiePromise<number> {
        const key = this._keyOf(keyOrObject);
        if (key instanceof NexiePromise) return key;

        return this._whereClause(PRIMARY_KEY_NAME)
            .equals(key as IndexableType)
            .modify(changes as UpdateSpec<T>);
    }

    /**
     * Apply changes to a record, creating it if absent.
     *
     * @returns true if the record already existed.
     */
    upsert(keyOrObject: TKey | T, changes: UpdateSpec<T>): NexiePromise<boolean> {
        const key = this._keyOf(keyOrObject);
        if (key instanceof NexiePromise) return key as never;

        const outbound = this.schema.primKey.keyPath === null;

        return this._trans(
            'readwrite',
            (trans) =>
                this.core
                    .get({ trans, key: key as IndexableType })
                    .then((existing) => {
                        const target = (existing ?? {}) as Record<
                            string,
                            unknown
                        >;
                        applyUpdateSpec(
                            target,
                            changes as Record<string, unknown>,
                        );
                        if (!existing && !outbound) {
                            setByKeyPath(
                                target,
                                this.schema.primKey.keyPath!,
                                key,
                            );
                        }
                        return this.core
                            .mutate({
                                type: 'put',
                                trans,
                                values: [target],
                                ...(outbound
                                    ? { keys: [key as IndexableType] }
                                    : {}),
                            })
                            .then((response) => {
                                if (response.numFailures > 0) {
                                    throw response.failures[0];
                                }
                                return existing !== undefined;
                            });
                    }),
            true,
        );
    }

    /** Update many records by key, skipping any that do not exist. */
    bulkUpdate(
        keysAndChanges: readonly { key: TKey; changes: UpdateSpec<T> }[],
    ): NexiePromise<number> {
        if (keysAndChanges.length === 0) return NexiePromise.resolve(0);

        const primKeyPath = this.schema.primKey.keyPath;

        return this._trans(
            'readwrite',
            (trans) =>
                this.core
                    .getMany({
                        trans,
                        keys: keysAndChanges.map(
                            ({ key }) => key as IndexableType,
                        ),
                    })
                    .then((existingValues) => {
                        const values: unknown[] = [];
                        const keys: IndexableType[] = [];

                        keysAndChanges.forEach(({ key, changes }, index) => {
                            const existing = existingValues[index];
                            if (existing === undefined) return;

                            // Moving a record's primary key is a delete plus an
                            // insert, not an update; refuse rather than silently
                            // orphaning the old row.
                            if (primKeyPath !== null) {
                                for (const path of Object.keys(
                                    changes as Record<string, unknown>,
                                )) {
                                    if (
                                        path === primKeyPath ||
                                        (isArray(primKeyPath) &&
                                            primKeyPath.includes(path))
                                    ) {
                                        throw new ConstraintError(
                                            'Cannot update primary key in bulkUpdate()',
                                        );
                                    }
                                }
                            }

                            applyUpdateSpec(
                                existing as Record<string, unknown>,
                                changes as Record<string, unknown>,
                            );
                            values.push(existing);
                            keys.push(key as IndexableType);
                        });

                        if (values.length === 0) return 0;

                        return this.core
                            .mutate({
                                type: 'put',
                                trans,
                                values,
                                ...(primKeyPath === null ? { keys } : {}),
                            })
                            .then(
                                (response) =>
                                    values.length - response.numFailures,
                            );
                    }),
            true,
        );
    }

    /** Extract a primary key from either a key or a whole record. */
    private _keyOf(keyOrObject: TKey | T): TKey | NexiePromise<never> {
        if (!isPlainObject(keyOrObject) || isArray(keyOrObject)) {
            return keyOrObject as TKey;
        }

        const keyPath = this.schema.primKey.keyPath;
        if (keyPath === null) {
            return NexiePromise.reject(
                new InvalidArgumentError(
                    'Cannot derive a primary key from an object on a table with an outbound primary key',
                ),
            );
        }

        const key = getByKeyPath(keyOrObject, keyPath);
        if (key === undefined) {
            return NexiePromise.reject(
                new InvalidArgumentError(
                    'Given object does not contain its primary key',
                ),
            );
        }
        return key as TKey;
    }

    bulkDelete(keys: TKey[]): NexiePromise<void> {
        if (keys.length === 0) return NexiePromise.resolve(undefined as void);

        return this._trans('readwrite', (trans) =>
            this.core
                .mutate({
                    type: 'delete',
                    trans,
                    keys: keys as IndexableType[],
                })
                .then((response) => {
                    if (response.numFailures > 0) throw response.failures[0];
                    return undefined as void;
                }),
        );
    }
}
