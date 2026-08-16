# @aibulat/indexeddb

IndexedDB with usability. A tiny (~1.9 kB brotli'd, zero runtime dependencies) library that mostly mirrors the IndexedDB API, but with small improvements that make a big difference to usability.

> A fork of [`idb`](https://github.com/jakearchibald/idb) by Jake Archibald, forked at v8.0.3. It is an **API-compatible superset**: everything idb does works the same way, plus fixes and additions upstream has not shipped — see [Changes](#changes) for the list. Ships ESM only, and is maintained as part of the [`@aibulat`](https://github.com/ngmaibulat/packages) workspace. See [LICENSE](LICENSE) for the retained upstream notice.

1. [Installation](#installation)
1. [Changes](#changes)
1. [Browser support](#browser-support)
1. [API](#api)
   1. [`openDB`](#opendb)
   1. [`deleteDB`](#deletedb)
   1. [`unwrap`](#unwrap)
   1. [`wrap`](#wrap)
   1. [General enhancements](#general-enhancements)
   1. [`IDBDatabase` enhancements](#idbdatabase-enhancements)
   1. [`IDBTransaction` enhancements](#idbtransaction-enhancements)
   1. [`IDBCursor` enhancements](#idbcursor-enhancements)
   1. [Async iterators](#async-iterators)
   1. [`getAll` options](#getall-options)
   1. [`ignoreConstraints`](#ignoreconstraints)
   1. [Closing with `using`](#closing-with-using)
1. [Examples](#examples)
1. [TypeScript](#typescript)

# Installation

## Using a package manager

```sh
pnpm add @aibulat/indexeddb
```

Then, assuming you're using a module-compatible system (like Vite, webpack, Rollup etc):

```js
import { openDB, deleteDB, wrap, unwrap } from '@aibulat/indexeddb';

async function doDatabaseStuff() {
  const db = await openDB(…);
}
```

## Directly in a browser

This package is **ESM only** — there is no CommonJS build and no UMD global. Load it as a module:

```html
<script type="module">
  import {
    openDB,
    deleteDB,
    wrap,
    unwrap,
  } from 'https://cdn.jsdelivr.net/npm/@aibulat/indexeddb@0/+esm';

  async function doDatabaseStuff() {
    const db = await openDB(…);
  }
</script>
```

If you need a global for a non-module script, assign one yourself:

```html
<script type="module">
  import * as idb from 'https://cdn.jsdelivr.net/npm/@aibulat/indexeddb@0/+esm';
  globalThis.idb = idb;
</script>
```

# Changes

[See details of (potentially) breaking changes](CHANGELOG.md).

# Browser support

This library targets modern browsers, as in Chrome, Firefox, Safari, and other browsers that use those engines, such as Edge. IE is not supported.

# API

## `openDB`

This method opens a database, and returns a promise for an enhanced [`IDBDatabase`](https://w3c.github.io/IndexedDB/#database-interface).

```js
const db = await openDB(name, version, {
  upgrade(db, oldVersion, newVersion, transaction, event) {
    // …
  },
  blocked(currentVersion, blockedVersion, event) {
    // …
  },
  blocking(currentVersion, blockedVersion, event) {
    // …
  },
  terminated() {
    // …
  },
});
```

- `name`: Name of the database.
- `version` (optional): Schema version, or `undefined` to open the current version.
- `upgrade` (optional): Called if this version of the database has never been opened before. Use it to specify the schema for the database. This is similar to the [`upgradeneeded` event](https://developer.mozilla.org/en-US/docs/Web/API/IDBOpenDBRequest/upgradeneeded_event) in plain IndexedDB.
  - `db`: An enhanced `IDBDatabase`.
  - `oldVersion`: Last version of the database opened by the user.
  - `newVersion`: Whatever new version you provided.
  - `transaction`: An enhanced transaction for this upgrade. This is useful if you need to get data from other stores as part of a migration.
  - `event`: The event object for the associated `upgradeneeded` event.
- `blocked` (optional): Called if there are older versions of the database open on the origin, so this version cannot open. This is similar to the [`blocked` event](https://developer.mozilla.org/en-US/docs/Web/API/IDBOpenDBRequest/blocked_event) in plain IndexedDB.
  - `currentVersion`: Version of the database that's blocking this one.
  - `blockedVersion`: The version of the database being blocked (whatever version you provided to `openDB`).
  - `event`: The event object for the associated `blocked` event.
- `blocking` (optional): Called if this connection is blocking a future version of the database from opening. This is similar to the [`versionchange` event](https://developer.mozilla.org/en-US/docs/Web/API/IDBDatabase/versionchange_event) in plain IndexedDB.
  - `currentVersion`: Version of the open database (whatever version you provided to `openDB`).
  - `blockedVersion`: The version of the database that's being blocked.
  - `event`: The event object for the associated `versionchange` event.
- `terminated` (optional): Called if the browser abnormally terminates the connection, but not on regular closures like calling `db.close()`. This is similar to the [`close` event](https://developer.mozilla.org/en-US/docs/Web/API/IDBDatabase/close_event) in plain IndexedDB.

## `deleteDB`

Deletes a database.

```js
await deleteDB(name, {
  blocked() {
    // …
  },
});
```

- `name`: Name of the database.
- `blocked` (optional): Called if the database already exists and there are open connections that don’t close in response to a versionchange event, the request will be blocked until they all close.
  - `currentVersion`: Version of the database that's blocking the delete operation.
  - `event`: The event object for the associated 'versionchange' event.

## `unwrap`

Takes an enhanced IndexedDB object and returns the plain unmodified one.

```js
const unwrapped = unwrap(wrapped);
```

This is useful if, for some reason, you want to drop back into plain IndexedDB. Promises will also be converted back into `IDBRequest` objects.

## `wrap`

Takes an IDB object and returns a version enhanced by this library.

```js
const wrapped = wrap(unwrapped);
```

This is useful if some third party code gives you an `IDBDatabase` object and you want it to have the features of this library.

## General enhancements

Once you've opened the database the API is the same as IndexedDB, except for a few changes to make things easier.

Firstly, any method that usually returns an `IDBRequest` object will now return a promise for the result.

```js
const store = db.transaction(storeName).objectStore(storeName);
const value = await store.get(key);
```

### Promises & throwing

The library turns all `IDBRequest` objects into promises, but it doesn't know in advance which methods may return promises.

As a result, methods such as `store.put` may throw instead of returning a promise.

If you're using async functions, there's no observable difference.

Because you get a promise rather than the `IDBRequest`, assigning `onsuccess` or `onerror` to the result does nothing — there is no request there to assign them to. Await the promise instead, or use [`unwrap`](#unwrap) to get the real `IDBRequest` back.

### Transaction lifetime

TL;DR: **Do not `await` other things between the start and end of your transaction**, otherwise the transaction will close before you're done.

An IDB transaction auto-closes if it doesn't have anything left do once microtasks have been processed. As a result, this works fine:

```js
const tx = db.transaction('keyval', 'readwrite');
const store = tx.objectStore('keyval');
const val = (await store.get('counter')) || 0;
await store.put(val + 1, 'counter');
await tx.done;
```

But this doesn't:

```js
const tx = db.transaction('keyval', 'readwrite');
const store = tx.objectStore('keyval');
const val = (await store.get('counter')) || 0;
// This is where things go wrong:
const newVal = await fetch('/increment?val=' + val);
// And this throws an error:
await store.put(newVal, 'counter');
await tx.done;
```

In this case, the transaction closes while the browser is fetching, so `store.put` fails.

## `IDBDatabase` enhancements

### Shortcuts to get/set from an object store

It's common to create a transaction for a single action, so helper methods are included for this:

```js
// Get a value from a store:
const value = await db.get(storeName, key);
// Set a value in a store:
await db.put(storeName, value, key);
```

The shortcuts are: `get`, `getKey`, `getAll`, `getAllKeys`, `getAllRecords`, `count`, `put`, `add`, `delete`, and `clear`. Each method takes a `storeName` argument, the name of the object store, and the rest of the arguments are the same as the equivalent `IDBObjectStore` method.

### Shortcuts to get from an index

The shortcuts are: `getFromIndex`, `getKeyFromIndex`, `getAllFromIndex`, `getAllKeysFromIndex`, `getAllRecordsFromIndex`, and `countFromIndex`.

```js
// Get a value from an index:
const value = await db.getFromIndex(storeName, indexName, key);
```

Each method takes `storeName` and `indexName` arguments, followed by the rest of the arguments from the equivalent `IDBIndex` method.

## `IDBTransaction` enhancements

### `tx.store`

If a transaction involves a single store, the `store` property will reference that store.

```js
const tx = db.transaction('whatever');
const store = tx.store;
```

If a transaction involves multiple stores, `tx.store` is undefined, you need to use `tx.objectStore(storeName)` to get the stores.

### `tx.done`

Transactions have a `.done` promise which resolves when the transaction completes successfully, and otherwise rejects with the [transaction error](https://developer.mozilla.org/en-US/docs/Web/API/IDBTransaction/error).

```js
const tx = db.transaction(storeName, 'readwrite');
await Promise.all([
  tx.store.put('bar', 'foo'),
  tx.store.put('world', 'hello'),
  tx.done,
]);
```

If you're writing to the database, `tx.done` is the signal that everything was successfully committed to the database. However, it's still beneficial to await the individual operations, as you'll see the error that caused the transaction to fail.

`tx.done` rejects with the error that actually caused the failure — a `ConstraintError` for a duplicate key, a `QuotaExceededError` when storage is full — rather than a generic `AbortError`. Only an abort with no other cause, such as an explicit `tx.abort()`, gives you an `AbortError`.

You don't have to await `tx.done`. For a read there's often no reason to, and a transaction that fails unobserved won't produce an unhandled rejection.

A failed operation aborts its transaction for you, so you rarely need `tx.abort()` by hand. It matters when *your own* code throws part-way through, and you want the writes already made to roll back:

```js
const tx = db.transaction(storeName, 'readwrite');

try {
  await tx.store.put(await computeSomething(), 'key');
  await tx.done;
} catch (err) {
  tx.abort();
  throw err;
}
```

## `IDBCursor` enhancements

Cursor advance methods (`advance`, `continue`, `continuePrimaryKey`) return a promise for the cursor, or null if there are no further values to provide.

```js
let cursor = await db.transaction(storeName).store.openCursor();

while (cursor) {
  console.log(cursor.key, cursor.value);
  cursor = await cursor.continue();
}
```

## Async iterators

You can iterate over stores, indexes, and cursors:

```js
const tx = db.transaction(storeName);

for await (const cursor of tx.store) {
  // …
}
```

Each yielded object is an `IDBCursor`. You can optionally use the advance methods to skip items (within an async iterator they return void):

```js
const tx = db.transaction(storeName);

for await (const cursor of tx.store) {
  console.log(cursor.value);
  // Skip the next item
  cursor.advance(2);
}
```

If you don't manually advance the cursor, `cursor.continue()` is called for you.

Stores and indexes also have an `iterate` method which has the same signature as `openCursor`, but returns an async iterator:

```js
const index = db.transaction('books').store.index('author');

for await (const cursor of index.iterate('Douglas Adams')) {
  console.log(cursor.value);
}
```

`iterateKeys` is the same thing over `openKeyCursor`, for when you only need keys and would rather not read every value off disk:

```js
for await (const cursor of db.transaction('books').store.iterateKeys()) {
  console.log(cursor.key);
}
```

## `getAll` options

`getAll`, `getAllKeys` and `getAllRecords` accept an options object in place of the `query`/`count` arguments, which is the only way to ask for records in reverse:

```js
const store = db.transaction('books').store;

const newest = await store.getAll({ direction: 'prev', count: 10 });
```

`direction` is `'next' | 'prev'` on a store, and the full `IDBCursorDirection` on an index. `getAllRecords` returns `{ key, primaryKey, value }` objects rather than bare values, so one call gives you keys and values together.

These need browser support for [`getAllRecords`](https://developer.mozilla.org/en-US/docs/Web/API/IDBObjectStore/getAllRecords) (Chrome/Edge 141+). Feature-detect with `'getAllRecords' in IDBObjectStore.prototype`.

## `ignoreConstraints`

By default a duplicate key aborts the whole transaction, so one bad record throws away an entire bulk insert. `ignoreConstraints` handles the `ConstraintError` at the request, leaving the transaction free to commit, and resolves with `undefined` for the record that was skipped:

```js
import { ignoreConstraints, openDB } from '@aibulat/indexeddb';

const tx = db.transaction('books', 'readwrite');
const keys = await Promise.all(
  books.map((book) => ignoreConstraints(tx.store.add(book))),
);
await tx.done;
// keys holds a key per book, and undefined where one already existed.
```

Any other error still rejects, and still aborts the transaction.

## Closing with `using`

A database is a disposable resource, so it closes itself at the end of the scope if you declare it with [`using`](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-2.html#using-declarations-and-explicit-resource-management):

```ts
using db = await openDB('my-db', 1);
await db.put('keyval', 'hello', 'greeting');
// db.close() runs here, however the scope exits.
```

This needs `Symbol.dispose`, which is TypeScript 5.2+ with `ESNext.Disposable` in your `lib`. Nothing is required of consumers who don't use it: the declaration disappears when the lib is absent, rather than failing to compile.

# Examples

## Keyval store

This is very similar to `localStorage`, but async. If this is _all_ you need, you may be interested in [idb-keyval](https://www.npmjs.com/package/idb-keyval). You can always upgrade to this library later.

```js
import { openDB } from '@aibulat/indexeddb';

const dbPromise = openDB('keyval-store', 1, {
  upgrade(db) {
    db.createObjectStore('keyval');
  },
});

export async function get(key) {
  return (await dbPromise).get('keyval', key);
}
export async function set(key, val) {
  return (await dbPromise).put('keyval', val, key);
}
export async function del(key) {
  return (await dbPromise).delete('keyval', key);
}
export async function clear() {
  return (await dbPromise).clear('keyval');
}
export async function keys() {
  return (await dbPromise).getAllKeys('keyval');
}
```

## Article store

```js
import { openDB } from '@aibulat/indexeddb';

async function demo() {
  const db = await openDB('Articles', 1, {
    upgrade(db) {
      // Create a store of objects
      const store = db.createObjectStore('articles', {
        // The 'id' property of the object will be the key.
        keyPath: 'id',
        // If it isn't explicitly set, create a value by auto incrementing.
        autoIncrement: true,
      });
      // Create an index on the 'date' property of the objects.
      store.createIndex('date', 'date');
    },
  });

  // Add an article:
  await db.add('articles', {
    title: 'Article 1',
    date: new Date('2019-01-01'),
    body: '…',
  });

  // Add multiple articles in one transaction:
  {
    const tx = db.transaction('articles', 'readwrite');
    await Promise.all([
      tx.store.add({
        title: 'Article 2',
        date: new Date('2019-01-01'),
        body: '…',
      }),
      tx.store.add({
        title: 'Article 3',
        date: new Date('2019-01-02'),
        body: '…',
      }),
      tx.done,
    ]);
  }

  // Get all the articles in date order:
  console.log(await db.getAllFromIndex('articles', 'date'));

  // Add 'And, happy new year!' to all articles on 2019-01-01:
  {
    const tx = db.transaction('articles', 'readwrite');
    const index = tx.store.index('date');

    for await (const cursor of index.iterate(new Date('2019-01-01'))) {
      const article = { ...cursor.value };
      article.body += ' And, happy new year!';
      cursor.update(article);
    }

    await tx.done;
  }
}
```

# TypeScript

This library is fully typed, and you can improve things by providing types for your database:

```ts
import { openDB, DBSchema } from '@aibulat/indexeddb';

interface MyDB extends DBSchema {
  'favourite-number': {
    key: string;
    value: number;
  };
  products: {
    value: {
      name: string;
      price: number;
      productCode: string;
    };
    key: string;
    indexes: { 'by-price': number };
  };
}

async function demo() {
  const db = await openDB<MyDB>('my-db', 1, {
    upgrade(db) {
      db.createObjectStore('favourite-number');

      const productStore = db.createObjectStore('products', {
        keyPath: 'productCode',
      });
      productStore.createIndex('by-price', 'price');
    },
  });

  // This works
  await db.put('favourite-number', 7, 'Jen');
  // This fails at compile time, as the 'favourite-number' store expects a number.
  await db.put('favourite-number', 'Twelve', 'Jake');
}
```

To define types for your database, extend `DBSchema` with an interface where the keys are the names of your object stores.

For each value, provide an object where `value` is the type of values within the store, and `key` is the type of keys within the store.

Optionally, `indexes` can contain a map of index names, to the type of key within that index.

Provide this interface when calling `openDB`, and from then on your database will be strongly typed. This also allows your IDE to autocomplete the names of stores and indexes.

## Opting out of types

If you call `openDB` without providing types, your database will use basic types. However, sometimes you'll need to interact with stores that aren't in your schema, perhaps during upgrades. In that case you can cast.

Let's say we were renaming the 'favourite-number' store to 'fave-nums':

```ts
import { openDB, DBSchema, IDBPDatabase } from '@aibulat/indexeddb';

interface MyDBV1 extends DBSchema {
  'favourite-number': { key: string; value: number };
}

interface MyDBV2 extends DBSchema {
  'fave-num': { key: string; value: number };
}

const db = await openDB<MyDBV2>('my-db', 2, {
  async upgrade(db, oldVersion) {
    // Cast a reference of the database to the old schema.
    const v1Db = db as unknown as IDBPDatabase<MyDBV1>;

    if (oldVersion < 1) {
      v1Db.createObjectStore('favourite-number');
    }
    if (oldVersion < 2) {
      const store = v1Db.createObjectStore('favourite-number');
      store.name = 'fave-num';
    }
  },
});
```

You can also cast to a typeless database by omitting the type, eg `db as IDBPDatabase`.

Note: Types like `IDBPDatabase` are used by TypeScript only. The implementation uses proxies under the hood.

# Developing

This package lives in the [`@aibulat/packages`](https://github.com/ngmaibulat/packages) workspace. From the package directory:

```sh
pnpm run build       # tsdown -> dist/, plus publint and attw
pnpm run dev         # tsdown --watch
pnpm run typecheck   # both the src and test projects
pnpm run test        # node:test against @aibulat/indexeddb-impl
```

The suite is 117 tests over `node:test`, run against the sibling [`@aibulat/indexeddb-impl`](../indexeddb-impl) rather than a real browser, so it needs no web server and runs in CI. That package has to be **built** first — the exports map resolves into its `dist/`, and a fresh checkout has none. Roughly half the assertions are compile-time `typeAssert<IsExact<…>>` checks from `conditional-type-checks`; those fail `typecheck`, not `test`.

Run a single file or a single test:

```sh
node --test test/open.test.ts
node --test --test-name-pattern="upgrade" test/open.test.ts
```

Because `@aibulat/indexeddb-impl` is a reimplementation rather than a real engine, it can differ from browsers at the edges — two tests carry comments where they had to be adjusted for it. Worth a manual browser check against `dist/index.js` before releasing anything behaviourally risky.
