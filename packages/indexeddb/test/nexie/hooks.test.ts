import { describe as suite, it as test, beforeEach, afterEach } from 'node:test';
import { assert } from 'chai';

import { dispose, freshName, Nexie } from './utils.ts';
import type { Table } from '../../src/nexie/classes/table.ts';

interface Doc {
    id?: number;
    title: string;
    revision?: number;
    createdAt?: string;
}

let db: Nexie;
let docs: Table<Doc, number>;

beforeEach(() => {
    db = new Nexie(freshName('hooks'));
    db.version(1).stores({ docs: '++id, title' });
    docs = db.table<Doc, number>('docs');
});

afterEach(async () => {
    await dispose(db);
});

suite('hook: creating', () => {
    test('fires on add, with the record and the transaction', async () => {
        const seen: { key: unknown; title: string; hasTrans: boolean }[] = [];

        docs.hook('creating', function (primKey, obj, trans) {
            seen.push({
                key: primKey,
                title: (obj as Doc).title,
                hasTrans: Boolean(trans),
            });
        });

        await docs.add({ title: 'first' });

        assert.lengthOf(seen, 1);
        assert.strictEqual(seen[0]!.title, 'first');
        assert.isTrue(seen[0]!.hasTrans, 'the transaction is passed through');
    });

    test('can populate fields before the write lands', async () => {
        docs.hook('creating', (_primKey, obj) => {
            (obj as Doc).createdAt = '2026-01-01';
        });

        const id = await docs.add({ title: 'stamped' });
        assert.strictEqual((await docs.get(id))?.createdAt, '2026-01-01');
    });

    test('a returned value becomes the primary key', async () => {
        const outbound = new Nexie(freshName('outbound-hook'));
        outbound.version(1).stores({ items: '' });
        const items = outbound.table<{ v: number }, string>('items');

        items.hook('creating', () => 'chosen-key');
        await items.add({ v: 1 }, 'ignored' as never);

        assert.deepEqual(await items.get('chosen-key'), { v: 1 });
        await dispose(outbound);
    });

    test('onsuccess receives the generated key', async () => {
        let delivered: unknown;
        docs.hook('creating', function () {
            this.onsuccess = (primKey) => {
                delivered = primKey;
            };
        });

        const id = await docs.add({ title: 'x' });
        assert.strictEqual(delivered, id);
    });

    test('fires for every record of a bulkAdd', async () => {
        const titles: string[] = [];
        docs.hook('creating', (_key, obj) => {
            titles.push((obj as Doc).title);
        });

        await docs.bulkAdd([{ title: 'a' }, { title: 'b' }, { title: 'c' }]);
        assert.deepEqual(titles, ['a', 'b', 'c']);
    });

    test('does not fire when the record already exists', async () => {
        const id = await docs.add({ title: 'original' });

        let fired = 0;
        docs.hook('creating', () => {
            fired++;
        });

        await docs.put({ id, title: 'replaced' });
        assert.strictEqual(fired, 0, 'that is an update, not a create');
    });
});

suite('hook: updating', () => {
    test('fires on put over an existing record, with the modifications', async () => {
        const id = await docs.add({ title: 'before', revision: 1 });

        let modifications: Record<string, unknown> | undefined;
        let previous: Doc | undefined;
        docs.hook('updating', (mods, _primKey, obj) => {
            modifications = mods as Record<string, unknown>;
            previous = obj as Doc;
        });

        await docs.put({ id, title: 'after', revision: 1 });

        assert.strictEqual(previous?.title, 'before', 'the stored record');
        assert.deepEqual(
            modifications,
            { title: 'after' },
            'only the changed path',
        );
    });

    test('a returned object contributes further modifications', async () => {
        const id = await docs.add({ title: 'v1', revision: 1 });

        docs.hook('updating', () => ({ revision: 99 }));
        await docs.put({ id, title: 'v2', revision: 1 });

        const stored = await docs.get(id);
        assert.strictEqual(stored?.title, 'v2');
        assert.strictEqual(stored?.revision, 99, 'the hook won');
    });

    test('fires for Collection.modify', async () => {
        await docs.bulkAdd([{ title: 'a' }, { title: 'b' }]);

        const changes: unknown[] = [];
        docs.hook('updating', (mods) => {
            changes.push(mods);
        });

        await docs.toCollection().modify({ revision: 7 });
        assert.lengthOf(changes, 2);
        assert.deepEqual(changes[0], { revision: 7 });
    });
});

