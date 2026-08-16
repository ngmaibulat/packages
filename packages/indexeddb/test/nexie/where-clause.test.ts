import { describe as suite, it as test, before, after } from 'node:test';
import { assert } from 'chai';

import { dispose, freshName, Nexie } from './utils.ts';
import type { Table } from '../../src/nexie/classes/table.ts';

interface Person {
    id?: number;
    name: string;
    age: number;
    city: string;
    tags: string[];
}

const PEOPLE: Person[] = [
    { name: 'Alice', age: 25, city: 'Oslo', tags: ['admin', 'dev'] },
    { name: 'Bob', age: 30, city: 'Bergen', tags: ['dev'] },
    { name: 'Carol', age: 35, city: 'Oslo', tags: ['ops'] },
    { name: 'Dave', age: 40, city: 'Tromso', tags: ['dev', 'ops'] },
    { name: 'Eve', age: 45, city: 'Bergen', tags: [] },
];

let db: Nexie;
let people: Table<Person, number>;

before(async () => {
    db = new Nexie(freshName('where'));
    db.version(1).stores({
        people: '++id, name, age, city, *tags, [city+age]',
    });
    people = db.table<Person, number>('people');
    await people.bulkAdd(PEOPLE.map((p) => ({ ...p })));
});

after(async () => {
    await dispose(db);
});

/** Names matching a query, sorted so assertions do not depend on cursor order. */
async function names(collection: {
    toArray(): PromiseLike<Person[]>;
}): Promise<string[]> {
    const found = await collection.toArray();
    return found.map((p) => p.name).sort();
}

suite('WhereClause: simple ranges', () => {
    test('equals', async () => {
        assert.deepEqual(await names(people.where('city').equals('Oslo')), [
            'Alice',
            'Carol',
        ]);
    });

    test('above and aboveOrEqual', async () => {
        assert.deepEqual(await names(people.where('age').above(35)), [
            'Dave',
            'Eve',
        ]);
        assert.deepEqual(await names(people.where('age').aboveOrEqual(35)), [
            'Carol',
            'Dave',
            'Eve',
        ]);
    });

    test('below and belowOrEqual', async () => {
        assert.deepEqual(await names(people.where('age').below(30)), ['Alice']);
        assert.deepEqual(await names(people.where('age').belowOrEqual(30)), [
            'Alice',
            'Bob',
        ]);
    });

    test('between defaults to inclusive lower, exclusive upper', async () => {
        assert.deepEqual(await names(people.where('age').between(30, 40)), [
            'Bob',
            'Carol',
        ]);
        assert.deepEqual(
            await names(people.where('age').between(30, 40, true, true)),
            ['Bob', 'Carol', 'Dave'],
        );
        assert.deepEqual(
            await names(people.where('age').between(30, 40, false, false)),
            ['Carol'],
        );
    });

    test('a degenerate between matches nothing rather than throwing', async () => {
        assert.deepEqual(await names(people.where('age').between(40, 30)), []);
        assert.deepEqual(await names(people.where('age').between(30, 30)), []);
        assert.deepEqual(
            await names(people.where('age').between(30, 30, true, true)),
            ['Bob'],
        );
    });

    test('startsWith', async () => {
        assert.deepEqual(await names(people.where('name').startsWith('A')), [
            'Alice',
        ]);
        assert.deepEqual(await names(people.where('city').startsWith('B')), [
            'Bob',
            'Eve',
        ]);
    });

    test('an invalid key rejects rather than returning nothing', async () => {
        let caught: unknown;
        await people
            .where('age')
            .equals(null as never)
            .toArray()
            .catch((error) => {
                caught = error;
            });
        assert.strictEqual((caught as Error).name, 'DataError');
    });

    test('querying an unindexed property rejects', async () => {
        let caught: unknown;
        await people
            .where('nope')
            .equals(1)
            .toArray()
            .catch((error) => {
                caught = error;
            });
        assert.strictEqual((caught as Error).name, 'SchemaError');
    });
});

suite('WhereClause: multi-value operators', () => {
    test('anyOf, as an array and as varargs', async () => {
        assert.deepEqual(await names(people.where('age').anyOf([25, 45])), [
            'Alice',
            'Eve',
        ]);
        assert.deepEqual(await names(people.where('age').anyOf(25, 45)), [
            'Alice',
            'Eve',
        ]);
    });

    test('anyOf ignores duplicates and unmatched keys', async () => {
        assert.deepEqual(
            await names(people.where('age').anyOf([25, 25, 999])),
            ['Alice'],
        );
    });

    test('anyOf of an empty list matches nothing', async () => {
        assert.deepEqual(await names(people.where('age').anyOf([])), []);
    });

    test('noneOf', async () => {
        assert.deepEqual(await names(people.where('age').noneOf([25, 30])), [
            'Carol',
            'Dave',
            'Eve',
        ]);
    });

    test('notEqual', async () => {
        assert.deepEqual(await names(people.where('city').notEqual('Oslo')), [
            'Bob',
            'Dave',
            'Eve',
        ]);
    });

    test('inAnyRange', async () => {
        assert.deepEqual(
            await names(
                people.where('age').inAnyRange([
                    [25, 30],
                    [40, 45],
                ]),
            ),
            ['Alice', 'Dave'],
        );
        assert.deepEqual(
            await names(
                people.where('age').inAnyRange(
                    [
                        [25, 30],
                        [40, 45],
                    ],
                    { includeLowers: true, includeUppers: true },
                ),
            ),
            ['Alice', 'Bob', 'Dave', 'Eve'],
        );
    });

    test('inAnyRange merges overlapping ranges', async () => {
        assert.deepEqual(
            await names(
                people.where('age').inAnyRange(
                    [
                        [25, 35],
                        [30, 45],
                    ],
                    { includeLowers: true, includeUppers: true },
                ),
            ),
            ['Alice', 'Bob', 'Carol', 'Dave', 'Eve'],
        );
    });

    test('startsWithAnyOf', async () => {
        assert.deepEqual(
            await names(people.where('name').startsWithAnyOf(['A', 'D'])),
            ['Alice', 'Dave'],
        );
    });

    test('operators work in reverse too', async () => {
        const ages = await people
            .where('age')
            .anyOf([25, 35, 45])
            .reverse()
            .toArray();
        assert.deepEqual(
            ages.map((p) => p.age),
            [45, 35, 25],
        );
    });
});

