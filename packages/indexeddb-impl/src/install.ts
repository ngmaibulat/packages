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

// https://w3c.github.io/IndexedDB/#idl-index
//
// The interface objects (IDBCursor and friends) are writable, non-enumerable
// data properties, which is what WebIDL says an interface object on the global
// is -- and it also lets a test swap one out by assignment.
const descriptor = (value: unknown): PropertyDescriptor => ({
    value,
    enumerable: false,
    configurable: true,
    writable: true,
});

// `indexedDB` is different: it is a readonly *attribute*, so WebIDL makes it an
// enumerable accessor whose getter brand-checks its receiver, and gives it no
// setter. Browsers behave exactly that way -- `window.indexedDB = x` does
// nothing there either.
//
// So assignment does not work here, deliberately. The property stays
// configurable, so a test that needs to substitute its own factory can use
// Object.defineProperty, or just call installGlobals() again.
const indexedDBDescriptor = (
    target: object,
    factory: unknown,
): PropertyDescriptor => {
    const get = function (this: unknown) {
        // `undefined`/`null` is allowed as well as the global itself: an
        // attribute on a [Global] interface has an implicit this, so
        // `getter.call(undefined)` must work. Anything else is a brand
        // mismatch.
        if (this !== target && this !== undefined && this !== null) {
            throw new TypeError(
                "Illegal invocation: indexedDB getter called on an incompatible receiver",
            );
        }
        return factory;
    };

    // WebIDL names an attribute's getter "get <name>", and idlharness checks
    // it. A function expression assigned to a `get` property in an object
    // literal is named after the property -- "get" -- so it is set explicitly.
    Object.defineProperty(get, "name", {
        value: "get indexedDB",
        configurable: true,
    });

    return { get, enumerable: true, configurable: true };
};

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
        indexedDB: indexedDBDescriptor(target, fakeIndexedDB),
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
