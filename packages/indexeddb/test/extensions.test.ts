import '@aibulat/indexeddb-impl/auto';
import { describe as suite, it as test, afterEach } from 'node:test';
import { assert } from 'chai';
import { assert as typeAssert, type IsExact } from 'conditional-type-checks';
import {
  openDB,
  ignoreConstraints,
  unwrap,
  type DBSchema,
  type IDBPDatabase,
  type IDBPStoreRecord,
  type IDBPIndexRecord,
} from '../src/index.ts';

// mocha's teardown takes a description; node:test's afterEach does not.
const teardown = (_name: string, fn: () => unknown) => afterEach(fn);

interface BooksDB extends DBSchema {
  books: {
    key: number;
    value: { id: number; title: string; author: string };
    indexes: { author: string };
  };
}

const books = [
  { id: 1, title: 'Book A', author: 'Adams' },
  { id: 2, title: 'Book B', author: 'Bronte' },
  { id: 3, title: 'Book C', author: 'Clarke' },
];

let dbCount = 0;

async function freshDB(): Promise<IDBPDatabase<BooksDB>> {
  dbCount += 1;
  const db = await openDB<BooksDB>(`extensions-test-${dbCount}`, 1, {
    upgrade(db) {
      const store = db.createObjectStore('books', { keyPath: 'id' });
      store.createIndex('author', 'author');
    },
  });

  const tx = db.transaction('books', 'readwrite');
  for (const book of books) tx.store.put(book);
  await tx.done;

  return db;
}

suite('getAll options - direction', () => {
  let db: IDBPDatabase<BooksDB>;

  teardown('Close DB', () => {
    if (db) db.close();
  });

  // Upstream https://github.com/jakearchibald/idb/issues/349. idb is a
  // transparent proxy, so the options object already reached IDB at runtime --
  // only the signatures were missing.
  test('store getAll and getAllKeys accept a direction', async () => {
    db = await freshDB();
    const store = () => db.transaction('books').store;

    assert.deepStrictEqual(
      (await store().getAll()).map((b) => b.id),
      [1, 2, 3],
      'default order',
    );
    assert.deepStrictEqual(
      (await store().getAll({ direction: 'prev' })).map((b) => b.id),
      [3, 2, 1],
      'reversed',
    );
    assert.deepStrictEqual(
      await store().getAllKeys({ direction: 'prev' }),
      [3, 2, 1],
    );
    assert.deepStrictEqual(
      (await store().getAll({ direction: 'prev', count: 2 })).map((b) => b.id),
      [3, 2],
      'count still applies',
    );
  });

  test('index getAll and getAllKeys accept a direction', async () => {
    db = await freshDB();
    const index = () => db.transaction('books').store.index('author');

    assert.deepStrictEqual(
      (await index().getAll({ direction: 'prev' })).map((b) => b.author),
      ['Clarke', 'Bronte', 'Adams'],
    );
    assert.deepStrictEqual(
      await index().getAllKeys({ direction: 'prev' }),
      [3, 2, 1],
    );
  });

  test('database shortcuts accept a direction', async () => {
    db = await freshDB();

    assert.deepStrictEqual(
      (await db.getAll('books', { direction: 'prev' })).map((b) => b.id),
      [3, 2, 1],
    );
    assert.deepStrictEqual(
      await db.getAllKeys('books', { direction: 'prev' }),
      [3, 2, 1],
    );
    assert.deepStrictEqual(
      (await db.getAllFromIndex('books', 'author', { direction: 'prev' })).map(
        (b) => b.author,
      ),
      ['Clarke', 'Bronte', 'Adams'],
    );
    assert.deepStrictEqual(
      await db.getAllKeysFromIndex('books', 'author', { direction: 'prev' }),
      [3, 2, 1],
    );
  });

  test('the query/count form still works', async () => {
    db = await freshDB();
    const store = () => db.transaction('books').store;

    assert.deepStrictEqual(
      (await store().getAll(IDBKeyRange.bound(2, 3))).map((b) => b.id),
      [2, 3],
    );
    assert.deepStrictEqual(
      (await store().getAll(null, 2)).map((b) => b.id),
      [1, 2],
    );
    assert.deepStrictEqual(await db.getAllKeys('books', null, 2), [1, 2]);
  });
});

