import { InvalidStateError } from "./lib/errors.ts";
import FakeEventTarget from "./lib/FakeEventTarget.ts";
import type FDBCursor from "./FDBCursor.ts";
import type FDBIndex from "./FDBIndex.ts";
import type FDBObjectStore from "./FDBObjectStore.ts";
import type FDBTransaction from "./FDBTransaction.ts";
import type { EventCallback } from "./lib/types.ts";
import { defineInterface } from "./lib/webidl.ts";

class FDBRequest extends FakeEventTarget {
    public _result: any = null;
    public _error: Error | null | undefined = null;
    public _source: FDBCursor | FDBIndex | FDBObjectStore | null = null;
    // readonly attribute, per IndexedDB.idl
    get source() {
        return this._source;
    }
    public _transaction: FDBTransaction | null = null;
    // readonly attribute, per IndexedDB.idl
    get transaction() {
        return this._transaction;
    }
    public _readyState: "done" | "pending" = "pending";
    // readonly attribute, per IndexedDB.idl
    get readyState() {
        return this._readyState;
    }
    public _onsuccess: EventCallback | null = null;
    // event handler attribute, per IndexedDB.idl
    get onsuccess() {
        return this._onsuccess;
    }
    set onsuccess(value: EventCallback | null) {
        this._onsuccess = value;
    }
    public _onerror: EventCallback | null = null;
    // event handler attribute, per IndexedDB.idl
    get onerror() {
        return this._onerror;
    }
    set onerror(value: EventCallback | null) {
        this._onerror = value;
    }

    public get error() {
        if (this.readyState === "pending") {
            throw new InvalidStateError();
        }
        return this._error;
    }

    public get result() {
        if (this.readyState === "pending") {
            throw new InvalidStateError();
        }
        return this._result;
    }

    get [Symbol.toStringTag]() {
        return "IDBRequest";
    }
}

defineInterface(FDBRequest, { name: "IDBRequest" });

export default FDBRequest;
