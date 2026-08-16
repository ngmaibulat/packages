import { exceptions } from '../errors/errors.ts';
import { cmp, isValidKey } from '../functions/cmp.ts';
import { isArray } from '../functions/utils.ts';
import { MAX_KEY, MAX_STRING, MIN_KEY } from '../globals/constants.ts';
import {
    resolveIndex,
    toKeyRange,
    toLogicalKey,
    toPhysicalKey,
    type LogicalRange,
    type ResolvedIndex,
} from '../dbcore/index-resolver.ts';
import { Collection, type CollectionContext } from './collection.ts';
import type { Table } from './table.ts';
import type { IndexableType } from '../types/schema.ts';

const SchemaError = exceptions['Schema']!;
const DataError = exceptions['Data']!;

const INVALID_KEY_MESSAGE =
    'Invalid key provided. Keys must be of type string, number, Date or Array<string | number | Date>.';

/** A half-open interval used by `inAnyRange` and its derivatives. */
interface RangeSpec {
    lower: IndexableType;
    upper: IndexableType;
}

function isAscii(value: string): boolean {
    for (let i = 0; i < value.length; i++) {
        if (value.charCodeAt(i) > 127) return false;
    }
    return true;
}

/**
 * The physical key to seek to when jumping the cursor.
 *
 * On a virtual index the bare prefix `[k]` sorts before every `[k, …]`, so it
 * is the right target going forwards; going backwards the cursor must land
 * after them all, which is `[k, MAX_KEY]`.
 */
function seekKey(
    resolved: ResolvedIndex,
    key: IndexableType,
    dir: 'next' | 'prev',
): IDBValidKey {
    const physical = toPhysicalKey(resolved, key);
    if (!resolved.isVirtual || dir === 'next') return physical as IDBValidKey;
    return [...(physical as unknown[]), MAX_KEY] as unknown as IDBValidKey;
}

export class WhereClause<T = any, TKey = IndexableType> {
    readonly _table: Table<T, TKey>;
    readonly _indexName: string | null;
    readonly _or: Collection<T, TKey> | null;

    constructor(
        table: Table<T, TKey>,
        indexName: string | null,
        orCollection?: Collection<T, TKey> | null,
    ) {
        this._table = table;
        this._indexName = indexName;
        this._or = orCollection ?? null;
    }

    // ------------------------------------------------------------ internals

    private get _keyRangeCtor(): typeof IDBKeyRange {
        return (
            this._table.db._deps.IDBKeyRange ??
            (globalThis as { IDBKeyRange: typeof IDBKeyRange }).IDBKeyRange
        );
    }

    private _baseContext(resolved: ResolvedIndex): CollectionContext {
        return {
            table: this._table as Table,
            resolved,
            range: null,
            dir: 'next',
            unique: false,
            algorithmFactory: null,
            filter: null,
            offset: 0,
            limit: Infinity,
            error: null,
            or: this._or as Collection<any, any> | null,
            valueMapper: this._table.schema.readHook ?? null,
        };
    }

    /** A collection that rejects on read, carrying the reason. */
    private _failed(error: unknown): Collection<T, TKey> {
        const resolved: ResolvedIndex = {
            index: null,
            isPrimaryKey: true,
            keyLength: 1,
            isVirtual: false,
        };
        return new Collection<T, TKey>({
            ...this._baseContext(resolved),
            error,
        });
    }

    /** A collection that is known to match nothing. */
    private _empty(): Collection<T, TKey> {
        const resolved = this._resolve();
        if (!resolved) return this._notIndexed();
        return new Collection<T, TKey>({
            ...this._baseContext(resolved),
            limit: 0,
        });
    }

    private _resolve(): ResolvedIndex | null {
        return resolveIndex(this._table.schema, this._indexName);
    }

    private _notIndexed(): Collection<T, TKey> {
        return this._failed(
            new SchemaError(
                `${this._indexName} is not indexed on table ${this._table.name}`,
            ),
        );
    }

