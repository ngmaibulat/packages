import { describe as suite, it as test, beforeEach, afterEach } from 'node:test';
import { assert } from 'chai';

import { dispose, freshName, Nexie } from './utils.ts';
import { add, remove } from '../../src/nexie/functions/prop-modification.ts';
import type { Table } from '../../src/nexie/classes/table.ts';

interface Person {
    id?: number;
    name: string;
    age: number;
    city: string;
    visits: number;
    tags: string[];
    score?: number | unknown[];
    labels?: string[];
    when?: Date;
}

const PEOPLE: Person[] = [
    { name: 'Alice', age: 25, city: 'Oslo', visits: 1, tags: ['dev'] },
    { name: 'Bob', age: 30, city: 'Bergen', visits: 2, tags: ['dev'] },
    { name: 'Carol', age: 35, city: 'Oslo', visits: 3, tags: ['ops'] },
    { name: 'Dave', age: 40, city: 'Tromso', visits: 4, tags: ['dev', 'ops'] },
    { name: 'Eve', age: 45, city: 'Bergen', visits: 5, tags: [] },
];

let db: Nexie;
let people: Table<Person, number>;

beforeEach(async () => {
    db = new Nexie(freshName('coll'));
    db.version(1).stores({ people: '++id, name, age, city, *tags' });
    people = db.table<Person, number>('people');
    await people.bulkAdd(PEOPLE.map((p) => ({ ...p })));
});

afterEach(async () => {
    await dispose(db);
});

suite('Collection: reading', () => {
    test('toArray over the whole table', async () => {
        const all = await people.toCollection().toArray();
        assert.lengthOf(all, 5);
    });

    test('count, with and without a filter', async () => {
        assert.strictEqual(await people.toCollection().count(), 5);
        assert.strictEqual(
            await people.filter((p) => p.city === 'Oslo').count(),
            2,
        );
    });

    test('first and last follow the index order', async () => {
        const youngest = await people.orderBy('age').first();
        const oldest = await people.orderBy('age').last();
        assert.strictEqual(youngest?.name, 'Alice');
        assert.strictEqual(oldest?.name, 'Eve');
    });

    test('firstKey and lastKey', async () => {
        assert.strictEqual(await people.orderBy('age').firstKey(), 25);
        assert.strictEqual(await people.orderBy('age').lastKey(), 45);
    });

    test('keys, primaryKeys and uniqueKeys', async () => {
        assert.deepEqual(await people.orderBy('age').keys(), [
            25, 30, 35, 40, 45,
        ]);

        const primaries = await people.orderBy('age').primaryKeys();
        assert.lengthOf(primaries, 5);

        assert.deepEqual(await people.orderBy('city').uniqueKeys(), [
            'Bergen',
            'Oslo',
            'Tromso',
        ]);
    });

    test('each visits every record with its keys', async () => {
        const seen: string[] = [];
        await people.orderBy('age').each((person, cursor) => {
            seen.push(`${person.name}@${String(cursor.key)}`);
        });
        assert.deepEqual(seen, [
            'Alice@25',
            'Bob@30',
            'Carol@35',
            'Dave@40',
            'Eve@45',
        ]);
    });

    test('eachKey, eachPrimaryKey and eachUniqueKey', async () => {
        const keys: unknown[] = [];
        await people.orderBy('age').eachKey((key) => keys.push(key));
        assert.deepEqual(keys, [25, 30, 35, 40, 45]);

        const primaries: unknown[] = [];
        await people.orderBy('age').eachPrimaryKey((key) => primaries.push(key));
        assert.lengthOf(primaries, 5);

        const cities: unknown[] = [];
        await people.orderBy('city').eachUniqueKey((key) => cities.push(key));
        assert.deepEqual(cities, ['Bergen', 'Oslo', 'Tromso']);
    });

    test('sortBy sorts client-side on any property', async () => {
        const byName = await people.toCollection().sortBy('name');
        assert.deepEqual(
            byName.map((p) => p.name),
            ['Alice', 'Bob', 'Carol', 'Dave', 'Eve'],
        );

        const byVisitsDesc = await people
            .toCollection()
            .reverse()
            .sortBy('visits');
        assert.deepEqual(
            byVisitsDesc.map((p) => p.visits),
            [5, 4, 3, 2, 1],
        );
    });
});

