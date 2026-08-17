import FDBCursor from "./FDBCursor.ts";
import FDBCursorWithValue from "./FDBCursorWithValue.ts";
import FDBKeyRange from "./FDBKeyRange.ts";
import FDBRequest from "./FDBRequest.ts";
import {
    ConstraintError,
    InvalidStateError,
    TransactionInactiveError,
} from "./lib/errors.ts";
import FakeDOMStringList from "./lib/FakeDOMStringList.ts";
import valueToKey from "./lib/valueToKey.ts";
import validateCursorDirection from "./lib/validateCursorDirection.ts";
import valueToKeyRange from "./lib/valueToKeyRange.ts";
import { getKeyPath } from "./lib/getKeyPath.ts";
import extractGetAllOptions from "./lib/extractGetAllOptions.ts";
import enforceRange from "./lib/enforceRange.ts";
import type {
    FDBCursorDirection,
    FDBGetAllOptions,
    Key,
    KeyPath,
} from "./lib/types.ts";
import type Index from "./lib/Index.ts";
import type FDBObjectStore from "./FDBObjectStore.ts";
import {
    assertInternalConstruction,
    constructInternally,
    defineInterface,
} from "./lib/webidl.ts";

const confirmActiveTransaction = (index: FDBIndex) => {
    if (index._rawIndex.deleted || index.objectStore._rawObjectStore.deleted) {
        throw new InvalidStateError();
    }

    if (index.objectStore.transaction._state !== "active") {
        throw new TransactionInactiveError();
    }
};

// http://www.w3.org/TR/2015/REC-IndexedDB-20150108/#idl-def-IDBIndex
class FDBIndex {
    public _rawIndex: Index;
    public _objectStore: FDBObjectStore;
    // readonly attribute, per IndexedDB.idl
    get objectStore() {
        return this._objectStore;
    }
    public _keyPath: KeyPath;
    // readonly attribute, per IndexedDB.idl
    get keyPath() {
        return this._keyPath;
    }
    public _multiEntry: boolean;
    // readonly attribute, per IndexedDB.idl
    get multiEntry() {
        return this._multiEntry;
    }
    public _unique: boolean;
    // readonly attribute, per IndexedDB.idl
    get unique() {
        return this._unique;
    }

    private _name: string;

    constructor(objectStore: FDBObjectStore, rawIndex: Index) {
        assertInternalConstruction("IDBIndex");
        this._rawIndex = rawIndex;

        this._name = rawIndex.name;
        this._objectStore = objectStore;
        this._keyPath = getKeyPath(rawIndex.keyPath);
        this._multiEntry = rawIndex.multiEntry;
        this._unique = rawIndex.unique;
    }

    get name() {
        return this._name;
    }

    // https://w3c.github.io/IndexedDB/#dom-idbindex-name
    set name(name: any) {
        const transaction = this.objectStore.transaction;

        if (!transaction.db._runningVersionchangeTransaction) {
            throw transaction._state === "active"
                ? new InvalidStateError()
                : new TransactionInactiveError();
        }

        if (transaction._state !== "active") {
            throw new TransactionInactiveError();
        }

        if (
            this._rawIndex.deleted ||
            this.objectStore._rawObjectStore.deleted
        ) {
            throw new InvalidStateError();
        }

        name = String(name);

        if (name === this._name) {
            return;
        }

        if (this.objectStore.indexNames.contains(name)) {
            throw new ConstraintError();
        }

        const oldName = this._name;
        const oldIndexNames = [...this.objectStore.indexNames];

        this._name = name;
        this._rawIndex.name = name;
        this.objectStore._indexesCache.delete(oldName);
        this.objectStore._indexesCache.set(name, this);
        this.objectStore._rawObjectStore.rawIndexes.delete(oldName);
        this.objectStore._rawObjectStore.rawIndexes.set(name, this._rawIndex);
        this.objectStore._indexNames = new FakeDOMStringList(
            ...Array.from(this.objectStore._rawObjectStore.rawIndexes.keys())
                .filter((indexName) => {
                    const index =
                        this.objectStore._rawObjectStore.rawIndexes.get(
                            indexName,
                        );
                    return index && !index.deleted;
                })
                .sort(),
        );

        // https://www.w3.org/TR/IndexedDB/#abort-an-upgrade-transaction - "If handle’s index was not newly created during transaction, set handle’s name to its index’s name."
        if (!this.objectStore.transaction._createdIndexes.has(this._rawIndex)) {
            transaction._rollbackLog.push(() => {
                this._name = oldName;
                this._rawIndex.name = oldName;
                this.objectStore._indexesCache.delete(name);
                this.objectStore._indexesCache.set(oldName, this);
                this.objectStore._rawObjectStore.rawIndexes.delete(name);
                this.objectStore._rawObjectStore.rawIndexes.set(
                    oldName,
                    this._rawIndex,
                );
                this.objectStore._indexNames = new FakeDOMStringList(
                    ...oldIndexNames,
                );
            });
        }
    }

    // http://www.w3.org/TR/2015/REC-IndexedDB-20150108/#widl-IDBIndex-openCursor-IDBRequest-any-range-IDBCursorDirection-direction
    public openCursor(
        range?: FDBKeyRange | Key | null | undefined,
        direction?: FDBCursorDirection,
    ) {
        direction = validateCursorDirection(direction);
        confirmActiveTransaction(this);

        if (range === null) {
            range = undefined;
        }
        if (range !== undefined && !(range instanceof FDBKeyRange)) {
            range = FDBKeyRange.only(valueToKey(range));
        }

        const request = constructInternally(() => new FDBRequest());
        request._source = this;
        request._transaction = this.objectStore.transaction;

        const cursor = constructInternally(
            () => new FDBCursorWithValue(this, range, direction, request),
        );

        return this.objectStore.transaction._execRequestAsync({
            operation: cursor._iterate.bind(cursor),
            request,
            source: this,
        });
    }