    /** Build a collection over a logical range, translating for virtual indexes. */
    private _collection(
        range: LogicalRange | null,
        extra?: Partial<CollectionContext>,
    ): Collection<T, TKey> {
        const resolved = this._resolve();
        if (!resolved) return this._notIndexed();

        let keyRange: IDBKeyRange | null = null;
        if (range) {
            try {
                keyRange = toKeyRange(this._keyRangeCtor, resolved, range);
            } catch (error) {
                return this._failed(error);
            }
        }

        return new Collection<T, TKey>({
            ...this._baseContext(resolved),
            range: keyRange,
            ...extra,
        });
    }

    private _requireKey(key: unknown): Collection<T, TKey> | null {
        if (!isValidKey(key)) {
            return this._failed(new DataError(INVALID_KEY_MESSAGE));
        }
        return null;
    }

    private _requireString(value: unknown): Collection<T, TKey> | null {
        if (typeof value !== 'string') {
            return this._failed(new DataError('String expected.'));
        }
        return null;
    }

    // ------------------------------------------------------- simple ranges

    equals(key: IndexableType): Collection<T, TKey> {
        return (
            this._requireKey(key) ??
            this._collection({
                lower: key,
                upper: key,
                lowerOpen: false,
                upperOpen: false,
            })
        );
    }

    above(key: IndexableType): Collection<T, TKey> {
        return (
            this._requireKey(key) ??
            this._collection({ lower: key, lowerOpen: true, upperOpen: false })
        );
    }

    aboveOrEqual(key: IndexableType): Collection<T, TKey> {
        return (
            this._requireKey(key) ??
            this._collection({ lower: key, lowerOpen: false, upperOpen: false })
        );
    }

    below(key: IndexableType): Collection<T, TKey> {
        return (
            this._requireKey(key) ??
            this._collection({ upper: key, lowerOpen: false, upperOpen: true })
        );
    }

    belowOrEqual(key: IndexableType): Collection<T, TKey> {
        return (
            this._requireKey(key) ??
            this._collection({ upper: key, lowerOpen: false, upperOpen: false })
        );
    }

    between(
        lower: IndexableType,
        upper: IndexableType,
        includeLower = true,
        includeUpper = false,
    ): Collection<T, TKey> {
        const invalid = this._requireKey(lower) ?? this._requireKey(upper);
        if (invalid) return invalid;

        const order = cmp(lower, upper);
        // A degenerate range matches nothing rather than raising DataError,
        // which is what makes `between(x, x)` safe to build from user input.
        if (order > 0 || (order === 0 && (!includeLower || !includeUpper))) {
            return this._empty();
        }

        return this._collection({
            lower,
            upper,
            lowerOpen: !includeLower,
            upperOpen: !includeUpper,
        });
    }

    startsWith(prefix: string): Collection<T, TKey> {
        return (
            this._requireString(prefix) ??
            this.between(prefix, prefix + MAX_STRING, true, true)
        );
    }

    // --------------------------------------------------------- multi-value

    anyOf(
        keys: readonly IndexableType[] | IndexableType,
        ...rest: IndexableType[]
    ): Collection<T, TKey> {
        const list = (isArray(keys) ? keys : [keys, ...rest]) as IndexableType[];
        for (const key of list) {
            const invalid = this._requireKey(key);
            if (invalid) return invalid;
        }
        if (list.length === 0) return this._empty();

        const resolved = this._resolve();
        if (!resolved) return this._notIndexed();

        // Sorted and de-duplicated so the cursor can be advanced monotonically
        // instead of restarting for each needle.
        const sorted = [...list].sort(cmp).filter((key, i, all) => {
            return i === 0 || cmp(key, all[i - 1]!) !== 0;
        });

        const collection = this._collection({
            lower: sorted[0]!,
            upper: sorted[sorted.length - 1]!,
            lowerOpen: false,
            upperOpen: false,
        });

        collection._addAlgorithm((dir) => {
            const ordered = dir === 'next' ? sorted : [...sorted].reverse();
            const past = (a: IndexableType, b: IndexableType) =>
                dir === 'next' ? cmp(a, b) > 0 : cmp(a, b) < 0;
            let i = 0;

            return (cursor, advance, stop) => {
                const key = toLogicalKey(resolved, cursor.key as IndexableType);
                while (i < ordered.length && past(key, ordered[i]!)) i++;
                if (i === ordered.length) {
                    advance(stop);
                    return false;
                }
                if (cmp(key, ordered[i]!) === 0) return true;
                // The cursor is short of the next needle: jump straight to it.
                const target = seekKey(resolved, ordered[i]!, dir);
                advance(() => cursor.continue(target));
                return false;
            };
        });

        return collection;
    }