suite('Collection: chaining', () => {
    test('offset and limit', async () => {
        const page = await people.orderBy('age').offset(1).limit(2).toArray();
        assert.deepEqual(
            page.map((p) => p.name),
            ['Bob', 'Carol'],
        );
    });

    test('limit(0) matches nothing', async () => {
        assert.deepEqual(await people.orderBy('age').limit(0).toArray(), []);
        assert.strictEqual(await people.orderBy('age').limit(0).count(), 0);
    });

    test('reverse flips the order', async () => {
        const names = await people.orderBy('age').reverse().toArray();
        assert.deepEqual(
            names.map((p) => p.name),
            ['Eve', 'Dave', 'Carol', 'Bob', 'Alice'],
        );
    });

    test('filter and and() both narrow', async () => {
        const found = await people
            .where('age')
            .above(25)
            .and((p) => p.city === 'Bergen')
            .toArray();
        assert.deepEqual(
            found.map((p) => p.name).sort(),
            ['Bob', 'Eve'],
        );
    });

    test('until stops the walk', async () => {
        const upTo = await people
            .orderBy('age')
            .until((p) => p.name === 'Carol')
            .toArray();
        assert.deepEqual(
            upTo.map((p) => p.name),
            ['Alice', 'Bob'],
        );

        const including = await people
            .orderBy('age')
            .until((p) => p.name === 'Carol', true)
            .toArray();
        assert.deepEqual(
            including.map((p) => p.name),
            ['Alice', 'Bob', 'Carol'],
        );
    });

    test('or unions two indexed queries, de-duplicated', async () => {
        const found = await people
            .where('city')
            .equals('Tromso')
            .or('age')
            .below(30)
            .toArray();
        assert.deepEqual(
            found.map((p) => p.name).sort(),
            ['Alice', 'Dave'],
        );
    });

    test('or does not double-count a record matching both branches', async () => {
        const found = await people
            .where('city')
            .equals('Oslo')
            .or('age')
            .equals(25)
            .toArray();
        assert.deepEqual(
            found.map((p) => p.name).sort(),
            ['Alice', 'Carol'],
            'Alice matches both branches but appears once',
        );
    });

    test('distinct collapses multiEntry duplicates', async () => {
        // Dave has both tags, so an unfiltered multiEntry query yields him twice.
        const withDupes = await people
            .where('tags')
            .anyOf(['dev', 'ops'])
            .toArray();
        const distinct = await people
            .where('tags')
            .anyOf(['dev', 'ops'])
            .distinct()
            .toArray();

        assert.isAbove(withDupes.length, distinct.length);
        assert.deepEqual(
            distinct.map((p) => p.name).sort(),
            ['Alice', 'Bob', 'Carol', 'Dave'],
        );
    });

    test('clone does not disturb the original', async () => {
        const base = people.orderBy('age');
        const limited = base.limit(2);
        assert.lengthOf(await limited.toArray(), 2);
        assert.lengthOf(await base.toArray(), 5, 'original unchanged');
    });
});

