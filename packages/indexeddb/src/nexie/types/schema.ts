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
    readHook?: ((value: any) => any) | undefined;
}

export type DbSchema = Record<string, TableSchema>;
