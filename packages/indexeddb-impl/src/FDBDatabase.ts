import FDBTransaction from "./FDBTransaction.ts";
import {
    ConstraintError,
    InvalidAccessError,
    InvalidStateError,
    NotFoundError,
    TransactionInactiveError,
} from "./lib/errors.ts";
import FakeDOMStringList from "./lib/FakeDOMStringList.ts";
import FakeEventTarget, { inheritEventTarget } from "./lib/FakeEventTarget.ts";
import ObjectStore from "./lib/ObjectStore.ts";
import validateKeyPath from "./lib/validateKeyPath.ts";
import closeConnection from "./lib/closeConnection.ts";
import type {
    FDBTransactionOptions,
    KeyPath,
    TransactionMode,
} from "./lib/types.ts";
import type Database from "./lib/Database.ts";
import type { EventCallback } from "./lib/types.ts";
import {
    assertInternalConstruction,
    constructInternally,
    defineInterface,
} from "./lib/webidl.ts";

// Common first 3 steps of https://www.w3.org/TR/IndexedDB/#dom-idbdatabase-createobjectstore and https://www.w3.org/TR/IndexedDB/#dom-idbdatabase-deleteobjectstore
const confirmActiveVersionchangeTransaction = (database: FDBDatabase) => {
    // Let transaction be database’s upgrade transaction if it is not null, or throw an "InvalidStateError" DOMException otherwise.
    let transaction;
    if (database._runningVersionchangeTransaction) {
        // Find the latest versionchange transaction
        transaction = database._rawDatabase.transactions.findLast((tx) => {
            return tx.mode === "versionchange";
        });
    }
    if (!transaction) {
        throw new InvalidStateError();
    }

    // If transaction’s state is not active, then throw a "TransactionInactiveError" DOMException.
    if (transaction._state !== "active") {
        throw new TransactionInactiveError();
    }

    return transaction;
};

// http://www.w3.org/TR/2015/REC-IndexedDB-20150108/#database-interface
class FDBDatabase extends FakeEventTarget {
    public _closePending = false;
    public _closed = false;
    public _runningVersionchangeTransaction = false;
    public _oldVersion: number | undefined;
    public _rawDatabase: Database;

    public _name: string;
    // readonly attribute, per IndexedDB.idl
    get name() {
        return this._name;
    }
    public _version: number;
    // readonly attribute, per IndexedDB.idl
    get version() {
        return this._version;
    }
    public _objectStoreNames: FakeDOMStringList;

    // Event handler attributes, per IndexedDB.idl. Previously inherited as
    // plain fields from FakeEventTarget, which gave every connection all eight
    // handler names -- including onsuccess and onupgradeneeded, which are not
    // IDBDatabase attributes at all.
    public _onabort: EventCallback | null = null;
    get onabort() {
        return this._onabort;
    }
    set onabort(value: EventCallback | null) {
        this._onabort = value;
    }
    public _onclose: EventCallback | null = null;
    get onclose() {
        return this._onclose;
    }
    set onclose(value: EventCallback | null) {
        this._onclose = value;
    }
    public _onerror: EventCallback | null = null;
    get onerror() {
        return this._onerror;
    }
    set onerror(value: EventCallback | null) {
        this._onerror = value;
    }
    public _onversionchange: EventCallback | null = null;
    get onversionchange() {
        return this._onversionchange;
    }
    set onversionchange(value: EventCallback | null) {
        this._onversionchange = value;
    }
    // readonly attribute, per IndexedDB.idl
    get objectStoreNames() {
        return this._objectStoreNames;
    }

    constructor(rawDatabase: Database) {
        super();
        assertInternalConstruction("IDBDatabase");

        this._rawDatabase = rawDatabase;
        this._rawDatabase.connections.push(this);

        this._name = rawDatabase.name;
        this._version = rawDatabase.version;
        this._objectStoreNames = new FakeDOMStringList(
            ...Array.from(rawDatabase.rawObjectStores.keys()).sort(),
        );
    }

