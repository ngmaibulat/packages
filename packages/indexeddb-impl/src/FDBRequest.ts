import { InvalidStateError } from "./lib/errors.ts";
import FakeEventTarget from "./lib/FakeEventTarget.ts";
import type FDBCursor from "./FDBCursor.ts";
import type FDBIndex from "./FDBIndex.ts";
import type FDBObjectStore from "./FDBObjectStore.ts";
import type FDBTransaction from "./FDBTransaction.ts";
import type { EventCallback } from "./lib/types.ts";

class FDBRequest extends FakeEventTarget {
    public _result: any = null;
    public _error: Error | null | undefined = null;
    public source: FDBCursor | FDBIndex | FDBObjectStore | null = null;
    public transaction: FDBTransaction | null = null;
    public readyState: "done" | "pending" = "pending";
    public override onsuccess: EventCallback | null = null;
    public override onerror: EventCallback | null = null;

    public get error() {
        if (this.readyState === "pending") {
            throw new InvalidStateError();
        }
        return this._error;
    }

    public set error(value: any) {
        this._error = value;
    }

    public get result() {
        if (this.readyState === "pending") {
            throw new InvalidStateError();
        }
        return this._result;
    }

    public set result(value: any) {
        this._result = value;
    }

    get [Symbol.toStringTag]() {
        return "IDBRequest";
    }
}

export default FDBRequest;
