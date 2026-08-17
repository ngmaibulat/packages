# @aibulat/indexeddb

IndexedDB with usability. One package, **two APIs** — install it once and import the one that suits the code you are writing.

> A fork of [`idb`](https://github.com/jakearchibald/idb) by Jake Archibald, forked at v8.0.3. The low-level API is an **API-compatible superset** of idb: everything idb does works the same way, plus fixes and additions upstream has not shipped — see [Changes](#changes) for the list. Ships ESM only, and is maintained as part of the [`@aibulat`](https://github.com/ngmaibulat/packages) workspace. See [LICENSE](LICENSE) for the retained upstream notice.

## Two APIs

|                     | [Part 1 — Low-level](#part-1--low-level-api-aibulatindexeddb)                    | [Part 2 — Nexie, high-level](#part-2--nexie-the-high-level-api-aibulatindexeddbnexie) |
| ------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| **Import**          | `@aibulat/indexeddb`                                                             | `@aibulat/indexeddb/nexie`                                                            |
| **Shape**           | `openDB()`, object stores, transactions, cursors                                 | `new Nexie()`, schema DSL, query builder                                              |
| **Mental model**    | raw IndexedDB, with promises and types                                           | a small ORM over IndexedDB                                                            |
| **Size**            | ~1.9 kB brotli'd                                                                 | ~124 kB unminified                                                                    |
| **Transactions**    | native — they auto-commit if you `await` anything else                           | join automatically across `await`                                                     |
| **Reactive queries**| —                                                                                | `liveQuery`                                                                           |
| **Coming from**     | `idb` — it is a superset, nothing to change                                      | `dexie` — migration is a rename                                                       |

The two module graphs are **disjoint**: nothing in the Nexie graph imports the low-level entry, so importing one never pulls in the other. Choosing Nexie costs the low-level bundle nothing, and the ~1.9 kB figure above stays true for anyone who never touches `./nexie`.

1. [Installation](#installation)
1. [Changes](#changes)
1. [Browser support](#browser-support)
1. [**Part 1 — Low-level API** (`@aibulat/indexeddb`)](#part-1--low-level-api-aibulatindexeddb)
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
1. [**Part 2 — Nexie, the high-level API** (`@aibulat/indexeddb/nexie`)](#part-2--nexie-the-high-level-api-aibulatindexeddbnexie)
   1. [Coming from Dexie](#coming-from-dexie)
   1. [Schema](#schema)
   1. [Querying](#querying)
   1. [Transactions](#transactions)
   1. [Opening a database you did not declare](#opening-a-database-you-did-not-declare)
   1. [Options](#options)
   1. [`liveQuery`](#livequery)
   1. [Hooks, events and middleware](#hooks-events-and-middleware)
   1. [Typing tables](#typing-tables)
   1. [Errors](#errors)
   1. [Differences from Dexie](#differences-from-dexie)
1. [Developing](#developing)

# Installation

## Using a package manager

```sh
pnpm add @aibulat/indexeddb
```

That one install carries both APIs. Then, assuming you're using a module-compatible system (like Vite, webpack, Rollup etc), import whichever one you want:

```js
// Part 1 — the low-level API.
import { openDB, deleteDB, wrap, unwrap } from '@aibulat/indexeddb';

async function doDatabaseStuff() {
  const db = await openDB(…);
}
```

```js
// Part 2 — Nexie, the high-level API. Same package, no extra dependency.
import Nexie, { liveQuery } from '@aibulat/indexeddb/nexie';

const db = new Nexie('MyDB');
db.version(1).stores({ friends: '++id, name, age' });
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

# Part 1 — Low-level API (`@aibulat/indexeddb`)

```js
import { openDB, deleteDB, wrap, unwrap, ignoreConstraints } from '@aibulat/indexeddb';
```

Everything in this part is the package's root entry: a thin wrapper that mostly mirrors the IndexedDB API, with small improvements that make a big difference to usability. You still think in object stores, transactions and cursors — that is the point of it. If you would rather describe a schema and query it, skip to [Part 2](#part-2--nexie-the-high-level-api-aibulatindexeddbnexie).

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

`tx.done` rejects with the error that actually caused the failure — a `ConstraintError` for a duplicate key, a `QuotaExceededError` when storage is full — rather than a generic `AbortError`. Only an abort with no other cause, such as an explicit `tx.abort()`, gives you an `AbortError`. That one is synthesised here rather than read off the transaction (which has no error to read), and its message is `A request was aborted.` — the same name idb uses, not the same message, so match on `name`, not on text.

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

Two rules, both enforced with a `TypeError` rather than silently doing the wrong thing:

- **Call it in the same turn as the write**, before awaiting anything. The suppression is a listener on the request's `error` event, and once that event has fired the `ConstraintError` has already reached the transaction and aborted it — swallowing it from the promise at that point would report a clean `undefined` for a write that took the whole transaction down.
- **Pass the promise of a store or index write** — `tx.store.add(...)`, `index.put(...)` and so on. The `db.add()` / `db.put()` shortcuts open and close a transaction of their own, and by the time you hold their promise there is no request left to attach to.

The listener is removed once the request settles, so a request object that outlives the operation — a cursor's, say — is not left with a constraint-swallowing listener on whatever it does next.

## Closing with `using`

A database is a disposable resource, so it closes itself at the end of the scope if you declare it with [`using`](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-2.html#using-declarations-and-explicit-resource-management):

```ts
using db = await openDB('my-db', 1);
await db.put('keyval', 'hello', 'greeting');
// db.close() runs here, however the scope exits.
```

This needs `Symbol.dispose`, which is TypeScript 5.2+ with `ESNext.Disposable` in your `lib`. Nothing is required of consumers who don't use it: the declaration disappears when the lib is absent, rather than failing to compile.

## Examples

### Keyval store

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

### Article store

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

## TypeScript

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

### Assembling a schema across files

Every piece of the above is exported as a named type, so a schema, a migration or a set of callbacks can live in its own module and still be checked against the database:

```ts
import type {
  DBSchema, DBSchemaValue, IndexKeys,        // the schema and its parts
  StoreNames, StoreKey, StoreValue,          // resolve names/keys/values against a schema
  IndexNames, IndexKey,                      // the same for a store's indexes
  OpenDBUpgradeCallback, OpenDBBlockedCallback,
  OpenDBBlockingCallback, OpenDBTerminatedCallback,
  DeleteDBBlockedCallback, DeleteDBCallbacks,
  IDBTransactionOptions,                     // { durability?: 'default' | 'strict' | 'relaxed' }
  IDBPStoreGetAllOptions, IDBPIndexGetAllOptions,
} from '@aibulat/indexeddb';

// migrations.ts
export const upgrade: OpenDBUpgradeCallback<MyDB> = (db, oldVersion, newVersion, tx) => {
  if (oldVersion < 1) db.createObjectStore('favourite-number');
  // `tx` is typed as the versionchange transaction over every store in MyDB.
};

// main.ts
const db = await openDB<MyDB>('my-db', 1, { upgrade, terminated() { reconnect(); } });
const tx = db.transaction('products', 'readwrite', { durability: 'relaxed' } satisfies IDBTransactionOptions);
```

`test/types.test.ts` is the compile-time contract for that surface: it asserts each name exists and composes as shown, and it fails `typecheck` — not `test` — if one drifts.

### Opting out of types

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

# Part 2 — Nexie, the high-level API (`@aibulat/indexeddb/nexie`)

```ts
import Nexie, { liveQuery } from '@aibulat/indexeddb/nexie';
```

Everything in [Part 1](#part-1--low-level-api-aibulatindexeddb) is the *low-level* API: you still think in object stores, transactions and cursors. **Nexie** is the other API in this package — a re-implementation of the Dexie 4 API, at its own subpath. You describe a schema and query it; transactions survive `await` instead of auto-committing; `liveQuery` re-runs a query when its own results could have changed.

```sh
npm install @aibulat/indexeddb   # same package, no extra dependency
```

```ts
import Nexie from '@aibulat/indexeddb/nexie';

const db = new Nexie('MyDB');
db.version(1).stores({ friends: '++id, name, age' });

await db.friends.add({ name: 'Alice', age: 30 });
const grownups = await db.friends.where('age').above(25).toArray();
```

The two entries are **disjoint**: nothing under `nexie` imports the low-level entry, so `dist/index.js` is unchanged by its existence and importing one never pulls in the other. `dist/nexie.js` is around 124 kB unminified; the ~1.9 kB figure at the top of this file is the `.` entry and stays true.

## Coming from Dexie

Migration is a rename and nothing else:

```diff
- import Dexie from 'dexie';
+ import Nexie from '@aibulat/indexeddb/nexie';

- const db = new Dexie('MyDB');
+ const db = new Nexie('MyDB');

  db.version(1).stores({ friends: '++id,name,age' });
  await db.friends.where('age').above(25).toArray();
```

Dexie-branded *identifiers* are renamed — `NexieError`, `Nexie.Promise`, `Nexie.addons`, `Nexie.errnames`, `Nexie.currentTransaction`. API-visible *strings* are not, because code matches on them: error `name` values stay `'ConstraintError'` and friends, so `.catch('ConstraintError', handler)` still works, as do the schema DSL, the `'rw!'` / `'r?'` mode strings and the `':id'` magic index.

This is a clean-room implementation, not a port: Dexie is Apache-2.0, this package is MIT, and no Dexie code was copied.

## Schema

A version declares its stores with the Dexie schema DSL, unchanged:

```ts
db.version(1).stores({
    friends: '++id, name, age, *tags, [name+age], &email',
});
```

| Token          | Meaning                                                |
| -------------- | ------------------------------------------------------ |
| `++id`         | Auto-incrementing primary key                          |
| `id`           | Primary key, supplied by you                           |
| `name`         | Indexed property                                       |
| `&email`       | Unique index                                           |
| `*tags`        | Multi-entry index — one entry per array element        |
| `[name+age]`   | Compound index                                         |
| _(leading `,`)_ | Outbound primary key: no key stored inside the record |

A compound index also answers queries on its **leading prefix**: with only `[name+age]` declared, `db.friends.where('name').equals('Alice')` works. That is a correctness feature rather than an optimisation — Dexie users rely on it. `':id'` is the magic index naming the primary key itself.

Later versions get an upgrade function, run once per version between the stored one and the current:

```ts
db.version(2)
    .stores({ friends: '++id, name, age, email' })
    .upgrade((tx) =>
        tx.table('friends').toCollection().modify((f) => {
            f.email ??= `${f.name}@example.com`;
        }),
    );
```

Set a store to `null` to drop it. `db.tables` lists the `Table` objects, and each table is also a property on the database (`db.friends`) as long as the name does not collide with a `Nexie` member.

## Querying

`table.where()` returns a `WhereClause`; every operator on it returns a `Collection`, which is lazy until you materialise it:

```ts
await db.friends.get(1);
await db.friends.where('age').between(20, 40).toArray();
await db.friends.where('name').startsWithIgnoreCase('a').limit(10).toArray();
await db.friends.where('age').anyOf([20, 30, 40]).reverse().sortBy('name');
await db.friends.where({ name: 'Alice', age: 30 }).first();
await db.friends.orderBy('age').offset(10).limit(5).toArray();
await db.friends.filter((f) => f.name.length > 4).each((f) => console.log(f));
```

All 18 `WhereClause` operators are present — `equals`, `notEqual`, `above`, `aboveOrEqual`, `below`, `belowOrEqual`, `between`, `startsWith`, `anyOf`, `noneOf`, `inAnyRange`, `startsWithAnyOf` and the four `…IgnoreCase` variants — along with `or()` unions, `distinct()`, `until()`, `and()` and the `each*` family. Materialisers: `toArray`, `first`, `last`, `count`, `keys`, `primaryKeys`, `uniqueKeys`, `sortBy`.

Writes:

```ts
await db.friends.add({ name: 'Alice', age: 30 });   // key written back onto the object
await db.friends.put({ id: 1, name: 'Alice', age: 31 });
await db.friends.update(1, { age: 32 });
await db.friends.upsert(1, { age: 33 });
await db.friends.bulkAdd(records, { allKeys: true });
await db.friends.where('age').below(18).delete();
await db.friends.where('age').above(65).modify({ retired: true });
```

`update`, `upsert`, `modify` and `bulkUpdate` take an `UpdateSpec`, which accepts the modifier functions exported alongside the class:

```ts
import { add, remove, replacePrefix } from '@aibulat/indexeddb/nexie';

await db.friends.update(1, { age: add(1), tags: remove(['new']) });
// `add`/`remove` take a number (or bigint) for numeric fields and an array for array fields.
```

## Transactions

```ts
await db.transaction('rw', db.friends, async () => {
    await db.friends.add({ name: 'Alice', age: 30 });
    await db.friends.where('name').equals('Bob').delete();
});
```

Table calls inside the scope join the transaction automatically, across `await` — there is nothing to thread through. That works by tracking the transaction in a zone that survives suspension, so **every promise you await inside a scope must be one of ours**. Awaiting a native promise (a `fetch`, a foreign library) loses the transaction, and the operation after it would otherwise open a second one silently. Use the escape hatch:

```ts
const data = await Nexie.waitFor(fetch('/api/friends').then((r) => r.json()));
```

`Nexie.currentTransaction` is the transaction the calling code is inside, or `null`.

If a foreign `await` does slip through, you get a **`ForeignAwaitError`** naming the fix rather than a second transaction opened behind your back:

```
friends: an open transaction on this table is waiting on a promise this library
did not create, so its scope has been lost. Await only Nexie promises inside a
transaction, wrap foreign ones in Nexie.waitFor(), or use
Nexie.ignoreTransaction() if this call is genuinely unrelated to it.
```

`Nexie.ignoreTransaction(fn)` is the other side of that: it runs `fn` outside the ambient transaction, so bookkeeping that must survive a rollback of the work that triggered it gets a transaction of its own.

Nested scopes join the enclosing transaction when they can. A `'rw'` scope inside an `'r'` one is a `SubTransactionError`, as is a nested scope naming a table the parent did not include; the Dexie modifiers work as documented — `'rw!'` always opens a fresh top-level transaction, `'rw?'` joins the parent when it is still active and otherwise opens its own.

The `Transaction` object (`Nexie.currentTransaction`, or the argument to a scope) carries `on('complete')`, `on('error')` and `on('abort')`, and `Nexie.waitFor()` may be outstanding more than once at a time.

### Unhandled rejections inside a scope

An operation started inside a transaction scope, an `on('populate')` subscriber or a `version().upgrade()` callback and never awaited still counts. If it rejects and nothing handles it by the end of the tick, the enclosing scope fails with that error — the transaction aborts, `open()` rejects — the way it does in Dexie, so a fire-and-forget write that hits a `ConstraintError` cannot leave you with a partially committed transaction that reported success.

Outside any scope, an unhandled Nexie promise rejection is reported the way a native one is: as an `unhandledrejection` event where the host has `PromiseRejectionEvent` (browsers), otherwise through `console.error`. Set `NexiePromise.onUnhandled` to route those somewhere else.

## Opening a database you did not declare

Skip `version().stores()` entirely and Nexie reads the schema out of the database instead — for tooling, migrations, or just finding out what is in there:

```ts
const db = new Nexie('SomeoneElsesDB');
await db.open();

db.dynamicallyOpened();                      // true
db.tables.map((t) => t.name);                // whatever is actually there
await db.table('friends').toArray();         // and it works
```

Opening a database that does not exist this way is a `NoSuchDatabaseError`, not a silently created empty one — pass `{ allowEmptyDB: true }` if creating it is what you meant. Related statics: `Nexie.exists(name)`, `Nexie.getDatabaseNames()` and `Nexie.delete(name)`.

## Options

```ts
new Nexie('MyDB', {
    autoOpen: true,                          // open on first use (default)
    allowEmptyDB: false,                     // see above
    chromeTransactionDurability: 'relaxed',  // faster commits, Chromium reads it
    modifyChunkSize: 200,                    // records per write-back request
    maxConnections: 100,                     // leak warning threshold
    addons: [],
    indexedDB, IDBKeyRange,                  // inject an implementation
});
```

`Nexie.debug = true` turns on the engine's own invariant assertion — cheap, and worth having on in development. `Nexie.semVer` is the library version.

In a browser, a page frozen into the **bfcache** has its database closed on `pagehide` and reopened on `pageshow`, because a browser may close those connections while the page sits there and hand it back looking intact.

## `liveQuery`

A query that re-runs itself when its own result could have changed:

```ts
import { liveQuery } from '@aibulat/indexeddb/nexie';

const subscription = liveQuery(() =>
    db.friends.where('age').above(25).toArray(),
).subscribe((friends) => render(friends));

// later
subscription.unsubscribe();
```

The querier runs in a zone that records every read it makes, down to the key ranges. Each committed transaction publishes what it wrote, and the query re-runs only where the two intersect — so a `liveQuery` over `db.friends.get(7)` ignores writes to every other friend. Writes made through a second connection, or in another tab (via `BroadcastChannel`, feature-detected), come through the same path.

Two things to know:

- The same zone rule applies: **await only Nexie promises inside a querier**, or the reads after that point go unrecorded and the query stops re-running for them.
- Invalidation is exact on primary keys, and on secondary indexes for `add`, `put` and `delete` — a `put` reads the record it displaces, so a query watching the *old* value of a renamed field is woken too. That read happens only while something is subscribed, so an application with no `liveQuery` pays nothing for it. Range deletes are the one case still widened to the whole index, since being precise there would mean reading an unbounded number of records. The approximation is one-directional by design: it re-runs a query that need not have re-run, never the reverse.

## Hooks, events and middleware

CRUD hooks fire around every write, whichever API path reached it:

```ts
db.friends.hook('creating', (primKey, obj) => {
    obj.createdAt = Date.now();
});
db.friends.hook('reading', (obj) => decorate(obj));
db.friends.hook('updating', (mods, primKey, obj) => ({ updatedAt: Date.now() }));
db.friends.hook('deleting', (primKey, obj) => audit(obj));
```

Database events cover the lifecycle:

```ts
db.on('populate', () => db.friends.bulkAdd(seedData));
db.on('blocked', () => console.warn('another tab is holding the old version'));
db.on('ready', () => console.log('open and usable'));          // fires once, or at once if already open
db.on('ready', () => console.log('every open'), true);          // sticky: fires on every (re)open
db.on('versionchange', () => db.close());
db.on('close', () => console.log('connection gone'));
```

Underneath both, `db.use()` installs a middleware over DBCore — the layer every read and every write passes through. The library's own CRUD hooks and observability are built on it rather than beside it, which is what keeps the extension point exercised:

```ts
db.use({
    stack: 'dbcore',
    name: 'logger',
    create: (down) => ({
        table: (name) => {
            const table = down.table(name);
            return {
                ...table,
                mutate: (req) => {
                    console.log(name, req.type);
                    return table.mutate(req);
                },
            };
        },
    }),
});
```

`mutate`, `get`, `getMany`, `count`, `query` and `openCursor` are all interceptable. `mapToClass`, `defineClass`, the `Entity` base class and `Nexie.addons` are present too, and hooks and class mappings survive a later `db.version(n).stores()` declaration.

## Typing tables

`Table<T, TKey, TInsertType>` takes the same three parameters as Dexie's, and `EntityTable` derives the key and insert types from the entity so an auto-incremented `id` need not be optional on the way in:

```ts
import { Nexie, type EntityTable } from '@aibulat/indexeddb/nexie';

interface Friend { id: number; name: string; age: number }

const db = new Nexie('friends') as Nexie & {
    friends: EntityTable<Friend, 'id'>;      // key: number, insert type: Omit<Friend, 'id'>
};
db.version(1).stores({ friends: '++id, name, age' });

await db.friends.add({ name: 'Alice', age: 30 });   // no id required
const alice = await db.friends.get({ name: 'Alice' }); // criteria form of get()
```

`InsertType`, `IDType` and `NonInsertProps` are exported alongside for building your own.

## Errors

```ts
try {
    await db.friends.add({ name: 'Alice', email: 'taken@example.com' });
} catch (error) {
    if (error instanceof Nexie.ConstraintError) { /* … */ }
}

await db.friends.add(friend).catch('ConstraintError', handleDuplicate);
```

Every error is a `NexieError` carrying the Dexie `name` string, so both forms work and `Nexie.errnames.Constraint === 'ConstraintError'` holds. The named-`catch` form is on Nexie's own promises, which is what every API here returns. `exceptions` and `errnames` are exported from the subpath if you need them directly, and the constructors are also mounted on the class (`Nexie.ConstraintError`, `Nexie.ModifyError`, …).

Alongside the mirrored IndexedDB `DOMException` names there are Nexie-only ones: `OpenFailedError`, `SchemaError`, `UpgradeError`, `InvalidTableError`, `NoSuchDatabaseError`, `PrematureCommitError`, `ModifyError`, `BulkError` and `ForeignAwaitError` (see [Transactions](#transactions)).

## Differences from Dexie

The API surface is complete, with two deliberate exceptions:

- **No query result cache.** Dexie's `cache: 'immutable' | 'cloned'` keeps query results in memory and updates them optimistically. It is a performance layer rather than a correctness one — `liveQuery` is exact without it — and it carries the highest bug density per line in Dexie, so it is not here. The DBCore read path every query now goes through is the seam it would plug into.
- **No `Dexie.Table<T, K>` namespace shim.** Import the types instead: `import type { Table, Collection } from '@aibulat/indexeddb/nexie'`.

Two things are shaped differently rather than missing: `Nexie.vip(fn)` is a function rather than a property, and long-stack support is replaced by `Nexie.debug`, which asserts the engine's own invariant instead of rewriting stack traces.

Two things are stricter than Dexie, on purpose: awaiting a foreign promise inside a scope is a `ForeignAwaitError` rather than a silently opened second transaction, and an unhandled rejection outside any scope is reported (see [Transactions](#transactions)) rather than dropped.

# Developing

This package lives in the [`@aibulat/packages`](https://github.com/ngmaibulat/packages) workspace. From the package directory:

```sh
pnpm run build       # tsdown -> dist/, plus publint and attw
pnpm run dev         # tsdown --watch
pnpm run typecheck   # both the src and test projects
pnpm run test        # node:test against @aibulat/indexeddb-impl
pnpm run test:bun    # the same suite under Bun, and the totals must match
```

The suite is 485 tests over `node:test`, run against the sibling [`@aibulat/indexeddb-impl`](../indexeddb-impl) rather than a real browser, so it needs no web server and runs in CI. That package has to be **built** first — the exports map resolves into its `dist/`, and a fresh checkout has none. Some of the assertions are compile-time `typeAssert<IsExact<…>>` checks from `conditional-type-checks`; those fail `typecheck`, not `test`.

It must report **identical totals under Node and Bun**. That is not ceremony: Nexie's transaction zone rests on the normative ordering of `Await` and promise-resolve-thenable jobs, and Bun is JSC where Node is V8. A divergence there is a bug in the design rather than a runtime quirk, which is why there are no per-runtime expectations to absorb one.

Run a single file or a single test:

```sh
node --test test/open.test.ts
node --test --test-name-pattern="upgrade" test/open.test.ts
```

Because `@aibulat/indexeddb-impl` is a reimplementation rather than a real engine, it can differ from browsers at the edges — two tests carry comments where they had to be adjusted for it. Worth a manual browser check against `dist/index.js` before releasing anything behaviourally risky.
