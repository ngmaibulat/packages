import FakeEvent from "./lib/FakeEvent.ts";
import { defineInterface } from "./lib/webidl.ts";

class FDBVersionChangeEvent extends FakeEvent {
    public _newVersion: number | null;
    // readonly attribute, per IndexedDB.idl
    get newVersion() {
        return this._newVersion;
    }
    public _oldVersion: number;
    // readonly attribute, per IndexedDB.idl
    get oldVersion() {
        return this._oldVersion;
    }

    constructor(
        type: "blocked" | "success" | "upgradeneeded" | "versionchange",
        parameters: { newVersion?: number | null; oldVersion?: number } = {},
    ) {
        super(type);

        this._newVersion =
            parameters.newVersion !== undefined ? parameters.newVersion : null;
        this._oldVersion =
            parameters.oldVersion !== undefined ? parameters.oldVersion : 0;
    }

    get [Symbol.toStringTag]() {
        return "IDBVersionChangeEvent";
    }
}

defineInterface(FDBVersionChangeEvent, {
    name: "IDBVersionChangeEvent",
    length: 1,
});

export default FDBVersionChangeEvent;