    // http://w3c.github.io/IndexedDB/#dom-idbdatabase-createobjectstore
    public createObjectStore(
        name: string,
        options: { autoIncrement?: boolean; keyPath?: KeyPath } | null = {},
    ) {
        if (name === undefined) {
            throw new TypeError();
        }
        const transaction = confirmActiveVersionchangeTransaction(this);

        const keyPath =
            options !== null && options.keyPath !== undefined
                ? options.keyPath
                : null;
        const autoIncrement =
            options !== null && options.autoIncrement !== undefined
                ? options.autoIncrement
                : false;

        if (keyPath !== null) {
            validateKeyPath(keyPath);
        }

        if (this._rawDatabase.rawObjectStores.has(name)) {
            throw new ConstraintError();
        }

        if (autoIncrement && (keyPath === "" || Array.isArray(keyPath))) {
            throw new InvalidAccessError();
        }

        // Save for rollbackLog
        const objectStoreNames = [...this.objectStoreNames];
        const transactionObjectStoreNames = [...transaction.objectStoreNames];

        const rawObjectStore = new ObjectStore(
            this._rawDatabase,
            name,
            keyPath,
            autoIncrement,
        );
        this.objectStoreNames._push(name);
        this.objectStoreNames._sort();
        transaction._scope.add(name);
        transaction._createdObjectStores.add(rawObjectStore);
        this._rawDatabase.rawObjectStores.set(name, rawObjectStore);
        transaction._objectStoreNames = new FakeDOMStringList(
            ...this.objectStoreNames,
        );

        transaction._rollbackLog.push(() => {
            rawObjectStore.deleted = true;

            this._objectStoreNames = new FakeDOMStringList(...objectStoreNames);
            transaction._objectStoreNames = new FakeDOMStringList(
                ...transactionObjectStoreNames,
            );

            transaction._scope.delete(rawObjectStore.name);
            this._rawDatabase.rawObjectStores.delete(rawObjectStore.name);
        });

        return transaction.objectStore(name);
    }

    // https://www.w3.org/TR/IndexedDB/#dom-idbdatabase-deleteobjectstore
    public deleteObjectStore(name: string) {
        if (name === undefined) {
            throw new TypeError();
        }
        const transaction = confirmActiveVersionchangeTransaction(this);

        // Let store be the object store named name in database, or throw a "NotFoundError" DOMException if none.
        const store = this._rawDatabase.rawObjectStores.get(name);
        if (store === undefined) {
            throw new NotFoundError();
        }

        // Remove store from this’s object store set.
        // This method synchronously modifies the objectStoreNames property on the IDBDatabase instance on which it was called.
        this._objectStoreNames = new FakeDOMStringList(
            ...Array.from(this.objectStoreNames).filter((objectStoreName) => {
                return objectStoreName !== name;
            }),
        );
        transaction._objectStoreNames = new FakeDOMStringList(
            ...this.objectStoreNames,
        );

        // If there is an object store handle associated with store and transaction, remove all entries from its index set.
        const objectStore = transaction._objectStoresCache.get(name);
        let prevIndexNames: string[] | undefined;
        if (objectStore) {
            prevIndexNames = [...objectStore.indexNames];
            objectStore._indexNames = new FakeDOMStringList();
        }

        transaction._rollbackLog.push(() => {
            store.deleted = false;
            this._rawDatabase.rawObjectStores.set(store.name, store);
            this.objectStoreNames._push(store.name);
            transaction.objectStoreNames._push(store.name);
            this.objectStoreNames._sort();

            if (objectStore && prevIndexNames) {
                objectStore._indexNames = new FakeDOMStringList(
                    ...prevIndexNames,
                );
            }
        });

        // Destroy store.
        store.deleted = true;
        this._rawDatabase.rawObjectStores.delete(name);
        transaction._objectStoresCache.delete(name);
    }

    // https://w3c.github.io/IndexedDB/#dom-idbdatabase-transaction
    public transaction(
        storeNames: string | string[],
        mode?: TransactionMode,
        options?: FDBTransactionOptions,
    ) {
        mode = mode !== undefined ? mode : "readonly";

        // WebIDL enum conversion happens before the algorithm runs, so a string
        // that is not an IDBTransactionMode at all fails here. "versionchange"
        // IS a member of that enum, so it survives conversion and is rejected
        // later instead -- see the step-6 check in _transaction().
        if (
            mode !== "readonly" &&
            mode !== "readwrite" &&
            mode !== "versionchange"
        ) {
            throw new TypeError("Invalid mode: " + mode);
        }

        return this._transaction(storeNames, mode, options, false);
    }

