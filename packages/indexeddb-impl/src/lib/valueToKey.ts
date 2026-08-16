import { DataError } from "./errors.ts";
import valueToKeyWithoutThrowing, {
    INVALID_TYPE,
    INVALID_VALUE,
} from "./valueToKeyWithoutThrowing.ts";
import type { Key } from "./types.ts";

// https://w3c.github.io/IndexedDB/#convert-value-to-key
// Plus throwing a DataError for invalid value/invalid key, which is commonly done
// in lots of IndexedDB operations
const valueToKey = (input: any, seen?: Set<object>): Key | Key[] => {
    const result = valueToKeyWithoutThrowing(input, seen);
    if (result === INVALID_VALUE || result === INVALID_TYPE) {
        // If key is "invalid value" or "invalid type", throw a "DataError" DOMException
        throw new DataError();
    }
    return result;
};

export default valueToKey;
