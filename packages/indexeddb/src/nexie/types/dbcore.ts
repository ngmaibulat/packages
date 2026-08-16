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
 * Scope note: the query side currently covers the non-cursor reads
 * (`get`/`getMany`/`count`). Collection's cursor walk still talks to
 * IndexedDB directly -- routing it through here buys nothing until something
 * needs to intercept it, which is Phase 5's observability middleware.
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

export interface DBCoreCountRequest {
    trans: Transaction;
    range?: IDBKeyRange | null;
}

export interface DBCoreTable {
    readonly name: string;
    readonly schema: TableSchema;
    mutate(request: DBCoreMutateRequest): NexiePromise<DBCoreMutateResponse>;
    get(request: DBCoreGetRequest): NexiePromise<any>;
    getMany(request: DBCoreGetManyRequest): NexiePromise<any[]>;
    count(request: DBCoreCountRequest): NexiePromise<number>;
}

export interface DBCore {
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