    noneOf(keys: readonly IndexableType[]): Collection<T, TKey> {
        const list = [...keys];
        for (const key of list) {
            const invalid = this._requireKey(key);
            if (invalid) return invalid;
        }
        if (list.length === 0) return this._collection(null);

        const sorted = list
            .sort(cmp)
            .filter((key, i, all) => i === 0 || cmp(key, all[i - 1]!) !== 0);

        // The complement: everything below the first, between each pair, and
        // above the last.
        const ranges: RangeSpec[] = [];
        let previous: IndexableType = MIN_KEY;
        for (const key of sorted) {
            ranges.push({ lower: previous, upper: key });
            previous = key;
        }
        ranges.push({ lower: previous, upper: MAX_KEY });

        return this.inAnyRange(
            ranges.map((r) => [r.lower, r.upper] as [IndexableType, IndexableType]),
            { includeLowers: false, includeUppers: false },
        );
    }

    notEqual(key: IndexableType): Collection<T, TKey> {
        return this._requireKey(key) ?? this.noneOf([key]);
    }

    inAnyRange(
        ranges: readonly (readonly [IndexableType, IndexableType])[],
        options?: { includeLowers?: boolean; includeUppers?: boolean },
    ): Collection<T, TKey> {
        const includeLowers = options?.includeLowers ?? true;
        const includeUppers = options?.includeUppers ?? false;

        if (ranges.length === 0) return this._empty();

        for (const range of ranges) {
            const invalid =
                this._requireKey(range[0]) ?? this._requireKey(range[1]);
            if (invalid) return invalid;
        }

        const resolved = this._resolve();
        if (!resolved) return this._notIndexed();

        // Sort and merge, so the algorithm can walk them in one pass.
        const sorted = ranges
            .map((r) => ({ lower: r[0], upper: r[1] }) as RangeSpec)
            .filter((r) => cmp(r.lower, r.upper) <= 0)
            .sort((a, b) => cmp(a.lower, b.lower));

        if (sorted.length === 0) return this._empty();

        const merged: RangeSpec[] = [{ ...sorted[0]! }];
        for (const range of sorted.slice(1)) {
            const last = merged[merged.length - 1]!;
            const touch = cmp(range.lower, last.upper);

            // Ranges that merely TOUCH at a point may only be merged if that
            // point is actually covered by one of them. `noneOf` depends on
            // this: its complement ranges meet at each excluded key with both
            // bounds open, and merging them there would swallow the exclusion
            // and match everything.
            const overlaps =
                touch < 0 || (touch === 0 && (includeLowers || includeUppers));

            if (overlaps) {
                if (cmp(range.upper, last.upper) > 0) last.upper = range.upper;
            } else {
                merged.push({ ...range });
            }
        }

        const collection = this._collection({
            lower: merged[0]!.lower,
            upper: merged[merged.length - 1]!.upper,
            lowerOpen: !includeLowers,
            upperOpen: !includeUppers,
        });

        collection._addAlgorithm((dir) => {
            const ordered = dir === 'next' ? merged : [...merged].reverse();
            let i = 0;

            /** Has the cursor moved beyond this range in the walk direction? */
            const past = (key: IndexableType, range: RangeSpec): boolean => {
                if (dir === 'next') {
                    const order = cmp(key, range.upper);
                    return order > 0 || (order === 0 && !includeUppers);
                }
                const order = cmp(key, range.lower);
                return order < 0 || (order === 0 && !includeLowers);
            };

            /** Has the cursor not yet reached this range? */
            const short = (key: IndexableType, range: RangeSpec): boolean => {
                if (dir === 'next') {
                    const order = cmp(key, range.lower);
                    return order < 0 || (order === 0 && !includeLowers);
                }
                const order = cmp(key, range.upper);
                return order > 0 || (order === 0 && !includeUppers);
            };

            return (cursor, advance, stop) => {
                const key = toLogicalKey(resolved, cursor.key as IndexableType);
                while (i < ordered.length && past(key, ordered[i]!)) i++;
                if (i === ordered.length) {
                    advance(stop);
                    return false;
                }
                if (short(key, ordered[i]!)) {
                    const edge =
                        dir === 'next' ? ordered[i]!.lower : ordered[i]!.upper;

                    // Sitting exactly on an excluded boundary -- which is the
                    // normal case for `noneOf`, whose ranges meet at each
                    // excluded key. Seeking to that key would ask the cursor to
                    // move to where it already is, and `continue(key)` requires
                    // strict forward progress, so step by one instead.
                    if (cmp(key, edge) === 0) {
                        advance(() => cursor.continue());
                        return false;
                    }

                    const target = seekKey(resolved, edge, dir);
                    advance(() => cursor.continue(target));
                    return false;
                }
                return true;
            };
        });

        return collection;
    }