suite('Collection: mutations', () => {
    test('modify with a callback', async () => {
        const changed = await people
            .where('city')
            .equals('Oslo')
            .modify((person) => {
                person.visits += 10;
            });

        assert.strictEqual(changed, 2);
        const oslo = await people.where('city').equals('Oslo').toArray();
        assert.deepEqual(
            oslo.map((p) => p.visits).sort((a, b) => a - b),
            [11, 13],
        );
    });

    test('modify with an update spec', async () => {
        const changed = await people
            .where('city')
            .equals('Bergen')
            .modify({ city: 'Bergen City' });

        assert.strictEqual(changed, 2);
        assert.strictEqual(
            await people.where('city').equals('Bergen City').count(),
            2,
        );
    });

    test('modify can delete by nulling ctx.value', async () => {
        const changed = await people
            .where('age')
            .above(35)
            .modify((_person, ctx) => {
                ctx.value = null;
            });

        assert.strictEqual(changed, 2);
        assert.strictEqual(await people.toCollection().count(), 3);
    });

    test('delete removes matching records and counts them', async () => {
        const deleted = await people.where('city').equals('Oslo').delete();
        assert.strictEqual(deleted, 2);
        assert.strictEqual(await people.toCollection().count(), 3);
    });

    test('delete over a primary key range takes the bulk path', async () => {
        const keys = await people.orderBy('age').primaryKeys();
        const deleted = await people
            .where(':id')
            .anyOf([keys[0]!, keys[1]!])
            .delete();
        assert.strictEqual(deleted, 2);
        assert.strictEqual(await people.toCollection().count(), 3);
    });
});

suite('Table: update, upsert and bulkUpdate', () => {
    test('update by key returns 1, or 0 when absent', async () => {
        const id = (await people.orderBy('age').primaryKeys())[0]!;
        assert.strictEqual(await people.update(id, { visits: 99 }), 1);
        assert.strictEqual((await people.get(id))?.visits, 99);
        assert.strictEqual(await people.update(4242, { visits: 1 }), 0);
    });

    test('update accepts the record itself', async () => {
        const alice = (await people.where('name').equals('Alice').first())!;
        assert.strictEqual(await people.update(alice, { city: 'Trondheim' }), 1);
        assert.strictEqual(
            (await people.get(alice.id!))?.city,
            'Trondheim',
        );
    });

    test('update rejects an object with no primary key', async () => {
        let caught: unknown;
        await people
            .update({ name: 'Nobody' } as never, { visits: 1 })
            .catch((error) => {
                caught = error;
            });
        assert.strictEqual((caught as Error).name, 'InvalidArgumentError');
    });

    test('update supports PropModification values', async () => {
        const alice = (await people.where('name').equals('Alice').first())!;
        await people.update(alice.id!, {
            visits: add(5),
            tags: add(['newtag']),
        });

        const updated = await people.get(alice.id!);
        assert.strictEqual(updated?.visits, 6);
        // Array terms are concatenated and the result sorted, as in Dexie.
        assert.deepEqual(updated?.tags, ['dev', 'newtag']);

        await people.update(alice.id!, { tags: remove(['newtag']) });
        assert.deepEqual((await people.get(alice.id!))?.tags, ['dev']);
    });

    test('PropModification arithmetic matches Dexie', async () => {
        const alice = (await people.where('name').equals('Alice').first())!;
        // A numeric term on a missing or non-numeric value counts from 0.
        await people.update(alice.id!, { score: add(3) });
        assert.strictEqual((await people.get(alice.id!))?.score, 3);
        // An array term on a missing value creates the array.
        await people.update(alice.id!, { labels: add(['b', 'a']) });
        assert.deepEqual((await people.get(alice.id!))?.labels, ['a', 'b']);
        // Removing from a non-array yields an empty array.
        await people.update(alice.id!, { score: remove(['x']) });
        assert.deepEqual((await people.get(alice.id!))?.score, []);
    });

    test('upsert reports whether the record existed', async () => {
        const alice = (await people.where('name').equals('Alice').first())!;
        assert.isTrue(await people.upsert(alice.id!, { visits: 42 }));
        assert.strictEqual((await people.get(alice.id!))?.visits, 42);

        assert.isFalse(
            await people.upsert(999, { name: 'Ghost', visits: 0 } as never),
        );
        assert.strictEqual((await people.get(999))?.name, 'Ghost');
    });

    test('bulkUpdate updates many and skips absent keys', async () => {
        const keys = await people.orderBy('age').primaryKeys();
        const updated = await people.bulkUpdate([
            { key: keys[0]!, changes: { visits: 100 } },
            { key: keys[1]!, changes: { visits: 200 } },
            { key: 4242, changes: { visits: 300 } },
        ]);

        assert.strictEqual(updated, 2, 'the missing key is skipped, not failed');
        assert.strictEqual((await people.get(keys[0]!))?.visits, 100);
    });

    test('bulkUpdate refuses to move the primary key', async () => {
        const keys = await people.orderBy('age').primaryKeys();
        let caught: unknown;
        await people
            .bulkUpdate([{ key: keys[0]!, changes: { id: 12345 } as never }])
            .catch((error) => {
                caught = error;
            });
        assert.strictEqual((caught as Error).name, 'ConstraintError');
    });
});

