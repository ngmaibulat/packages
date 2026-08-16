import { describe as suite, it as test, beforeEach, afterEach } from 'node:test';
import { assert } from 'chai';

import { dispose, freshName, Nexie } from './utils.ts';
import { globalEvents } from '../../src/nexie/globals/global-events.ts';
import { newZone } from '../../src/nexie/zone/zone.ts';
import type { ObservabilitySet } from '../../src/nexie/live-query/obs-set.ts';

let db: Nexie;

beforeEach(() => {
    db = new Nexie(freshName('obs'));
    db.version(1).stores({ friends: '++id, name, age, *tags, [name+age]' });
});

afterEach(async () => {
    await dispose(db);
});

/** Collect every `storagemutated` payload fired while `fn` runs. */
async function captureMutations(
    fn: () => Promise<unknown>,
): Promise<ObservabilitySet[]> {
    const seen: ObservabilitySet[] = [];
    const listener = (parts: ObservabilitySet) => seen.push(parts);
    globalEvents.storagemutated.subscribe(listener);
    try {
        await fn();
        // The publish rides on the transaction's completion, which settles
        // after the operation's own promise.
        await new Promise((resolve) => setTimeout(resolve, 10));
    } finally {
        globalEvents.storagemutated.unsubscribe(listener);
    }
    return seen;
}

/** Record what `fn` reads, the way a liveQuery querier's zone does. */
function captureReads(fn: () => Promise<unknown>): Promise<ObservabilitySet> {
    const subscr: ObservabilitySet = {};
    return Promise.resolve(newZone(() => fn(), { subscr })).then(() => subscr);
}

function keyFor(table: string, index: string): string {
    return `idb://${db.name}/${table}/${index}`;
}

suite('observability: writes', () => {
    test('publishes the primary key of an auto-incremented insert', async () => {
        const seen = await captureMutations(() =>
            db.table('friends').add({ name: 'Alice', age: 30 }),
        );

        assert.lengthOf(seen, 1);
        const primary = seen[0]![keyFor('friends', ':id')];
        assert.isDefined(primary, 'the primary key part must be published');
        // The store generated the key, so nothing in the request carried it --
        // it can only have come from the mutation response.
        assert.isTrue(primary!.hasKey(1));
        assert.isFalse(primary!.hasKey(2));
    });

    test('publishes exact secondary index keys for add', async () => {
        const seen = await captureMutations(() =>
            db.table('friends').add({ name: 'Alice', age: 30 }),
        );

        const byName = seen[0]![keyFor('friends', 'name')]!;
        assert.isTrue(byName.hasKey('Alice'));
        assert.isFalse(byName.hasKey('Bob'));

        // A compound index stores the array, and that is what a query on it
        // compares against.
        const compound = seen[0]![keyFor('friends', '[name+age]')]!;
        assert.isTrue(compound.hasKey(['Alice', 30] as never));

        // A multiEntry index stores one entry per element.
        const tagged = await captureMutations(() =>
            db.table('friends').add({ name: 'Bob', age: 40, tags: ['x', 'y'] }),
        );
        const byTag = tagged[0]![keyFor('friends', 'tags')]!;
        assert.isTrue(byTag.hasKey('x'));
        assert.isTrue(byTag.hasKey('y'));
        assert.isFalse(byTag.hasKey('z'));
    });

    test('publishes nothing when the transaction aborts', async () => {
        await db.table('friends').add({ name: 'Alice', age: 30 });

        const seen = await captureMutations(async () => {
            await db
                .transaction('rw', db.table('friends'), async () => {
                    await db.table('friends').add({ name: 'Bob', age: 40 });
                    throw new Error('rolling back');
                })
                .catch(() => undefined);
        });

        assert.lengthOf(seen, 0);
        assert.equal(await db.table('friends').count(), 1);
    });

    test('publishes once per transaction, not once per write', async () => {
        const seen = await captureMutations(() =>
            db.transaction('rw', db.table('friends'), async () => {
                await db.table('friends').add({ name: 'Alice', age: 30 });
                await db.table('friends').add({ name: 'Bob', age: 40 });
            }),
        );

        assert.lengthOf(seen, 1);
        const primary = seen[0]![keyFor('friends', ':id')]!;
        assert.isTrue(primary.hasKey(1));
        assert.isTrue(primary.hasKey(2));
    });

    test('a range delete publishes the range it cleared', async () => {
        await db.table('friends').bulkAdd([
            { name: 'a', age: 1 },
            { name: 'b', age: 2 },
            { name: 'c', age: 3 },
        ]);

        const seen = await captureMutations(() =>
            db.table('friends').where(':id').belowOrEqual(2).delete(),
        );

        const primary = seen[0]![keyFor('friends', ':id')]!;
        assert.isTrue(primary.hasKey(1));
        assert.isTrue(primary.hasKey(2));
    });
});

