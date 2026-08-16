import type { NexiePromise } from '../zone/nexie-promise.ts';
import type { Transaction } from '../classes/transaction.ts';
import type { DbSchema, IndexableType, TableSchema } from './schema.ts';

/**
 * DBCore -- the interception layer every mutation passes through.
 *
 * This is the seam addons extend. CRUD hooks are themselves a middleware on it,
 * which is the point: the extension mechanism is the one the library's own
 * features are built from, so it is exercised rather than merely offered.
 *
 * Every read and every write in the library passes through here, cursor walks
 * included. That completeness is not tidiness: the observability middleware
 * derives what a query READ from these requests, and a read it never sees is a
 * `liveQuery` that silently never fires again -- a failure with no symptom at
 * the point it is caused.
 */

export type DBCoreMutateType = 'add' | 'put' | 'delete' | 'deleteRange';

export interface DBCoreMutateRequest {
    type: DBCoreMutateType;
    trans: Transaction;
    /** Records to write, for `add` and `put`. */
    values?: readonly any[];
    /** Explicit keys: required for an outbound store, and for `delete`. */
    keys?: readonly IndexableType[];
    /** The range to clear, for `deleteRange`. */
    range?: IDBKeyRange | null;
    /** When true, `results` is populated with every resulting key. */
    wantResults?: boolean;
}

export interface DBCoreMutateResponse {
    numFailures: number;
    /** Keyed by the caller-side index of the failed operation. */
    failures: Record<number, unknown>;
    lastResult: IndexableType | undefined;
    results?: IndexableType[];
}

export interface DBCoreGetRequest {
    trans: Transaction;
    key: IndexableType;
}

export interface DBCoreGetManyRequest {
    trans: Transaction;
    keys: readonly IndexableType[];
}

/**
 * Which key the request addresses: `null` is the primary key -- the object
 * store itself -- and a string is the PHYSICAL index name.
 *
 * Physical, not logical: a query on `first` served by `[first+last]` names the
 * compound index here, because that is the index whose keys the observability
 * middleware compares a mutation against. Virtual-index translation happens
 * above this layer, in the query planner.
 */
export type DBCoreIndexName = string | null;

export interface DBCoreCountRequest {
    trans: Transaction;
    index?: DBCoreIndexName;
    range?: IDBKeyRange | null;
}

/** A non-cursor read: `getAll` / `getAllKeys`. */
export interface DBCoreQueryRequest {
    trans: Transaction;
    index?: DBCoreIndexName;
    range?: IDBKeyRange | null;
    /** Omitted means unlimited; IndexedDB reads 0 as "no limit", we do not. */
    limit?: number;
    /** False asks for keys only, which skips deserialising the records. */
    values: boolean;
}

export interface DBCoreQueryResponse {
    result: any[];
}

export interface DBCoreOpenCursorRequest {
    trans: Transaction;
    index?: DBCoreIndexName;
    range?: IDBKeyRange | null;
    reverse?: boolean;
    unique?: boolean;
    /** A key cursor exposes no `value`; see Collection's walk for when that is safe. */
    keysOnly?: boolean;
}

/**
 * The cursor contract the walk consumes -- deliberately narrower than
 * `IDBCursor`.
 *
 * Opening is split from walking: `openCursor` hands back a handle that has
 * issued no request yet, and `start` is what places it. That ordering is what
 * removes the race a middleware would otherwise introduce -- an intercepting
 * layer gets to inspect the request without a success event arriving before
 * anyone has said what to do with it.
 */
export interface DBCoreCursor {
    /** The index key, physical. */
    readonly key: IndexableType;
    readonly primaryKey: IndexableType;
    /** Undefined on a key cursor. */
    readonly value: any;
    continue(key?: IndexableType): void;
    /**
     * Place the cursor and walk it, calling `onNext` once per record. The
     * promise settles when the walk ends -- naturally, via `stop`, or via `fail`.
     */
    start(onNext: () => void): NexiePromise<void>;
    stop(): void;
    fail(error: unknown): void;
}

export interface DBCoreTable {
    readonly name: string;
    readonly schema: TableSchema;
    mutate(request: DBCoreMutateRequest): NexiePromise<DBCoreMutateResponse>;
    get(request: DBCoreGetRequest): NexiePromise<any>;
    getMany(request: DBCoreGetManyRequest): NexiePromise<any[]>;
    count(request: DBCoreCountRequest): NexiePromise<number>;
    query(request: DBCoreQueryRequest): NexiePromise<DBCoreQueryResponse>;
    openCursor(request: DBCoreOpenCursorRequest): NexiePromise<DBCoreCursor>;
}

export interface DBCore {
    /** The database name. Part of every observability key, so it lives here. */
    readonly name: string;
    readonly schema: DbSchema;
    table(name: string): DBCoreTable;
}

/**
 * A middleware wraps the layer below it.
 *
 * `level` orders the stack -- lower numbers sit closer to IndexedDB, so a
 * middleware with a low level sees requests after the higher ones have already
 * transformed them. The default is 10.
 */
export interface Middleware<TStack> {
    stack: 'dbcore';
    name?: string;
    level?: number;
    create(down: TStack): Partial<TStack>;
}
