import { describe as suite, it as test } from 'node:test';
import { assert } from 'chai';

import {
    RangeSet,
    mergeRanges,
    rangesOverlap,
} from '../../src/nexie/functions/rangeset.ts';
import { MAX_KEY, MIN_KEY } from '../../src/nexie/globals/constants.ts';
import type { KeyRange } from '../../src/nexie/functions/rangeset.ts';

function ranges(set: RangeSet): [unknown, unknown][] {
    return set.ranges().map(({ from, to }) => [from, to]);
}

suite('rangesOverlap', () => {
    test('is true for overlapping and touching ranges', () => {
        assert.isTrue(rangesOverlap({ from: 1, to: 5 }, { from: 3, to: 9 }));
        assert.isTrue(rangesOverlap({ from: 1, to: 5 }, { from: 5, to: 9 }));
        assert.isTrue(rangesOverlap({ from: 1, to: 9 }, { from: 3, to: 4 }));
    });

    test('is false for disjoint ranges', () => {
        assert.isFalse(rangesOverlap({ from: 1, to: 2 }, { from: 3, to: 4 }));
        assert.isFalse(rangesOverlap({ from: 3, to: 4 }, { from: 1, to: 2 }));
    });
});

suite('mergeRanges', () => {
    test('keeps the list sorted regardless of insertion order', () => {
        const list: KeyRange[] = [];
        mergeRanges(list, { from: 10, to: 12 });
        mergeRanges(list, { from: 1, to: 2 });
        mergeRanges(list, { from: 5, to: 6 });

        assert.deepEqual(
            list.map((r) => [r.from, r.to]),
            [
                [1, 2],
                [5, 6],
                [10, 12],
            ],
        );
    });

    test('absorbs every range a new one spans', () => {
        const list: KeyRange[] = [];
        mergeRanges(list, { from: 1, to: 2 });
        mergeRanges(list, { from: 4, to: 5 });
        mergeRanges(list, { from: 7, to: 8 });
        mergeRanges(list, { from: 0, to: 6 });

        assert.deepEqual(
            list.map((r) => [r.from, r.to]),
            [
                [0, 6],
                [7, 8],
            ],
        );
    });

    test('merges ranges sharing an endpoint, but not adjacent ones', () => {
        const shared: KeyRange[] = [];
        mergeRanges(shared, { from: 1, to: 3 });
        mergeRanges(shared, { from: 3, to: 5 });
        assert.deepEqual(
            shared.map((r) => [r.from, r.to]),
            [[1, 5]],
        );

        // 2 and 3 are adjacent integers, but keys have no successor function in
        // general -- merging here would swallow every key between them.
        const adjacent: KeyRange[] = [];
        mergeRanges(adjacent, { from: 1, to: 2 });
        mergeRanges(adjacent, { from: 3, to: 4 });
        assert.lengthOf(adjacent, 2);
    });
});

suite('RangeSet', () => {
    test('starts empty and reports point membership', () => {
        const set = new RangeSet();
        assert.isTrue(set.isEmpty);
        assert.isFalse(set.hasKey(1));

        set.addKey(1);
        assert.isFalse(set.isEmpty);
        assert.isTrue(set.hasKey(1));
        assert.isFalse(set.hasKey(2));
    });

    test('addKeys de-duplicates into disjoint ranges', () => {
        const set = new RangeSet().addKeys([5, 1, 5, 3]);
        assert.deepEqual(ranges(set), [
            [1, 1],
            [3, 3],
            [5, 5],
        ]);
    });

    test('addAll covers every key', () => {
        const set = new RangeSet().addAll();
        assert.isTrue(set.hasKey(-Infinity));
        assert.isTrue(set.hasKey('zzz'));
        assert.isTrue(set.hasKey([1, 2]));
        assert.deepEqual(ranges(set), [[MIN_KEY, MAX_KEY]]);
    });

    test('constructor takes a point or a range', () => {
        assert.deepEqual(ranges(new RangeSet(7)), [[7, 7]]);
        assert.deepEqual(ranges(new RangeSet(1, 4)), [[1, 4]]);
    });

    test('intersects both ways round', () => {
        const a = new RangeSet().addRange(1, 5);
        const b = new RangeSet().addKey(3);
        const c = new RangeSet().addKey(9);

        assert.isTrue(a.intersects(b));
        assert.isTrue(b.intersects(a));
        assert.isFalse(a.intersects(c));
        assert.isFalse(c.intersects(a));
        assert.isFalse(a.intersects(new RangeSet()));
    });

    test('add() unions another set', () => {
        const a = new RangeSet().addRange(1, 2);
        a.add(new RangeSet().addRange(4, 5));
        assert.deepEqual(ranges(a), [
            [1, 2],
            [4, 5],
        ]);
    });

    test('orders mixed key types the way IndexedDB does', () => {
        // number < Date < string < binary < Array. A set holding a number and a
        // string must not merge them into one span.
        const set = new RangeSet().addKey(1).addKey('a');
        assert.lengthOf(set.ranges(), 2);
        assert.isFalse(set.hasKey('b'));
        assert.isTrue(set.hasKey('a'));
    });

    test('is iterable', () => {
        const set = new RangeSet().addKey(1).addKey(3);
        assert.deepEqual(
            [...set].map((r) => r.from),
            [1, 3],
        );
    });
});
