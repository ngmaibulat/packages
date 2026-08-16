import { describe as suite, it as test, beforeEach, afterEach } from 'node:test';
import { assert } from 'chai';

import { dispose, freshName, Nexie } from './utils.ts';
import type { DBCore, Middleware } from '../../src/nexie/types/dbcore.ts';

let db: Nexie;

beforeEach(() => {
    db = new Nexie(freshName('mw'));
    db.version(1).stores({ items: '++id, name' });
});

afterEach(async () => {
    await dispose(db);
});

/** A middleware that records every mutation type it sees. */
function recorder(log: string[], label = 'mw'): Middleware<DBCore> {
    return {
        stack: 'dbcore',
        name: label,
        create(down) {
            return {
                table(name) {
                    const table = down.table(name);
                    return {
                        ...table,
                        mutate(request) {
                            log.push(`${label}:${request.type}`);
                            return table.mutate(request);
                        },
                    };
                },
            };
        },
    };
}

suite('db.use', () => {
    test('intercepts every mutation type', async () => {
        const log: string[] = [];
        db.use(recorder(log));

        const id = await db.table('items').add({ name: 'a' });
        await db.table('items').put({ id, name: 'b' });
        await db.table('items').delete(id);
        await db.table('items').clear();

        assert.deepEqual(log, [
            'mw:add',
            'mw:put',
            'mw:delete',
            'mw:deleteRange',
        ]);
    });

    test('can rewrite values on the way down', async () => {
        db.use({
            stack: 'dbcore',
            name: 'stamper',
            create(down) {
                return {
                    table(name) {
                        const table = down.table(name);
                        return {
                            ...table,
                            mutate(request) {
                                if (request.type === 'add' && request.values) {
                                    return table.mutate({
                                        ...request,
                                        values: request.values.map((v: any) => ({
                                            ...v,
                                            stamped: true,
                                        })),
                                    });
                                }
                                return table.mutate(request);
                            },
                        };
                    },
                };
            },
        });

        const id = await db.table('items').add({ name: 'a' });
        assert.isTrue((await db.table('items').get(id)).stamped);
    });

    test('sees bulk operations as a single request', async () => {
        const log: string[] = [];
        db.use(recorder(log));

        await db.table('items').bulkAdd([{ name: 'a' }, { name: 'b' }]);
        assert.deepEqual(log, ['mw:add'], 'one request, not one per record');
    });

    test('sees Collection.modify as a put', async () => {
        await db.table('items').bulkAdd([{ name: 'a' }, { name: 'b' }]);

        const log: string[] = [];
        db.use(recorder(log));
        await db.table('items').toCollection().modify({ name: 'z' });

        assert.deepEqual(log, ['mw:put']);
    });

    test('level orders the stack, lowest closest to IndexedDB', async () => {
        const log: string[] = [];
        db.use({ ...recorder(log, 'low'), level: 1 });
        db.use({ ...recorder(log, 'high'), level: 100 });

        await db.table('items').add({ name: 'a' });

        // The highest level is outermost, so it records first.
        assert.deepEqual(log, ['high:add', 'low:add']);
    });

    test('a partial middleware falls through for what it does not override', async () => {
        // Overrides only `table`, and within it only `mutate` -- reads must
        // still work untouched.
        const log: string[] = [];
        db.use(recorder(log));

        const id = await db.table('items').add({ name: 'a' });
        assert.strictEqual((await db.table('items').get(id)).name, 'a');
        assert.strictEqual(await db.table('items').count(), 1);
    });
});

suite('db.unuse', () => {
    test('removes a middleware by name', async () => {
        const log: string[] = [];
        db.use(recorder(log, 'named'));

        await db.table('items').add({ name: 'a' });
        assert.lengthOf(log, 1);

        db.unuse({ stack: 'dbcore', name: 'named' });
        await db.table('items').add({ name: 'b' });
        assert.lengthOf(log, 1, 'no longer in the stack');
    });

    test('removes a middleware by its create function', async () => {
        const log: string[] = [];
        const middleware = recorder(log, 'byfn');
        db.use(middleware);

        await db.table('items').add({ name: 'a' });
        db.unuse({ stack: 'dbcore', create: middleware.create });
        await db.table('items').add({ name: 'b' });

        assert.lengthOf(log, 1);
    });
});

suite('per-instance class constructors', () => {
    test('each database gets its own subclasses', () => {
        const other = new Nexie(freshName('other'));
        assert.notStrictEqual(db.Table, other.Table);
        assert.notStrictEqual(db.Collection, other.Collection);
        assert.notStrictEqual(db.WhereClause, other.WhereClause);
        assert.notStrictEqual(db.Transaction, other.Transaction);
    });

    test('patching one database does not affect another', async () => {
        const other = new Nexie(freshName('other2'));
        other.version(1).stores({ items: '++id, name' });

        (db.Table.prototype as any).shout = function () {
            return `${this.name}!`;
        };

        assert.strictEqual((db.table('items') as any).shout(), 'items!');
        assert.isUndefined((other.table('items') as any).shout);

        await dispose(other);
    });
});

suite('Nexie.addons', () => {
    test('an addon runs against a new database', () => {
        const seen: string[] = [];
        const addon = (database: Nexie) => {
            seen.push(database.name);
        };

        const name = freshName('addon');
        const withAddon = new Nexie(name, { addons: [addon] });
        assert.deepEqual(seen, [name]);
        void withAddon;
    });

    test('a globally registered addon applies to every database', () => {
        let count = 0;
        const addon = () => {
            count++;
        };

        Nexie.addons.push(addon);
        try {
            void new Nexie(freshName('global-addon-1'));
            void new Nexie(freshName('global-addon-2'));
            assert.strictEqual(count, 2);
        } finally {
            Nexie.addons.splice(Nexie.addons.indexOf(addon), 1);
        }
    });

    test('an addon can register a middleware', async () => {
        const log: string[] = [];
        const addon = (database: Nexie) => {
            database.use(recorder(log, 'from-addon'));
        };

        const withAddon = new Nexie(freshName('addon-mw'), { addons: [addon] });
        withAddon.version(1).stores({ items: '++id' });
        await withAddon.table('items').add({});

        assert.deepEqual(log, ['from-addon:add']);
        await dispose(withAddon);
    });
});