suite('getAllRecords', () => {
  let db: IDBPDatabase<BooksDB>;

  teardown('Close DB', () => {
    if (db) db.close();
  });

  test('store getAllRecords returns key, primaryKey and value', async (t) => {
    if (!('getAllRecords' in IDBObjectStore.prototype)) {
      t.skip('getAllRecords is unsupported here');
      return;
    }
    db = await freshDB();

    const records = await db.transaction('books').store.getAllRecords();

    assert.lengthOf(records, 3);
    assert.deepStrictEqual(
      records.map((r) => r.key),
      [1, 2, 3],
    );
    assert.deepStrictEqual(
      records.map((r) => r.primaryKey),
      [1, 2, 3],
    );
    assert.deepStrictEqual(
      records.map((r) => r.value.title),
      ['Book A', 'Book B', 'Book C'],
    );

    typeAssert<IsExact<typeof records, IDBPStoreRecord<BooksDB, 'books'>[]>>(
      true,
    );
  });

  test('index getAllRecords keys by the index', async (t) => {
    if (!('getAllRecords' in IDBIndex.prototype)) {
      t.skip('getAllRecords is unsupported here');
      return;
    }
    db = await freshDB();

    const records = await db
      .transaction('books')
      .store.index('author')
      .getAllRecords({ direction: 'prev' });

    assert.deepStrictEqual(
      records.map((r) => r.key),
      ['Clarke', 'Bronte', 'Adams'],
      'index key',
    );
    assert.deepStrictEqual(
      records.map((r) => r.primaryKey),
      [3, 2, 1],
      'store key',
    );

    typeAssert<
      IsExact<typeof records, IDBPIndexRecord<BooksDB, 'books', 'author'>[]>
    >(true);
  });

  test('database shortcuts', async (t) => {
    if (!('getAllRecords' in IDBObjectStore.prototype)) {
      t.skip('getAllRecords is unsupported here');
      return;
    }
    db = await freshDB();

    assert.deepStrictEqual(
      (await db.getAllRecords('books')).map((r) => r.key),
      [1, 2, 3],
    );
    assert.deepStrictEqual(
      (await db.getAllRecordsFromIndex('books', 'author')).map((r) => r.key),
      ['Adams', 'Bronte', 'Clarke'],
    );
  });
});

suite('iterateKeys', () => {
  let db: IDBPDatabase<BooksDB>;

  teardown('Close DB', () => {
    if (db) db.close();
  });

  // Upstream https://github.com/jakearchibald/idb/issues/112.
  test('iterates a store without reading values', async () => {
    db = await freshDB();

    const keys: number[] = [];
    for await (const cursor of db.transaction('books').store.iterateKeys()) {
      keys.push(cursor.key);
      assert.notProperty(cursor, 'value', 'a key cursor has no value');
    }

    assert.deepStrictEqual(keys, [1, 2, 3]);
  });

  test('iterates an index, yielding index keys and primary keys', async () => {
    db = await freshDB();

    const seen: [string, number][] = [];
    for await (const cursor of db
      .transaction('books')
      .store.index('author')
      .iterateKeys()) {
      seen.push([cursor.key, cursor.primaryKey]);
    }

    assert.deepStrictEqual(seen, [
      ['Adams', 1],
      ['Bronte', 2],
      ['Clarke', 3],
    ]);
  });

  test('honours a query and direction', async () => {
    db = await freshDB();

    const keys: number[] = [];
    for await (const cursor of db
      .transaction('books')
      .store.iterateKeys(IDBKeyRange.bound(2, 3), 'prev')) {
      keys.push(cursor.key);
    }

    assert.deepStrictEqual(keys, [3, 2]);
  });

  test('honours a manual advance', async () => {
    db = await freshDB();

    const keys: number[] = [];
    for await (const cursor of db.transaction('books').store.iterateKeys()) {
      keys.push(cursor.key);
      cursor.advance(2);
    }

    assert.deepStrictEqual(keys, [1, 3]);
  });

  test('iterate still yields values', async () => {
    db = await freshDB();

    const titles: string[] = [];
    for await (const cursor of db.transaction('books').store.iterate()) {
      titles.push(cursor.value.title);
    }

    assert.deepStrictEqual(titles, ['Book A', 'Book B', 'Book C']);
  });
});

