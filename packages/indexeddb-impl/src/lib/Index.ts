import FDBRecord from "../FDBRecord.ts";
import { cmpKeys } from "./cmp.ts";
import { ConstraintError } from "./errors.ts";
import extractKey from "./extractKey.ts";
import RecordStore from "./RecordStore.ts";
import valueToKey from "./valueToKey.ts";
import type ObjectStore from "./ObjectStore.ts";
import type {
    FDBCursorDirection,
    Key,
    KeyPath,
    Record,
    Value,
} from "./types.ts";
import type FDBTransaction from "../FDBTransaction.ts";
import type FDBKeyRange from "../FDBKeyRange.ts";
import { constructInternally } from "./webidl.ts";

// http://www.w3.org/TR/2015/REC-IndexedDB-20150108/#dfn-index
class Index {
    public deleted = false;
    // Initialized should be used to decide whether to throw an error or abort the versionchange transaction when there is a
    // constraint
    public initialized = false;
    public readonly rawObjectStore: ObjectStore;
    public readonly records;
    public name: string;
    public readonly keyPath: KeyPath;
    public multiEntry: boolean;
    public unique: boolean;

    constructor(
        rawObjectStore: ObjectStore,
        name: string,
        keyPath: KeyPath,
        multiEntry: boolean,
        unique: boolean,
    ) {
        this.rawObjectStore = rawObjectStore;

        this.name = name;
        this.keyPath = keyPath;
        this.multiEntry = multiEntry;
        this.unique = unique;
        this.records = new RecordStore(unique);
    }

    // http://www.w3.org/TR/2015/REC-IndexedDB-20150108/#dfn-steps-for-retrieving-a-value-from-an-index
    public getKey(key: FDBKeyRange | Key) {
        const record = this.records.get(key);

        return record !== undefined ? record.value : undefined;
    }

    // http://w3c.github.io/IndexedDB/#retrieve-multiple-referenced-values-from-an-index
    public getAllKeys(
        range: FDBKeyRange,
        count?: number,
        direction?: FDBCursorDirection,
    ) {
        if (count === undefined || count === 0) {
            count = Infinity;
        }

        const records = [];
        for (const record of this.records.values(range, direction)) {
            records.push(structuredClone(record.value));
            if (records.length >= count) {
                break;
            }
        }

        return records;
    }

    // http://www.w3.org/TR/2015/REC-IndexedDB-20150108/#index-referenced-value-retrieval-operation
    public getValue(key: FDBKeyRange | Key) {
        const record = this.records.get(key);

        return record !== undefined
            ? this.rawObjectStore.getValue(record.value)
            : undefined;
    }

    // http://w3c.github.io/IndexedDB/#retrieve-multiple-referenced-values-from-an-index
    public getAllValues(
        range: FDBKeyRange,
        count?: number,
        direction?: FDBCursorDirection,
    ) {
        if (count === undefined || count === 0) {
            count = Infinity;
        }

        const records = [];
        for (const record of this.records.values(range, direction)) {
            records.push(this.rawObjectStore.getValue(record.value));
            if (records.length >= count) {
                break;
            }
        }

        return records;
    }

    // https://www.w3.org/TR/IndexedDB/#dom-idbindex-getallrecords
    public getAllRecords(
        range: FDBKeyRange,
        count?: number,
        direction?: FDBCursorDirection,
    ) {
        if (count === undefined || count === 0) {
            count = Infinity;
        }

        const records = [];
        for (const record of this.records.values(range, direction)) {
            records.push(
                constructInternally(
                    () =>
                        // getKey/getValue already hand back clones.
                        new FDBRecord(
                            structuredClone(record.key),
                            this.rawObjectStore.getKey(record.value),
                            this.rawObjectStore.getValue(record.value),
                        ),
                ),
            );
            if (records.length >= count) {
                break;
            }
        }

        return records;
    }

    /**
     * The index keys a value contributes: one entry, or one per element for a
     * multiEntry index, or none when the value has no valid key at this index's
     * key path. Shared by store and delete so the two always agree on which
     * entries a record owns.
     */
    private _indexKeysFor(value: Value): Key[] | undefined {
        let indexKey;
        try {
            indexKey = extractKey(this.keyPath, value).key;
        } catch (err) {
            if (err.name === "DataError") {
                // Invalid key is not an actual error, just means we do not store an entry in this index
                return undefined;
            }

            throw err;
        }

        if (!this.multiEntry || !Array.isArray(indexKey)) {
            try {
                return [valueToKey(indexKey)];
            } catch (e) {
                return undefined;
            }
        }

        // remove any elements from index key that are not valid keys and remove any duplicate elements from index
        // key such that only one instance of the duplicate value remains. Duplicates are decided by key comparison,
        // as the spec says, not by identity: two equal Dates or two equal arrays are one entry.
        const keep: Key[] = [];
        for (const part of indexKey) {
            let converted;
            try {
                converted = valueToKey(part);
            } catch (err) {
                continue;
            }
            if (!keep.some((existing) => cmpKeys(existing, converted) === 0)) {
                keep.push(converted);
            }
        }
        return keep;
    }

    // http://www.w3.org/TR/2015/REC-IndexedDB-20150108/#dfn-steps-for-storing-a-record-into-an-object-store (step 7)
    public storeRecord(newRecord: Record) {
        const indexKeys = this._indexKeysFor(newRecord.value);
        if (indexKeys === undefined) {
            return;
        }

        if (this.unique) {
            for (const individualIndexKey of indexKeys) {
                const existingRecord = this.records.get(individualIndexKey);
                if (existingRecord) {
                    throw new ConstraintError();
                }
            }
        }

        for (const individualIndexKey of indexKeys) {
            this.records.put({
                key: individualIndexKey,
                value: newRecord.key,
            });
        }
    }

    /**
     * Remove the entries `record` contributed. Recomputing the record's index
     * keys and deleting exactly those entries is O(log n) per entry; the
     * previous approach scanned every entry in the index for ones pointing at
     * the primary key, which made deleting a store's records quadratic in its
     * size the moment it had an index.
     */
    public deleteRecord(record: Record) {
        const indexKeys = this._indexKeysFor(record.value);
        if (indexKeys === undefined) {
            return;
        }
        for (const individualIndexKey of indexKeys) {
            this.records.deleteByKeyAndValue(individualIndexKey, record.key);
        }
    }

    public initialize(transaction: FDBTransaction) {
        if (this.initialized) {
            throw new Error("Index already initialized");
        }

        transaction._execRequestAsync({
            operation: () => {
                try {
                    // Create index based on current value of objectstore
                    for (const record of this.rawObjectStore.records.values()) {
                        this.storeRecord(record);
                    }

                    this.initialized = true;
                } catch (err) {
                    // console.error(err);
                    transaction._abort(err.name);
                }
            },
            source: null,
        });
    }

    public count(range: FDBKeyRange) {
        let count = 0;

        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        for (const record of this.records.values(range)) {
            count += 1;
        }

        return count;
    }
}

export default Index;
