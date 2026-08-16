import { cmpKeys } from "./lib/cmp.ts";
import { DataError } from "./lib/errors.ts";
import valueToKey from "./lib/valueToKey.ts";
import type { Key } from "./lib/types.ts";
import { defineInterface } from "./lib/webidl.ts";

// http://www.w3.org/TR/2015/REC-IndexedDB-20150108/#range-concept
class FDBKeyRange {
    public static only(value: Key) {
        if (arguments.length === 0) {
            throw new TypeError();
        }
        value = valueToKey(value);
        return new FDBKeyRange(value, value, false, false);
    }

    public static lowerBound(lower: Key, open: boolean = false) {
        if (arguments.length === 0) {
            throw new TypeError();
        }
        lower = valueToKey(lower);
        return new FDBKeyRange(lower, undefined, open, true);
    }

    public static upperBound(upper: Key, open: boolean = false) {
        if (arguments.length === 0) {
            throw new TypeError();
        }
        upper = valueToKey(upper);
        return new FDBKeyRange(undefined, upper, true, open);
    }

    public static bound(
        lower: Key,
        upper: Key,
        lowerOpen: boolean = false,
        upperOpen: boolean = false,
    ) {
        if (arguments.length < 2) {
            throw new TypeError();
        }

        lower = valueToKey(lower);
        upper = valueToKey(upper);
        const cmpResult = cmpKeys(lower, upper);
        if (cmpResult === 1 || (cmpResult === 0 && (lowerOpen || upperOpen))) {
            throw new DataError();
        }

        return new FDBKeyRange(lower, upper, lowerOpen, upperOpen);
    }

    public _lower: Key | undefined;
    // readonly attribute, per IndexedDB.idl
    get lower() {
        return this._lower;
    }
    public _upper: Key | undefined;
    // readonly attribute, per IndexedDB.idl
    get upper() {
        return this._upper;
    }
    public _lowerOpen: boolean;
    // readonly attribute, per IndexedDB.idl
    get lowerOpen() {
        return this._lowerOpen;
    }
    public _upperOpen: boolean;
    // readonly attribute, per IndexedDB.idl
    get upperOpen() {
        return this._upperOpen;
    }

    constructor(
        lower: Key | undefined,
        upper: Key | undefined,
        lowerOpen: boolean,
        upperOpen: boolean,
    ) {
        this._lower = lower;
        this._upper = upper;
        this._lowerOpen = lowerOpen;
        this._upperOpen = upperOpen;
    }

    // https://w3c.github.io/IndexedDB/#dom-idbkeyrange-includes
    public includes(key: Key) {
        if (arguments.length === 0) {
            throw new TypeError();
        }
        key = valueToKey(key);

        if (this.lower !== undefined) {
            const cmpResult = cmpKeys(this.lower, key);

            if (cmpResult === 1 || (cmpResult === 0 && this.lowerOpen)) {
                return false;
            }
        }
        if (this.upper !== undefined) {
            const cmpResult = cmpKeys(this.upper, key);

            if (cmpResult === -1 || (cmpResult === 0 && this.upperOpen)) {
                return false;
            }
        }
        return true;
    }

    get [Symbol.toStringTag]() {
        return "IDBKeyRange";
    }
}

// Operation arities come from IndexedDB.idl -- see the `operations` note in
// lib/webidl.ts for why they cannot be read off the JS functions.
defineInterface(FDBKeyRange, {
    name: "IDBKeyRange",
    operations: {
        only: 1,
        lowerBound: 1,
        upperBound: 1,
        bound: 2,
        includes: 1,
    },
});

export default FDBKeyRange;
