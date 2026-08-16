import FDBKeyRange from "../FDBKeyRange.ts";
import valueToKeyWithoutThrowing, {
    INVALID_TYPE,
} from "./valueToKeyWithoutThrowing.ts";

// https://www.w3.org/TR/IndexedDB/#is-a-potentially-valid-key-range
const isPotentiallyValidKeyRange = (value: any): boolean => {
    // If value is a key range, return true.
    if (value instanceof FDBKeyRange) {
        return true;
    }

    // Let key be the result of converting a value to a key with value.
    const key = valueToKeyWithoutThrowing(value);

    // If key is "invalid type" return false.
    // Else return true.
    return key !== INVALID_TYPE;
};

export default isPotentiallyValidKeyRange;