suite('WhereClause: case-insensitive operators', () => {
    test('equalsIgnoreCase', async () => {
        assert.deepEqual(
            await names(people.where('name').equalsIgnoreCase('alice')),
            ['Alice'],
        );
        assert.deepEqual(
            await names(people.where('name').equalsIgnoreCase('ALICE')),
            ['Alice'],
        );
    });

    test('startsWithIgnoreCase', async () => {
        assert.deepEqual(
            await names(people.where('city').startsWithIgnoreCase('osl')),
            ['Alice', 'Carol'],
        );
    });

    test('anyOfIgnoreCase', async () => {
        assert.deepEqual(
            await names(people.where('name').anyOfIgnoreCase(['alice', 'BOB'])),
            ['Alice', 'Bob'],
        );
    });

    test('startsWithAnyOfIgnoreCase', async () => {
        assert.deepEqual(
            await names(
                people.where('city').startsWithAnyOfIgnoreCase(['osl', 'BER']),
            ),
            ['Alice', 'Bob', 'Carol', 'Eve'],
        );
    });

    test('a non-ASCII needle still matches, via the scan fallback', async () => {
        const extra = new Nexie(freshName('unicode'));
        extra.version(1).stores({ words: '++id, text' });
        const words = extra.table<{ text: string }, number>('words');
        await words.bulkAdd([{ text: 'Ünicode' }, { text: 'plain' }]);

        const found = await words
            .where('text')
            .equalsIgnoreCase('ünicode')
            .toArray();
        assert.deepEqual(
            found.map((w) => w.text),
            ['Ünicode'],
        );

        await dispose(extra);
    });
});

suite('WhereClause: multiEntry and compound indexes', () => {
    test('a multiEntry index matches any element', async () => {
        assert.deepEqual(await names(people.where('tags').equals('dev')), [
            'Alice',
            'Bob',
            'Dave',
        ]);
    });

    test('a compound index matches an exact tuple', async () => {
        assert.deepEqual(
            await names(people.where('[city+age]').equals(['Oslo', 35])),
            ['Carol'],
        );
    });

    test('where() accepts an array form for compound indexes', async () => {
        assert.deepEqual(
            await names(people.where(['city', 'age']).equals(['Bergen', 30])),
            ['Bob'],
        );
    });
});

suite('virtual indexes', () => {
    let virtualDb: Nexie;
    let items: Table<{ a: string; b: number; c: number }, number>;

    before(async () => {
        virtualDb = new Nexie(freshName('virtual'));
        // Deliberately declares ONLY the three-part compound index.
        virtualDb.version(1).stores({ items: '++id, [a+b+c]' });
        items = virtualDb.table('items');
        await items.bulkAdd([
            { a: 'x', b: 1, c: 10 },
            { a: 'x', b: 1, c: 20 },
            { a: 'x', b: 2, c: 30 },
            { a: 'y', b: 1, c: 40 },
            { a: 'z', b: 9, c: 50 },
        ]);
    });

    after(async () => {
        await dispose(virtualDb);
    });

    test('a single-component prefix is queryable', async () => {
        const found = await items.where('a').equals('x').toArray();
        assert.deepEqual(
            found.map((i) => i.c).sort((l, r) => l - r),
            [10, 20, 30],
        );
    });

    test('a two-component prefix is queryable', async () => {
        const found = await items.where('[a+b]').equals(['x', 1]).toArray();
        assert.deepEqual(
            found.map((i) => i.c).sort((l, r) => l - r),
            [10, 20],
        );
    });

    test('prefix ranges respect inclusivity', async () => {
        // belowOrEqual('x') must include every [x, *] entry, and below('x')
        // must exclude them all -- the two directions the prefix rule decides.
        const atMost = await items.where('a').belowOrEqual('x').toArray();
        assert.lengthOf(atMost, 3);

        const strictlyBelow = await items.where('a').below('x').toArray();
        assert.lengthOf(strictlyBelow, 0);

        const above = await items.where('a').above('x').toArray();
        assert.deepEqual(
            above.map((i) => i.a).sort(),
            ['y', 'z'],
        );

        const aboveOrEqual = await items.where('a').aboveOrEqual('y').toArray();
        assert.lengthOf(aboveOrEqual, 2);
    });

    test('keys() returns the prefix, not the whole compound key', async () => {
        const keys = await items.where('a').equals('x').keys();
        assert.deepEqual(keys, ['x', 'x', 'x'], 'truncated to the prefix');
    });

    test('anyOf works over a virtual index', async () => {
        const found = await items.where('a').anyOf(['x', 'z']).toArray();
        assert.deepEqual(
            found.map((i) => i.c).sort((l, r) => l - r),
            [10, 20, 30, 50],
        );
    });

    test('orderBy uses the compound index for a prefix', async () => {
        const ordered = await items.orderBy('a').toArray();
        assert.deepEqual(
            ordered.map((i) => i.a),
            ['x', 'x', 'x', 'y', 'z'],
        );
    });
});
