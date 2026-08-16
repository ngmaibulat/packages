import { cmp } from './cmp.ts';
import { MAX_KEY, MIN_KEY } from '../globals/constants.ts';
import type { IndexableType } from '../types/schema.ts';

/**
 * A set of key ranges, kept disjoint and sorted.
 *
 * This is what makes `liveQuery` more than "re-run everything on every write":
 * a query records the ranges it READ, a transaction records the keys it WROTE,
 * and the two are intersected. `db.friends.get(7)` is not disturbed by a write
 * to friend 8.
 *
 * **Both endpoints are inclusive**, deliberately. Query ranges have open and
 * closed bounds, but collapsing them all to closed can only ever make a set
 * LARGER, and a larger set means an extra re-run rather than a missed one. The
 * asymmetry is the whole design rule here: over-invalidating costs a wasted
 * query, under-invalidating costs a UI that silently stops updating.
 *
 * Merging follows from that: two ranges merge when they overlap or share an
 * endpoint. They are NOT merged when they merely sit next to each other --
 * `[1,2]` and `[3,4]` stay separate, because keys have no successor function in
 * general and pretending otherwise would swallow whatever lies between. That is
 * the same trap the `noneOf` operator fell into in the query planner.
 */
export interface KeyRange {
    /** Inclusive lower bound. */
    from: IndexableType;
    /** Inclusive upper bound. */
    to: IndexableType;
}

/** True when two inclusive ranges share at least one key. */
export function rangesOverlap(a: KeyRange, b: KeyRange): boolean {
    return cmp(a.from, b.to) <= 0 && cmp(b.from, a.to) <= 0;
}

/**
 * Insert `range` into `ranges`, keeping it sorted and disjoint.
 *
 * Exported because the observability set merges range lists it did not build,
 * and doing that through a full RangeSet round trip would allocate for nothing.
 */
export function mergeRanges(ranges: KeyRange[], range: KeyRange): KeyRange[] {
    let from = range.from;
    let to = range.to;

    // Binary search for the first range that could touch this one: the first
    // whose upper bound is not below our lower bound.
    let low = 0;
    let high = ranges.length;
    while (low < high) {
        const mid = (low + high) >> 1;
        if (cmp(ranges[mid]!.to, from) < 0) low = mid + 1;
        else high = mid;
    }

    // Absorb every range that overlaps or touches, widening as we go.
    let end = low;
    while (end < ranges.length && cmp(ranges[end]!.from, to) <= 0) {
        if (cmp(ranges[end]!.from, from) < 0) from = ranges[end]!.from;
        if (cmp(ranges[end]!.to, to) > 0) to = ranges[end]!.to;
        end++;
    }

    ranges.splice(low, end - low, { from, to });
    return ranges;
}

export class RangeSet {
    /** Sorted, disjoint, inclusive. */
    private _ranges: KeyRange[] = [];

    constructor(from?: IndexableType, to?: IndexableType) {
        if (from !== undefined) this.addRange(from, to === undefined ? from : to);
    }

    get isEmpty(): boolean {
        return this._ranges.length === 0;
    }

    /** The number of disjoint ranges, not the number of keys. */
    get size(): number {
        return this._ranges.length;
    }

    addRange(from: IndexableType, to: IndexableType): this {
        mergeRanges(this._ranges, { from, to });
        return this;
    }

    addKey(key: IndexableType): this {
        return this.addRange(key, key);
    }

    addKeys(keys: readonly IndexableType[]): this {
        for (const key of keys) this.addKey(key);
        return this;
    }

    /** Every possible key. Used where a mutation's effect cannot be narrowed. */
    addAll(): this {
        this._ranges = [{ from: MIN_KEY, to: MAX_KEY }];
        return this;
    }

    add(other: RangeSet): this {
        for (const range of other._ranges) this.addRange(range.from, range.to);
        return this;
    }

    hasRange(range: KeyRange): boolean {
        // Same binary search as the insert: find the first range that could
        // reach this one, then a single overlap test decides.
        let low = 0;
        let high = this._ranges.length;
        while (low < high) {
            const mid = (low + high) >> 1;
            if (cmp(this._ranges[mid]!.to, range.from) < 0) low = mid + 1;
            else high = mid;
        }
        return (
            low < this._ranges.length &&
            cmp(this._ranges[low]!.from, range.to) <= 0
        );
    }

    hasKey(key: IndexableType): boolean {
        return this.hasRange({ from: key, to: key });
    }

    /** True when any range in `other` overlaps any range here. */
    intersects(other: RangeSet): boolean {
        // Walk the smaller side; each probe is a binary search on the larger.
        const [probe, target] =
            this._ranges.length <= other._ranges.length
                ? [this, other]
                : [other, this];
        for (const range of probe._ranges) {
            if (target.hasRange(range)) return true;
        }
        return false;
    }

    ranges(): readonly KeyRange[] {
        return this._ranges;
    }

    [Symbol.iterator](): IterableIterator<KeyRange> {
        return this._ranges[Symbol.iterator]();
    }
}
