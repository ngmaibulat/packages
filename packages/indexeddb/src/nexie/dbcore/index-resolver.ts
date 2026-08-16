import { MAX_KEY, PRIMARY_KEY_NAME } from '../globals/constants.ts';
import { isArray } from '../functions/utils.ts';
import type { IndexableType, IndexSpec, TableSchema } from '../types/schema.ts';

/**
 * Index resolution, including virtual indexes.
 *
 * A compound index `[a+b+c]` physically stores the array `[a, b, c]`, and
 * arrays compare element-wise. That means the same index can answer queries on
 * `[a+b]` and on `a` alone, by turning a query for prefix `k` into the physical
 * range `[k] .. [k, MAX_KEY]`. Dexie exposes this as a DBCore middleware; here
 * it lives in the query planner, because until Phase 4 there is no stack to be
 * a middleware in.
 *
 * This is a correctness feature, not an optimisation: without it,
 * `db.friends.where('first').equals('Alice')` fails outright on a schema that
 * only declares `[first+last]`, which is a thing Dexie users legitimately do.
 */

export interface ResolvedIndex {
    /** `null` means the primary key (the object store itself). */
    readonly index: IndexSpec | null;
    readonly isPrimaryKey: boolean;
    /** How many leading components of the physical key the query addresses. */
    readonly keyLength: number;
    /** True when only a prefix of a compound index is being used. */
    readonly isVirtual: boolean;
}

/** A range expressed in the caller's terms, before virtual-index translation. */
export interface LogicalRange {
    lower?: IndexableType | undefined;
    upper?: IndexableType | undefined;
    lowerOpen: boolean;
    upperOpen: boolean;
}

function keyPathLength(keyPath: string | string[] | null): number {
    return isArray(keyPath) ? keyPath.length : 1;
}

/** Render a keyPath the way the schema DSL spells it, for name matching. */
function keyPathName(keyPath: string | string[] | null): string {
    return isArray(keyPath) ? `[${keyPath.join('+')}]` : (keyPath ?? '');
}

/** Parse `'[a+b]'` into `['a','b']`, or a plain name into `['name']`. */
function requestedPath(name: string): string[] {
    const compound = name.match(/^\[(.*)\]$/);
    return compound ? compound[1]!.split('+') : [name];
}

function startsWith(full: string[], prefix: string[]): boolean {
    if (prefix.length > full.length) return false;
    return prefix.every((part, i) => full[i] === part);
}

/**
 * Find the index that can answer a query on `indexName`, or null if none can.
 *
 * Preference order: the primary key for `:id`, then an exact index match, then
 * the shortest compound index the request is a prefix of.
 */
export function resolveIndex(
    schema: TableSchema,
    indexName: string | string[] | null,
): ResolvedIndex | null {
    if (indexName === null || indexName === PRIMARY_KEY_NAME) {
        return {
            index: null,
            isPrimaryKey: true,
            keyLength: keyPathLength(schema.primKey.keyPath),
            isVirtual: false,
        };
    }

    const name = isArray(indexName)
        ? `[${indexName.join('+')}]`
        : indexName;

    const exact = schema.idxByName[name];
    if (exact) {
        return {
            index: exact,
            isPrimaryKey: false,
            keyLength: keyPathLength(exact.keyPath),
            isVirtual: false,
        };
    }

    const wanted = requestedPath(name);

    // The primary key can serve as a virtual index too, when it is compound.
    if (
        isArray(schema.primKey.keyPath) &&
        startsWith(schema.primKey.keyPath, wanted)
    ) {
        return {
            index: null,
            isPrimaryKey: true,
            keyLength: wanted.length,
            isVirtual: true,
        };
    }

    // Shortest match wins: a narrower index scans less.
    let best: IndexSpec | null = null;
    for (const candidate of schema.indexes) {
        // A multiEntry index stores each array element separately, so its
        // physical keys are not the compound arrays this trick relies on.
        if (candidate.multi || !isArray(candidate.keyPath)) continue;
        if (!startsWith(candidate.keyPath, wanted)) continue;
        if (!best || candidate.keyPath.length < (best.keyPath as string[]).length) {
            best = candidate;
        }
    }

    if (best) {
        return {
            index: best,
            isPrimaryKey: false,
            keyLength: wanted.length,
            isVirtual: true,
        };
    }

    return null;
}