    /**
     * The upgrade algorithm's way in.
     *
     * `transaction()` must reject a "versionchange" mode, but the upgrade
     * itself runs in exactly such a transaction, so it needs a door that check
     * does not close. See "upgrade a database" in the spec, and FDBFactory.
     */
    public _versionchangeTransaction(storeNames: string[]) {
        return this._transaction(storeNames, "versionchange", undefined, true);
    }

    private _transaction(
        storeNames: string | string[],
        mode: TransactionMode,
        options: FDBTransactionOptions | undefined,
        internalVersionchange: boolean,
    ) {
        const hasActiveVersionchange = this._rawDatabase.transactions.some(
            (transaction) => {
                return (
                    transaction._state === "active" &&
                    transaction.mode === "versionchange" &&
                    transaction.db === this
                );
            },
        );
        if (hasActiveVersionchange) {
            throw new InvalidStateError();
        }

        if (this._closePending) {
            throw new InvalidStateError();
        }

        if (!Array.isArray(storeNames)) {
            storeNames = [storeNames];
        }
        if (storeNames.length === 0 && mode !== "versionchange") {
            throw new InvalidAccessError();
        }
        for (const storeName of storeNames) {
            if (!this.objectStoreNames.contains(storeName)) {
                throw new NotFoundError(
                    "No objectStore named " + storeName + " in this database",
                );
            }
        }

        // Step 6: only "readonly" and "readwrite" are allowed here.
        //
        // This sits *after* the scope checks on purpose. WPT's
        // "IDBDatabase.transaction exception order: NotFoundError vs. TypeError"
        // calls transaction('no-such-store', 'versionchange') and requires
        // NotFoundError, so hoisting this any earlier trades one failing test
        // for another.
        if (
            !internalVersionchange &&
            mode !== "readonly" &&
            mode !== "readwrite"
        ) {
            throw new TypeError(
                `'${mode}' is not a valid mode for IDBDatabase.transaction`,
            );
        }

        // the actual algo is more complex but this passes the IDB tests: https://webidl.spec.whatwg.org/#es-dictionary
        const durability = options?.durability ?? "default";
        // invalid enums throw a TypeError: https://webidl.spec.whatwg.org/#es-enumeration
        if (
            durability !== "default" &&
            durability !== "strict" &&
            durability !== "relaxed"
        ) {
            throw new TypeError(
                // based on Firefox's error message
                `'${durability}' (value of 'durability' member of IDBTransactionOptions) ` +
                    `is not a valid value for enumeration IDBTransactionDurability`,
            );
        }

        const tx = constructInternally(
            () => new FDBTransaction(storeNames, mode, durability, this),
        );
        this._rawDatabase.transactions.push(tx);
        this._rawDatabase.processTransactions(); // See if can start right away (async)

        // A transaction is created active and stays active for the task that
        // created it, through that task's microtask checkpoint, and no longer.
        // Nothing used to end that window, so a transaction created here stayed
        // active indefinitely and accepted requests from later tasks that a
        // browser would reject.
        //
        // The upgrade path is excluded: "upgrade a database" drives the state
        // by hand around the upgradeneeded dispatch (see FDBFactory), and a
        // second scheduler racing it would only confuse matters.
        if (!internalVersionchange) {
            tx._deactivateAfterCheckpoint();
        }

        return tx;
    }

    public close() {
        closeConnection(this);
    }

    get [Symbol.toStringTag]() {
        return "IDBDatabase";
    }
}

// Operation arities come from IndexedDB.idl -- see the `operations` note in
// lib/webidl.ts for why they cannot be read off the JS functions.
defineInterface(FDBDatabase, {
    name: "IDBDatabase",
    operations: {
        transaction: 1,
        close: 0,
        createObjectStore: 1,
        deleteObjectStore: 1,
    },
});

// After defineInterface: IDBRequest/IDBDatabase/IDBTransaction inherit
// EventTarget in the IDL, and idlharness checks the direct prototype link.
inheritEventTarget(FDBDatabase);

export default FDBDatabase;