suite('observability: reads', () => {
    beforeEach(async () => {
        await db.table('friends').bulkAdd([
            { name: 'Alice', age: 30 },
            { name: 'Bob', age: 40 },
        ]);
    });

    test('get records the single key it asked for', async () => {
        const read = await captureReads(() => db.table('friends').get(1));

        const primary = read[keyFor('friends', ':id')]!;
        assert.isTrue(primary.hasKey(1));
        assert.isFalse(primary.hasKey(2));
    });

    test('toArray records the whole primary key range', async () => {
        const read = await captureReads(() => db.table('friends').toArray());

        const primary = read[keyFor('friends', ':id')]!;
        assert.isTrue(primary.hasKey(1));
        assert.isTrue(primary.hasKey(99));
    });

    test('an indexed query records that index, not the primary key', async () => {
        const read = await captureReads(() =>
            db.table('friends').where('age').between(20, 35).toArray(),
        );

        const byAge = read[keyFor('friends', 'age')]!;
        assert.isDefined(byAge);
        assert.isTrue(byAge.hasKey(30));
        assert.isFalse(byAge.hasKey(40));
        assert.isUndefined(read[keyFor('friends', ':id')]);
    });

    test('a cursor walk is observed, not only the getAll fast path', async () => {
        // A filter forces the walk: this is the read path that used to talk to
        // IndexedDB directly, where nothing could observe it.
        const read = await captureReads(() =>
            db
                .table('friends')
                .where('age')
                .between(20, 35)
                .filter((friend: { name: string }) => friend.name === 'Alice')
                .toArray(),
        );

        const byAge = read[keyFor('friends', 'age')]!;
        assert.isDefined(byAge, 'the cursor walk must record its range');
        assert.isTrue(byAge.hasKey(30));
    });

    test('a virtual index query records the compound index backing it', async () => {
        // Only the compound index exists, so a query on `first` alone is served
        // virtually -- and must be recorded against the index that answered it,
        // in the physical (array) keys a mutation will be compared against.
        const virtualDb = new Nexie(freshName('virt'));
        virtualDb.version(1).stores({ people: '++id, [first+last]' });
        try {
            await virtualDb
                .table('people')
                .add({ first: 'Alice', last: 'Smith' });

            const read = await captureReads(() =>
                virtualDb.table('people').where('first').equals('Alice').toArray(),
            );

            const compound =
                read[`idb://${virtualDb.name}/people/[first+last]`];
            assert.isDefined(
                compound,
                'the compound index that answered the query is the one observed',
            );
            assert.isTrue(compound!.hasKey(['Alice', 'Smith'] as never));
            assert.isFalse(compound!.hasKey(['Bob', 'Smith'] as never));
        } finally {
            await dispose(virtualDb);
        }
    });

    test('records nothing outside an observing zone', async () => {
        // No zone, no subscr: the middleware must not invent one, and it must
        // not leak a read into a set whose zone has already returned.
        const subscr = await captureReads(() => db.table('friends').get(1));
        assert.isNotEmpty(Object.keys(subscr));

        await db.table('friends').get(2);
        const primary = subscr[keyFor('friends', ':id')]!;
        assert.isFalse(
            primary.hasKey(2),
            'a read made after the zone returned must not be recorded in it',
        );
    });
});