suite('Table: where with equality criteria', () => {
    test('a single criterion uses the index', async () => {
        const found = await people.where({ city: 'Oslo' }).toArray();
        assert.deepEqual(
            found.map((p) => p.name).sort(),
            ['Alice', 'Carol'],
        );
    });

    test('multiple criteria combine', async () => {
        const found = await people.where({ city: 'Bergen', age: 30 }).toArray();
        assert.deepEqual(
            found.map((p) => p.name),
            ['Bob'],
        );
    });

    test('an unindexed criterion still filters', async () => {
        const found = await people.where({ visits: 3 }).toArray();
        assert.deepEqual(
            found.map((p) => p.name),
            ['Carol'],
        );
    });
});

suite('cmp', () => {
    test('orders across types the way IndexedDB does', async () => {
        const { cmp } = await import('../../src/nexie/functions/cmp.ts');

        assert.isBelow(cmp(1, 2), 0);
        assert.strictEqual(cmp(2, 2), 0);
        assert.isAbove(cmp(3, 2), 0);

        // number < Date < string < binary < Array
        assert.isBelow(cmp(1, new Date(0)), 0);
        assert.isBelow(cmp(new Date(0), 'a'), 0);
        assert.isBelow(cmp('a', new Uint8Array([1])), 0);
        assert.isBelow(cmp(new Uint8Array([1]), [1]), 0);

        // A prefix sorts before the array it prefixes -- the property the
        // virtual-index range rule depends on.
        assert.isBelow(cmp(['x'], ['x', 1]), 0);
        assert.isAbove(cmp(['x', 1], ['x']), 0);
    });
});

suite('Collection: reuse', () => {
    test('a distinct() collection can be read more than once', async () => {
        const devs = people.where('tags').anyOf(['dev', 'ops']).distinct();
        const first = await devs.toArray();
        const second = await devs.toArray();
        assert.deepEqual(
            second.map((p) => p.name),
            first.map((p) => p.name),
        );
        assert.lengthOf(first, 4);
    });

    test('first() on a distinct() collection does not eat a record', async () => {
        const devs = people.where('tags').anyOf(['dev', 'ops']).distinct();
        assert.equal((await devs.first())!.name, 'Alice');
        assert.lengthOf(await devs.toArray(), 4);
        assert.equal(await devs.count(), 4);
    });
});

suite('Collection: modify deletion idioms', () => {
    test('`delete ref.value` deletes the record, like `ref.value = null`', async () => {
        const modified = await people
            .toCollection()
            .modify((person, ref) => {
                if (person.city === 'Oslo') delete ref.value;
            });
        assert.equal(modified, 5);
        assert.deepEqual(
            (await people.toArray()).map((p) => p.city).sort(),
            ['Bergen', 'Bergen', 'Tromso'],
        );
    });
});

suite('Table: where with non-primitive criteria', () => {
    test('an unindexed Date criterion matches by key, not identity', async () => {
        const when = new Date(2020, 0, 1);
        await people.where('name').equals('Alice').modify({ when });
        const found = await people
            .where({ name: 'Alice', when: new Date(2020, 0, 1) })
            .toArray();
        assert.lengthOf(found, 1);
        assert.lengthOf(
            await people.where({ name: 'Alice', when: new Date(2021, 0, 1) }).toArray(),
            0,
        );
    });

    test('an unindexed array criterion matches by key', async () => {
        assert.lengthOf(
            await people.where({ city: 'Tromso', tags: ['dev', 'ops'] }).toArray(),
            1,
        );
    });
});
