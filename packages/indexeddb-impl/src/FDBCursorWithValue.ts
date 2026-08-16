import FDBCursor from "./FDBCursor.ts";
import type {
    CursorRange,
    CursorSource,
    FDBCursorDirection,
    Value,
} from "./lib/types.ts";

class FDBCursorWithValue extends FDBCursor {
    public value: Value = undefined;

    constructor(
        source: CursorSource,
        range: CursorRange,
        direction?: FDBCursorDirection,
        request?: any,
    ) {
        super(source, range, direction, request);
    }

    override get [Symbol.toStringTag]() {
        return "IDBCursorWithValue";
    }
}

export default FDBCursorWithValue;
