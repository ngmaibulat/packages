import isPotentiallyValidKeyRange from "./isPotentiallyValidKeyRange.ts";
import enforceRange from "./enforceRange.ts";
import validateCursorDirection from "./validateCursorDirection.ts";
import type FDBKeyRange from "../FDBKeyRange.ts";
import type { FDBCursorDirection, FDBGetAllOptions, Key } from "./types.ts";

// https://www.w3.org/TR/IndexedDB/#create-request-to-retrieve-multiple-items
const extractGetAllOptions = (
    queryOrOptions: FDBKeyRange | Key | FDBGetAllOptions,
    count: number | undefined,
    numArguments: number,
) => {
    let query: FDBKeyRange | Key;
    let direction: FDBCursorDirection | undefined;

    if (
        queryOrOptions === undefined ||
        queryOrOptions === null ||
        isPotentiallyValidKeyRange(queryOrOptions)
    ) {
        // queryOrOptions is FDBKeyRange | Key | null | undefined
        query = queryOrOptions;
        if (numArguments > 1 && count !== undefined) {
            count = enforceRange(count, "unsigned long");
        }
    } else {
        // queryOrOptions is FDBGetAllOptions
        const getAllOptions = queryOrOptions as FDBGetAllOptions;
        if (getAllOptions.query !== undefined) {
            query = getAllOptions.query;
        }
        if (getAllOptions.count !== undefined) {
            count = enforceRange(getAllOptions.count, "unsigned long");
        }
        if (getAllOptions.direction !== undefined) {
            direction = validateCursorDirection(getAllOptions.direction);
        }
    }
    return {
        query,
        count,
        direction,
    };
};

export default extractGetAllOptions;