suite('ignoreConstraints', () => {
  let db: IDBPDatabase<BooksDB>;

  teardown('Close DB', () => {
    if (db) db.close();
  });

  // Upstream https://github.com/jakearchibald/idb/issues/256. Depends on
  // tx.done no longer rejecting on a preventDefault()ed error.
  test('skips duplicates and lets the rest of the batch commit', async () => {
    db = await freshDB();

    const tx = db.transaction('books', 'readwrite');
    const results = await Promise.all([
      // id 1 already exists.
      ignoreConstraints(tx.store.add({ id: 1, title: 'Dupe', author: 'Dupe' })),
      ignoreConstraints(
        tx.store.add({ id: 4, title: 'Book D', author: 'Dickens' }),
      ),
    ]);
    await tx.done;

    assert.deepStrictEqual(results, [undefined, 4]);
    assert.strictEqual(
      (await db.get('books', 1))!.title,
      'Book A',
      'existing record untouched',
    );
    assert.strictEqual(
      (await db.get('books', 4))!.title,
      'Book D',
      'the rest of the batch committed',
    );
  });

  test('still rejects for errors that are not ConstraintError', async () => {
    db = await freshDB();

    const tx = db.transaction('books', 'readwrite');
    try {
      // The keyPath is 'id', so a value without one is a DataError.
      await ignoreConstraints(tx.store.add({} as any));
      assert.fail('should have rejected');
    } catch (error) {
      assert.notStrictEqual((error as DOMException).name, 'ConstraintError');
    }
  });

  test('rejects a promise that is not an IDB operation', () => {
    assert.throws(
      () => ignoreConstraints(Promise.resolve(1)),
      TypeError,
      /IndexedDB operation/,
    );
  });

  test('refuses to be called after the operation has already failed', async () => {
    db = await freshDB();

    const tx = db.transaction('books', 'readwrite');
    const operation = tx.store.add({ id: 1, title: 'Dupe', author: 'Dupe' });
    // Too late: by the time this rejects, the ConstraintError has reached the
    // transaction and aborted it. Swallowing it now would report success for
    // a write that took the transaction down.
    await operation.catch(() => {});
    assert.throws(() => ignoreConstraints(operation), TypeError, /same turn/);
    await tx.done.catch(() => {});
  });

  test('leaves no listener behind once the request has settled', async () => {
    db = await freshDB();

    const tx = db.transaction('books', 'readwrite');
    const operation = tx.store.add({ id: 4, title: 'Book D', author: 'D' });
    const request = unwrap(operation);
    // The impl keeps its listeners in a list, so count them. Before settling
    // there are the wrapper's own two plus the two ignoreConstraints adds;
    // both pairs are removed on settle, so nothing at all should remain.
    const listeners = (request as unknown as { _listeners: unknown[] })._listeners;
    assert.isAbove(listeners.length, 0, 'listeners attached before settle');
    await ignoreConstraints(operation);
    await tx.done;
    assert.strictEqual(listeners.length, 0, 'listeners removed on settle');
  });

  test('is scoped to the one operation, not the whole transaction', async () => {
    db = await freshDB();

    const tx = db.transaction('books', 'readwrite');
    const ignored = ignoreConstraints(
      tx.store.add({ id: 1, title: 'Dupe', author: 'Dupe' }),
    );
    // A second duplicate on the same store, NOT wrapped: this one still
    // aborts the transaction.
    const notIgnored = tx.store.add({ id: 2, title: 'Dupe', author: 'Dupe' });
    assert.strictEqual(await ignored, undefined);
    let caught: unknown;
    await notIgnored.catch((error) => {
      caught = error;
    });
    assert.strictEqual((caught as DOMException).name, 'ConstraintError');
    await tx.done.catch(() => {});
  });
});

suite('Symbol.dispose', () => {
  // Upstream https://github.com/jakearchibald/idb/issues/300.
  test('closes the connection at the end of the scope', async () => {
    dbCount += 1;
    const name = `dispose-test-${dbCount}`;
    let closed = false;

    {
      using db = await openDB<BooksDB>(name, 1, {
        upgrade(db) {
          db.createObjectStore('books', { keyPath: 'id' });
        },
      });
      db.addEventListener('close', () => (closed = true));
      await db.put('books', { id: 1, title: 'T', author: 'A' });
      assert.isFunction(db[Symbol.dispose]);
    }

    // The connection is gone, so a new open is not blocked by it.
    const reopened = await openDB<BooksDB>(name, 1);
    assert.strictEqual((await reopened.get('books', 1))!.title, 'T');
    reopened.close();

    assert.isFalse(closed, 'close() does not fire the close event');
  });

  test('the accessor is stable, like every other wrapped member', async () => {
    dbCount += 1;
    const db = await openDB(`dispose-stable-${dbCount}`, 1);
    assert.strictEqual(db[Symbol.dispose], db[Symbol.dispose]);
    assert.isTrue(Symbol.dispose in db);
    db.close();
  });
});
