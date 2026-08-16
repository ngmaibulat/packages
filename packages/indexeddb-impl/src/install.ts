import fakeIndexedDB from "./fakeIndexedDB.ts";
import FDBCursor from "./FDBCursor.ts";
import FDBCursorWithValue from "./FDBCursorWithValue.ts";
import FDBDatabase from "./FDBDatabase.ts";
import FDBFactory from "./FDBFactory.ts";
import FDBIndex from "./FDBIndex.ts";
import FDBKeyRange from "./FDBKeyRange.ts";
import FDBObjectStore from "./FDBObjectStore.ts";
import FDBOpenDBRequest from "./FDBOpenDBRequest.ts";
import FDBRecord from "./FDBRecord.ts";
import FDBRequest from "./FDBRequest.ts";
import FDBTransaction from "./FDBTransaction.ts";
import FDBVersionChangeEvent from "./FDBVersionChangeEvent.ts";

// Partly match the native behaviour for `globalThis.indexedDB`,
// `globalThis.IDBCursor` and the rest. Per the IDL `indexedDB` is readonly and
// the others are readwrite, but we make them all writable so a test can still
// replace one with `globalThis.<global> = ...`.
// https://w3c.github.io/IndexedDB/#idl-index
const descriptor = (value: unknown): PropertyDescriptor => ({
    value,
    enumerable: false,
    configurable: true,
    writable: true,
});

/**
 * Install the implementation onto a global object.
 *
 * Prefer the side-effect import for ordinary use:
 *
 *     import "@aibulat/indexeddb-impl/auto";
 *
 * This exists because that import only ever runs once per module registry. A
 * test runner that shares one process across test files -- `bun test` does,
 * `node --test` does not -- cannot re-trigger it after tampering with the
 * globals, and gets a silently un-installed environment instead. Calling this
 * is also how you install into something other than `globalThis`.
 */
export function installGlobals(target: object = globalThis): void {
    Object.defineProperties(target, {
        indexedDB: descriptor(fakeIndexedDB),
        IDBCursor: descriptor(FDBCursor),
        IDBCursorWithValue: descriptor(FDBCursorWithValue),
        IDBDatabase: descriptor(FDBDatabase),
        IDBFactory: descriptor(FDBFactory),
        IDBIndex: descriptor(FDBIndex),
        IDBKeyRange: descriptor(FDBKeyRange),
        IDBObjectStore: descriptor(FDBObjectStore),
        IDBOpenDBRequest: descriptor(FDBOpenDBRequest),
        IDBRecord: descriptor(FDBRecord),
        IDBRequest: descriptor(FDBRequest),
        IDBTransaction: descriptor(FDBTransaction),
        IDBVersionChangeEvent: descriptor(FDBVersionChangeEvent),
    });
}
