import FDBRequest from "./FDBRequest.ts";
import type { EventCallback } from "./lib/types.ts";
import { defineInterface } from "./lib/webidl.ts";

class FDBOpenDBRequest extends FDBRequest {
    public _onupgradeneeded: EventCallback | null = null;
    // event handler attribute, per IndexedDB.idl
    get onupgradeneeded() {
        return this._onupgradeneeded;
    }
    set onupgradeneeded(value: EventCallback | null) {
        this._onupgradeneeded = value;
    }
    public _onblocked: EventCallback | null = null;
    // event handler attribute, per IndexedDB.idl
    get onblocked() {
        return this._onblocked;
    }
    set onblocked(value: EventCallback | null) {
        this._onblocked = value;
    }

    override get [Symbol.toStringTag]() {
        return "IDBOpenDBRequest";
    }
}

defineInterface(FDBOpenDBRequest, { name: "IDBOpenDBRequest" });

export default FDBOpenDBRequest;
