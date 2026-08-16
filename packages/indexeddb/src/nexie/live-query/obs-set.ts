import { RangeSet } from '../functions/rangeset.ts';
import { MAX_KEY, MIN_KEY, PRIMARY_KEY_NAME } from '../globals/constants.ts';
import type { DBCoreIndexName } from '../types/dbcore.ts';
import type { IndexableType } from '../types/schema.ts';

/**
 * What a query read, or what a transaction wrote, expressed as key ranges per
 * (database, table, index).
 *
 * The key format is `idb://<database>/<table>/<index>`, with `:id` for the
 * primary key. It is a string rather than a tuple so the set is a plain object
 * -- which makes it structured-cloneable, and therefore postable to another tab
 * over a BroadcastChannel without a serialisation step of its own.
 *
 * The index part is the PHYSICAL index name. A query on `first` answered by
 * `[first+last]` records the compound index, and a mutation extracts the
 * compound key from the record, so the two meet on the same keys.
 */
export type ObservabilitySet = Record<string, RangeSet>;

export function obsKey(
    dbName: string,
    tableName: string,
    index: DBCoreIndexName | undefined,
): string {
    return `idb://${dbName}/${tableName}/${index ?? PRIMARY_KEY_NAME}`;
}

/** The set for `key`, created on demand. */
export function partOf(set: ObservabilitySet, key: string): RangeSet {
    const existing = set[key];
    if (existing) return existing;
    const created = new RangeSet();
    set[key] = created;
    return created;
}

/**
 * An IDBKeyRange as an inclusive range.
 *
 * Open bounds are widened to closed ones: the result is a superset, which costs
 * an occasional extra re-run and can never cost a missed one. An absent bound
 * becomes the extreme key, so a null range is "everything".
 */
export function rangeOf(range: IDBKeyRange | null | undefined): {
    from: IndexableType;
    to: IndexableType;
} {
    return {
        from: (range?.lower ?? MIN_KEY) as IndexableType,
        to: (range?.upper ?? MAX_KEY) as IndexableType,
    };
}

/** True when anything in `a` was written in `b`. */
export function obsSetsOverlap(
    a: ObservabilitySet,
    b: ObservabilitySet,
): boolean {
    for (const key of Object.keys(a)) {
        const other = b[key];
        if (other && a[key]!.intersects(other)) return true;
    }
    return false;
}

/** A form that survives `postMessage`: RangeSet is a class, its ranges are not. */
export type SerializedObsSet = Record<
    string,
    [IndexableType, IndexableType][]
>;

export function serializeObsSet(set: ObservabilitySet): SerializedObsSet {
    const result: SerializedObsSet = {};
    for (const key of Object.keys(set)) {
        result[key] = set[key]!.ranges().map(({ from, to }) => [from, to]);
    }
    return result;
}

export function deserializeObsSet(set: SerializedObsSet): ObservabilitySet {
    const result: ObservabilitySet = {};
    for (const key of Object.keys(set)) {
        const rangeSet = new RangeSet();
        for (const [from, to] of set[key]!) rangeSet.addRange(from, to);
        result[key] = rangeSet;
    }
    return result;
}