/** The name a resolved index is opened by, for error messages. */
export function describeIndex(
    schema: TableSchema,
    resolved: ResolvedIndex,
): string {
    return resolved.isPrimaryKey
        ? keyPathName(schema.primKey.keyPath) || ':id'
        : resolved.index!.name;
}

/**
 * Turn a logical key into the physical key stored by the index.
 *
 * For a virtual index the physical key is an array, so a scalar query key has
 * to be lifted into one.
 */
export function toPhysicalKey(
    resolved: ResolvedIndex,
    key: IndexableType,
): IndexableType {
    if (!resolved.isVirtual) return key;
    return (resolved.keyLength === 1 ? [key] : key) as IndexableType;
}

/**
 * Recover the logical key a caller asked about from the physical one the cursor
 * reports. Without this, `keys()` on a virtual index would hand back whole
 * compound arrays.
 */
export function toLogicalKey(
    resolved: ResolvedIndex,
    key: IndexableType,
): IndexableType {
    if (!resolved.isVirtual) return key;
    const parts = (key as unknown[]).slice(0, resolved.keyLength);
    return (resolved.keyLength === 1 ? parts[0] : parts) as IndexableType;
}

/**
 * Translate a logical range into a physical IDBKeyRange.
 *
 * The virtual case is uniform once stated: an INCLUSIVE bound keeps the bare
 * prefix (`[k]`, which sorts before every `[k, …]`), while an EXCLUSIVE bound
 * uses `[k, MAX_KEY]` (which sorts after every `[k, …]`). So
 * `belowOrEqual(k)` becomes `<= [k, MAX_KEY]` and `below(k)` becomes `< [k]`.
 */
export function toKeyRange(
    IDBKeyRangeCtor: typeof IDBKeyRange,
    resolved: ResolvedIndex,
    range: LogicalRange,
): IDBKeyRange | null {
    const { lower, upper, lowerOpen, upperOpen } = range;

    if (lower === undefined && upper === undefined) return null;

    if (!resolved.isVirtual) {
        if (lower !== undefined && upper !== undefined) {
            return IDBKeyRangeCtor.bound(
                lower as IDBValidKey,
                upper as IDBValidKey,
                lowerOpen,
                upperOpen,
            );
        }
        return lower !== undefined
            ? IDBKeyRangeCtor.lowerBound(lower as IDBValidKey, lowerOpen)
            : IDBKeyRangeCtor.upperBound(upper as IDBValidKey, upperOpen);
    }

    const physLower =
        lower === undefined
            ? undefined
            : lowerOpen
              ? ([
                    ...(toPhysicalKey(resolved, lower) as unknown[]),
                    MAX_KEY,
                ] as unknown as IDBValidKey)
              : (toPhysicalKey(resolved, lower) as IDBValidKey);

    const physUpper =
        upper === undefined
            ? undefined
            : upperOpen
              ? (toPhysicalKey(resolved, upper) as IDBValidKey)
              : ([
                    ...(toPhysicalKey(resolved, upper) as unknown[]),
                    MAX_KEY,
                ] as unknown as IDBValidKey);

    if (physLower !== undefined && physUpper !== undefined) {
        return IDBKeyRangeCtor.bound(
            physLower,
            physUpper,
            lowerOpen,
            upperOpen,
        );
    }
    return physLower !== undefined
        ? IDBKeyRangeCtor.lowerBound(physLower, lowerOpen)
        : IDBKeyRangeCtor.upperBound(physUpper!, upperOpen);
}
