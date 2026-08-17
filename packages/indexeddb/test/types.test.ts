import { describe as suite, it as test } from 'node:test';
import { assert } from 'chai';
import { assert as typeAssert, type IsExact } from 'conditional-type-checks';

import type {
  DBSchema,
  DBSchemaValue,
  DeleteDBBlockedCallback,
  DeleteDBCallbacks,
  IDBPDatabase,
  IDBPIndexGetAllOptions,
  IDBPStoreGetAllOptions,
  IDBPTransaction,
  IDBTransactionOptions,
  IndexKey,
  IndexKeys,
  IndexNames,
  OpenDBBlockedCallback,
  OpenDBBlockingCallback,
  OpenDBTerminatedCallback,
  OpenDBUpgradeCallback,
  StoreKey,
  StoreNames,
  StoreValue,
} from '../src/index.ts';

/**
 * Compile-time checks over the exported type surface -- the types the 0.1.1
 * "Types" section added so a schema or a migration can be assembled across
 * files. Nothing here runs against a database; the point is that each name
 * exists, is exported, and composes the way its documentation says. A `tsc`
 * failure here is the test failing.
 */

interface TestDB extends DBSchema {
  books: {
    key: number;
    value: { id: number; title: string; author: string };
    indexes: { by_author: string; by_title: string };
  };
  settings: {
    key: string;
    value: string;
  };
}

// The store shapes are ordinary DBSchemaValues, so a schema can be built up
// from named parts.
const booksStore: DBSchemaValue = {} as TestDB['books'];
typeAssert<IsExact<typeof booksStore, DBSchemaValue>>(true);

// The store-level helpers resolve against the schema.
typeAssert<IsExact<StoreNames<TestDB>, 'books' | 'settings'>>(true);
typeAssert<IsExact<StoreKey<TestDB, 'books'>, number>>(true);
typeAssert<IsExact<StoreValue<TestDB, 'settings'>, string>>(true);
typeAssert<IsExact<IndexNames<TestDB, 'books'>, 'by_author' | 'by_title'>>(
  true,
);
typeAssert<IsExact<IndexKey<TestDB, 'books', 'by_author'>, string>>(true);
// `IndexKeys` is the map itself, the shape a store's `indexes` member takes.
const bookIndexes: IndexKeys = {} as TestDB['books']['indexes'];
typeAssert<IsExact<typeof bookIndexes, IndexKeys>>(true);
// A store without indexes has no index names.
typeAssert<IsExact<IndexNames<TestDB, 'settings'>, never>>(true);

// The migration lives in another file, typed against the schema, and gets the
// upgrade transaction typed too.
const migrate: OpenDBUpgradeCallback<TestDB> = (db, oldVersion, newVersion, tx) => {
  typeAssert<IsExact<typeof db, IDBPDatabase<TestDB>>>(true);
  typeAssert<IsExact<typeof oldVersion, number>>(true);
  typeAssert<IsExact<typeof newVersion, number | null>>(true);
  typeAssert<
    IsExact<
      typeof tx,
      IDBPTransaction<TestDB, StoreNames<TestDB>[], 'versionchange'>
    >
  >(true);
  if (oldVersion < 1) {
    const store = db.createObjectStore('books', { keyPath: 'id' });
    store.createIndex('by_author', 'author');
  }
};

const onBlocked: OpenDBBlockedCallback = (currentVersion, blockedVersion, event) => {
  typeAssert<IsExact<typeof currentVersion, number>>(true);
  typeAssert<IsExact<typeof blockedVersion, number | null>>(true);
  typeAssert<IsExact<typeof event, IDBVersionChangeEvent>>(true);
};
const onBlocking: OpenDBBlockingCallback = (currentVersion, blockedVersion, event) => {
  typeAssert<IsExact<typeof currentVersion, number>>(true);
  typeAssert<IsExact<typeof blockedVersion, number | null>>(true);
  typeAssert<IsExact<typeof event, IDBVersionChangeEvent>>(true);
};
const onTerminated: OpenDBTerminatedCallback = () => {};
const onDeleteBlocked: DeleteDBBlockedCallback = (currentVersion, event) => {
  typeAssert<IsExact<typeof currentVersion, number>>(true);
  typeAssert<IsExact<typeof event, IDBVersionChangeEvent>>(true);
};
const deleteCallbacks: DeleteDBCallbacks = { blocked: onDeleteBlocked };

// The transaction options bag is the platform's.
const options: IDBTransactionOptions = { durability: 'relaxed' };
typeAssert<IsExact<IDBTransactionOptions['durability'], IDBTransactionDurability | undefined>>(
  true,
);

// getAll options: a store is only iterated in key order.
const storeOptions: IDBPStoreGetAllOptions<TestDB, 'books'> = {
  count: 2,
  direction: 'prev',
};
const indexOptions: IDBPIndexGetAllOptions<TestDB, 'books', 'by_author'> = {
  query: 'Austen',
  direction: 'nextunique',
};

suite('exported types', () => {
  test('the type-only surface compiles and composes', () => {
    // If this file type-checks, the surface is as documented. The runtime
    // assertion is only here so the file registers as a test.
    assert.isFunction(migrate);
    assert.isFunction(onBlocked);
    assert.isFunction(onBlocking);
    assert.isFunction(onTerminated);
    assert.isObject(deleteCallbacks);
    assert.deepEqual(options, { durability: 'relaxed' });
    assert.equal(storeOptions.direction, 'prev');
    assert.equal(indexOptions.direction, 'nextunique');
  });
});
