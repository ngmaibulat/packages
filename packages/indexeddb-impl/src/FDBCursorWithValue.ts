import FDBCursor from "./FDBCursor.ts";
import type {
    CursorRange,
    CursorSource,
    FDBCursorDirection,
    Value,
} from "./lib/types.ts";
import { assertInternalConstruction, defineInterface } from "./lib/webidl.ts";

class FDBCursorWithValue extends FDBCursor {
    public _value: Value = undefined;
    // readonly attribute, per IndexedDB.idl
    get value() {
        return this._value;
    }

    constructor(
        source: CursorSource,
        range: CursorRange,
        direction?: FDBCursorDirection,
        request?: any,
    ) {
        super(source, range, direction, request);
        assertInternalConstruction("IDBCursorWithValue");
    }

    override get [Symbol.toStringTag]() {
        return "IDBCursorWithValue";
    }
}

defineInterface(FDBCursorWithValue, { name: "IDBCursorWithValue" });

export default FDBCursorWithValue;
