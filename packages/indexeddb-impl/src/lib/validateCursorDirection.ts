import type { FDBCursorDirection } from "./types.ts";

const DIRECTIONS: readonly FDBCursorDirection[] = [
    "next",
    "nextunique",
    "prev",
    "prevunique",
];

// `IDBCursorDirection` is a WebIDL enum, so a value outside it is a TypeError
// at the binding -- before any IndexedDB step runs. Undefined means the
// default ("next"), and is left for the caller to apply.
const validateCursorDirection = (
    direction: unknown,
): FDBCursorDirection | undefined => {
    if (direction === undefined) {
        return undefined;
    }
    const asString = String(direction) as FDBCursorDirection;
    if (!DIRECTIONS.includes(asString)) {
        throw new TypeError(
            `Failed to read the 'direction' property: The provided value '${String(
                direction,
            )}' is not a valid enum value of type IDBCursorDirection.`,
        );
    }
    return asString;
};

export default validateCursorDirection;