suite('hook: deleting', () => {
    test('fires with the record being removed', async () => {
        const id = await docs.add({ title: 'doomed' });

        const removed: string[] = [];
        docs.hook('deleting', (_primKey, obj) => {
            removed.push((obj as Doc).title);
        });

        await docs.delete(id);
        assert.deepEqual(removed, ['doomed']);
    });

    test('fires for each key of a bulkDelete', async () => {
        const keys = (await docs.bulkAdd(
            [{ title: 'a' }, { title: 'b' }],
            { allKeys: true },
        )) as number[];

        let fired = 0;
        docs.hook('deleting', () => {
            fired++;
        });

        await docs.bulkDelete(keys);
        assert.strictEqual(fired, 2);
    });

    test('fires for Collection.delete, which gives up its bulk path', async () => {
        await docs.bulkAdd([{ title: 'a' }, { title: 'b' }]);

        const removed: string[] = [];
        docs.hook('deleting', (_primKey, obj) => {
            removed.push((obj as Doc).title);
        });

        const count = await docs.toCollection().delete();
        assert.strictEqual(count, 2);
        assert.deepEqual(removed.sort(), ['a', 'b']);
    });

    test('does not fire for a key that does not exist', async () => {
        let fired = 0;
        docs.hook('deleting', () => {
            fired++;
        });
        await docs.delete(9999);
        assert.strictEqual(fired, 0);
    });
});

suite('hook: reading', () => {
    test('transforms values on the way out', async () => {
        await docs.add({ title: 'raw' });
        docs.hook('reading', (obj: Doc) => ({ ...obj, title: obj.title.toUpperCase() }));

        const all = await docs.toArray();
        assert.strictEqual(all[0]?.title, 'RAW');
    });

    test('applies to get, toArray and query results alike', async () => {
        const id = await docs.add({ title: 'x' });
        docs.hook('reading', (obj: Doc) => ({ ...obj, marked: true }));

        assert.isTrue(((await docs.get(id)) as any).marked, 'get');
        assert.isTrue(((await docs.toArray())[0] as any).marked, 'toArray');
        assert.isTrue(
            ((await docs.where('title').equals('x').first()) as any).marked,
            'query',
        );
    });

    test('raw() opts out', async () => {
        await docs.add({ title: 'x' });
        docs.hook('reading', (obj: Doc) => ({ ...obj, marked: true }));

        const raw = await docs.toCollection().raw().toArray();
        assert.isUndefined((raw[0] as any).marked);
    });

    test('subscribers compose as a transform chain', async () => {
        await docs.add({ title: 'a' });
        docs.hook('reading', (obj: Doc) => ({ ...obj, title: obj.title + 'b' }));
        docs.hook('reading', (obj: Doc) => ({ ...obj, title: obj.title + 'c' }));

        assert.strictEqual((await docs.toArray())[0]?.title, 'abc');
    });
});

suite('mapToClass and Entity', () => {
    test('records come back as instances', async () => {
        class Doc2 {
            declare id: number;
            declare title: string;
            shout(): string {
                return this.title.toUpperCase();
            }
        }

        docs.mapToClass(Doc2);
        await docs.add({ title: 'hello' });

        const found = (await docs.toArray())[0] as unknown as Doc2;
        assert.instanceOf(found, Doc2);
        assert.strictEqual(found.shout(), 'HELLO');
    });

    test('re-mapping replaces the previous class', async () => {
        class A {}
        class B {}
        docs.mapToClass(A);
        docs.mapToClass(B);

        await docs.add({ title: 'x' });
        const found = (await docs.toArray())[0];
        assert.instanceOf(found, B);
        assert.notInstanceOf(found, A);
    });
});

suite('unsubscribing', () => {
    test('a removed hook stops firing', async () => {
        let fired = 0;
        const subscriber = () => {
            fired++;
        };

        docs.hook('creating', subscriber);
        await docs.add({ title: 'a' });
        assert.strictEqual(fired, 1);

        docs.hook.creating.unsubscribe(subscriber);
        await docs.add({ title: 'b' });
        assert.strictEqual(fired, 1, 'no longer subscribed');
    });
});

suite('hooks survive schema re-declaration', () => {
    test('a hook registered before a later version() still fires', async () => {
        let fired = 0;
        docs.hook('creating', () => {
            fired++;
        });
        // Registering another version re-parses every schema object.
        db.version(2).stores({ docs: '++id, title, revision' });

        await db.table('docs').add({ title: 'a' });
        assert.equal(fired, 1);
    });

    test('mapToClass survives a later version()', async () => {
        class Doc {
            title!: string;
            shout(): string {
                return this.title.toUpperCase();
            }
        }
        docs.mapToClass(Doc);
        db.version(2).stores({ docs: '++id, title, revision' });

        await db.table('docs').add({ title: 'a' });
        const read = (await db.table('docs').toArray())[0] as Doc;
        assert.instanceOf(read, Doc);
        assert.equal(read.shout(), 'A');
    });

    test('until() sees mapped values, like filter()', async () => {
        class Doc {
            title!: string;
            isStop(): boolean {
                return this.title === 'b';
            }
        }
        docs.mapToClass(Doc);
        await docs.bulkAdd([{ title: 'a' }, { title: 'b' }, { title: 'c' }]);
        const before = await docs
            .toCollection()
            .until((doc) => (doc as unknown as Doc).isStop())
            .toArray();
        assert.deepEqual(
            before.map((d) => d.title),
            ['a'],
        );
    });
});