    startsWithAnyOf(
        prefixes: readonly string[] | string,
        ...rest: string[]
    ): Collection<T, TKey> {
        const list = (isArray(prefixes) ? prefixes : [prefixes, ...rest]) as string[];
        for (const prefix of list) {
            const invalid = this._requireString(prefix);
            if (invalid) return invalid;
        }
        if (list.length === 0) return this._empty();

        return this.inAnyRange(
            list.map(
                (prefix) =>
                    [prefix, prefix + MAX_STRING] as [IndexableType, IndexableType],
            ),
            { includeLowers: true, includeUppers: true },
        );
    }

    // ------------------------------------------------------- case-insensitive

    /**
     * Case-insensitive matching.
     *
     * Correctness first: the filter alone is always right. The key range is a
     * pure optimisation, applied only when every needle is ASCII -- there,
     * uppercase sorts below lowercase for every letter, so all case variants of
     * a string lie between its all-uppercase and all-lowercase forms. That
     * reasoning does not survive non-ASCII case mappings, so those fall back to
     * scanning the index and filtering.
     */
    private _ignoreCase(
        needles: string[],
        mode: 'equals' | 'startsWith',
    ): Collection<T, TKey> {
        for (const needle of needles) {
            const invalid = this._requireString(needle);
            if (invalid) return invalid;
        }
        if (needles.length === 0) return this._empty();

        const lowered = needles.map((needle) => needle.toLowerCase());
        const boundable = needles.every(isAscii);

        let range: LogicalRange | null = null;
        if (boundable) {
            const lowers = needles.map((needle) => needle.toUpperCase());
            const uppers = needles.map((needle) => needle.toLowerCase());
            const lower = lowers.reduce((a, b) => (cmp(a, b) <= 0 ? a : b));
            const upper = uppers.reduce((a, b) => (cmp(a, b) >= 0 ? a : b));
            range = {
                lower,
                upper: mode === 'startsWith' ? upper + MAX_STRING : upper,
                lowerOpen: false,
                upperOpen: false,
            };
        }

        const resolved = this._resolve();
        if (!resolved) return this._notIndexed();

        const collection = this._collection(range);
        collection._addFilter((cursor) => {
            const key = toLogicalKey(resolved, cursor.key as IndexableType);
            if (typeof key !== 'string') return false;
            const candidate = key.toLowerCase();
            return mode === 'equals'
                ? lowered.includes(candidate)
                : lowered.some((needle) => candidate.startsWith(needle));
        });

        return collection;
    }

    equalsIgnoreCase(key: string): Collection<T, TKey> {
        return this._ignoreCase([key], 'equals');
    }

    startsWithIgnoreCase(prefix: string): Collection<T, TKey> {
        return this._ignoreCase([prefix], 'startsWith');
    }

    anyOfIgnoreCase(
        keys: readonly string[] | string,
        ...rest: string[]
    ): Collection<T, TKey> {
        const list = (isArray(keys) ? keys : [keys, ...rest]) as string[];
        return this._ignoreCase(list, 'equals');
    }

    startsWithAnyOfIgnoreCase(
        prefixes: readonly string[] | string,
        ...rest: string[]
    ): Collection<T, TKey> {
        const list = (isArray(prefixes) ? prefixes : [prefixes, ...rest]) as string[];
        return this._ignoreCase(list, 'startsWith');
    }
}
