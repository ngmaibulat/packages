import type { Key } from "./lib/types.ts";
import { defineInterface } from "./lib/webidl.ts";

class FDBRecord {
    private _key: Key;
    private _primaryKey: Key;
    private _value: any;

    constructor(key: Key, primaryKey: Key, value: any) {
        this._key = key;
        this._primaryKey = primaryKey;
        this._value = value;
    }

    get key() {
        return this._key;
    }

    get primaryKey() {
        return this._primaryKey;
    }

    get value() {
        return this._value;
    }

    get [Symbol.toStringTag]() {
        return "IDBRecord";
    }
}

defineInterface(FDBRecord, { name: "IDBRecord" });

export default FDBRecord;
