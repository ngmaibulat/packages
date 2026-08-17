/** Schema shapes. Type-only: nothing here emits runtime code. */

/** Anything IndexedDB accepts as a key. */
export type IndexableType =
    | number
    | string
    | Date
    | ArrayBuffer
    | ArrayBufferView
    | IndexableTypeArray;

export interface IndexableTypeArray extends Array<IndexableType> {}

export type IndexableTypeArrayReadonly = readonly IndexableType[];

/** One parsed entry from a `stores()` spec string. */
export interface IndexSpec {
    /** The index name as written, with `&`, `*` and `++` stripped. */
    name: string;
    /** `null` for an outbound primary key. */
    keyPath: string | string[] | null;
    unique: boolean;
    /** multiEntry -- the `*` prefix. */
    multi: boolean;
    /** autoIncrement -- the `++` prefix. Primary keys only. */
    auto: boolean;
    /** True when the keyPath is an array, i.e. `[a+b]`. */
    compound: boolean;
    /** The canonical source form, regenerated rather than echoed back. */
    src: string;
    /** The `name:Type` suffix, if any. Unused by core; addons read it. */
    type?: string | undefined;
}

export interface TableSchema {
    name: string;
    primKey: IndexSpec;
    indexes: IndexSpec[];
    /** Lookup by index name, and by keyPath for compound indexes. */
    idxByName: Record<string, IndexSpec>;
    mappedClass?: (new (...args: any[]) => unknown) | undefined;
    /** The `reading` hook installed by `mapToClass`, so a re-map can drop it. */
    mappedReadHook?: ((value: any) => any) | undefined;
    readHook?: ((value: any) => any) | undefined;
    /**
     * The table's CRUD hook set, attached lazily by the hooks middleware. Typed
     * loosely here to keep the schema module at the bottom of the graph; it is
     * always a `TableHooks`.
     */
    hooks?: unknown;
}

/**
 * The per-table state that lives on the schema object but is not part of the
 * declaration: hooks, `mapToClass`. `Version.stores()` re-parses every version
 * from scratch, and these have to survive that -- a hook registered before a
 * later `db.version(n)` call is still a hook.
 */
export const CARRIED_SCHEMA_KEYS = [
    'mappedClass',
    'mappedReadHook',
    'readHook',
    'hooks',
] as const;

export type DbSchema = Record<string, TableSchema>;