    // http://www.w3.org/TR/2015/REC-IndexedDB-20150108/#widl-IDBIndex-openKeyCursor-IDBRequest-any-range-IDBCursorDirection-direction
    public openKeyCursor(
        range?: FDBKeyRange | Key | null | undefined,
        direction?: FDBCursorDirection,
    ) {
        direction = validateCursorDirection(direction);
        confirmActiveTransaction(this);

        if (range === null) {
            range = undefined;
        }
        if (range !== undefined && !(range instanceof FDBKeyRange)) {
            range = FDBKeyRange.only(valueToKey(range));
        }

        const request = constructInternally(() => new FDBRequest());
        request._source = this;
        request._transaction = this.objectStore.transaction;

        const cursor = constructInternally(
            () => new FDBCursor(this, range, direction, request, true),
        );

        return this.objectStore.transaction._execRequestAsync({
            operation: cursor._iterate.bind(cursor),
            request,
            source: this,
        });
    }

    public get(key?: FDBKeyRange | Key) {
        if (arguments.length === 0) {
            throw new TypeError();
        }
        confirmActiveTransaction(this);

        if (!(key instanceof FDBKeyRange)) {
            key = valueToKey(key);
        }

        return this.objectStore.transaction._execRequestAsync({
            operation: this._rawIndex.getValue.bind(this._rawIndex, key),
            source: this,
        });
    }

    // http://w3c.github.io/IndexedDB/#dom-idbindex-getall
    public getAll(
        queryOrOptions?: FDBKeyRange | Key | FDBGetAllOptions,
        count?: number,
    ) {
        const options = extractGetAllOptions(
            queryOrOptions,
            count,
            arguments.length,
        );

        confirmActiveTransaction(this);

        const range = valueToKeyRange(options.query);

        return this.objectStore.transaction._execRequestAsync({
            operation: this._rawIndex.getAllValues.bind(
                this._rawIndex,
                range,
                options.count,
                options.direction,
            ),
            source: this,
        });
    }

    // http://www.w3.org/TR/2015/REC-IndexedDB-20150108/#widl-IDBIndex-getKey-IDBRequest-any-key
    public getKey(key?: FDBKeyRange | Key) {
        if (arguments.length === 0) {
            throw new TypeError();
        }
        confirmActiveTransaction(this);

        if (!(key instanceof FDBKeyRange)) {
            key = valueToKey(key);
        }

        return this.objectStore.transaction._execRequestAsync({
            operation: this._rawIndex.getKey.bind(this._rawIndex, key),
            source: this,
        });
    }

    // http://w3c.github.io/IndexedDB/#dom-idbindex-getallkeys
    public getAllKeys(
        queryOrOptions?: FDBKeyRange | Key | FDBGetAllOptions,
        count?: number,
    ) {
        const options = extractGetAllOptions(
            queryOrOptions,
            count,
            arguments.length,
        );

        confirmActiveTransaction(this);

        const range = valueToKeyRange(options.query);

        return this.objectStore.transaction._execRequestAsync({
            operation: this._rawIndex.getAllKeys.bind(
                this._rawIndex,
                range,
                options.count,
                options.direction,
            ),
            source: this,
        });
    }

    // https://www.w3.org/TR/IndexedDB/#dom-idbobjectstore-getallrecords
    public getAllRecords(options?: FDBGetAllOptions) {
        let query: FDBKeyRange | Key;
        let count: number | undefined;
        let direction: FDBCursorDirection | undefined;

        if (options !== undefined) {
            if (options.query !== undefined) {
                query = options.query;
            }
            if (options.count !== undefined) {
                count = enforceRange(options.count, "unsigned long");
            }
            if (options.direction !== undefined) {
                direction = validateCursorDirection(options.direction) as
                    | "prev"
                    | "next";
            }
        }

        confirmActiveTransaction(this);

        const range = valueToKeyRange(query);

        return this.objectStore.transaction._execRequestAsync({
            operation: this._rawIndex.getAllRecords.bind(
                this._rawIndex,
                range,
                count,
                direction,
            ),
            source: this,
        });
    }

    // http://www.w3.org/TR/2015/REC-IndexedDB-20150108/#widl-IDBIndex-count-IDBRequest-any-key
    public count(key: FDBKeyRange | Key | null | undefined) {
        confirmActiveTransaction(this);

        if (key === null) {
            key = undefined;
        }
        if (key !== undefined && !(key instanceof FDBKeyRange)) {
            key = FDBKeyRange.only(valueToKey(key));
        }

        return this.objectStore.transaction._execRequestAsync({
            operation: () => {
                return this._rawIndex.count(key);
            },
            source: this,
        });
    }

    get [Symbol.toStringTag]() {
        return "IDBIndex";
    }
}

// Operation arities come from IndexedDB.idl -- see the `operations` note in
// lib/webidl.ts for why they cannot be read off the JS functions.
defineInterface(FDBIndex, {
    name: "IDBIndex",
    operations: {
        get: 1,
        getKey: 1,
        getAll: 0,
        getAllKeys: 0,
        getAllRecords: 0,
        count: 0,
        openCursor: 0,
        openKeyCursor: 0,
    },
});

export default FDBIndex;
