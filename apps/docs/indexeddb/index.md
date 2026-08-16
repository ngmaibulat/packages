# @aibulat/indexeddb

IndexedDB, but usable. The raw API predates promises: every read is an `IDBRequest`
you attach `onsuccess` and `onerror` to, and the type definitions know nothing about
your schema. This library wraps the whole surface in `Proxy` objects so requests
become promises and store names become literal types.

It is a fork of [`idb`](https://github.com/jakearchibald/idb) by Jake Archibald,
forked at v8.0.3 and maintained as an API-compatible superset: everything idb does
works the same way, plus fixes and additions upstream never shipped. It is ~1.9 kB
brotli'd and has no runtime dependencies.

## Install

```bash
npm install @aibulat/indexeddb
```

ESM only — there is no CommonJS build and no UMD global.

## Signature

```ts
function openDB<DBTypes extends DBSchema | unknown = unknown>(
    name: string,
    version?: number,
    callbacks?: OpenDBCallbacks<DBTypes>,
): Promise<IDBPDatabase<DBTypes>>;

function deleteDB(
    name: string,
    callbacks?: DeleteDBCallbacks,
): Promise<void>;

function wrap(value: IDBDatabase): IDBPDatabase;
function unwrap<T>(wrapped: T): unknown;

function ignoreConstraints<T>(operation: Promise<T>): Promise<T | undefined>;
```

## Use

```ts
import { openDB } from "@aibulat/indexeddb";

const db = await openDB("my-db", 1, {
    upgrade(db) {
        db.createObjectStore("keyval");
    },
});

await db.put("keyval", "hello", "greeting");
console.log(await db.get("keyval", "greeting")); // "hello"
```

### Typed schemas

Describe the database once and every store name, key and value is checked:

```ts
import { openDB, type DBSchema } from "@aibulat/indexeddb";

interface MyDB extends DBSchema {
    articles: {
        key: number;
        value: { id: number; title: string; date: Date };
        indexes: { date: Date };
    };
}

const db = await openDB<MyDB>("articles-db", 1, {
    upgrade(db) {
        const store = db.createObjectStore("articles", { keyPath: "id" });
        store.createIndex("date", "date");
    },
});

// Typed: the store name, the value shape and the index name are all checked.
const byDate = await db.getAllFromIndex("articles", "date");
```

### Async iteration

Stores, indexes and cursors are async-iterable:

```ts
const tx = db.transaction("articles");

for await (const cursor of tx.store) {
    console.log(cursor.value.title);
}
```

Use `iterateKeys()` when you only need keys and would rather not read every value.

### Beyond idb

```ts
// Read in reverse, or ask for keys and values together.
const newest = await db.getAll("articles", { direction: "prev", count: 10 });
const records = await db.getAllRecords("articles");   // { key, primaryKey, value }

// Skip duplicates without losing the rest of the batch.
const tx = db.transaction("articles", "readwrite");
await Promise.all(articles.map((a) => ignoreConstraints(tx.store.add(a))));
await tx.done;

// Close at the end of the scope.
using db2 = await openDB("articles-db", 1);
```

## Behaviour

| | |
|---|---|
| Requests | Any method that would return an `IDBRequest` returns a promise instead. |
| Transactions | `tx.done` is a promise for the transaction completing, rejecting with the error that actually caused the failure. `tx.store` is the store, when the transaction covers exactly one. |
| Shortcuts | `db.get`, `getKey`, `getAll`, `getAllKeys`, `getAllRecords`, `count`, `put`, `add`, `delete`, `clear` and the `…FromIndex` variants run a whole one-store transaction for you. |
| Identity | Wrapped objects are cached, so `db.transaction === db.transaction`, and they still satisfy `instanceof IDBDatabase`. |
| Escape hatch | `unwrap()` returns the underlying native object; `wrap()` enhances one you were handed. |

## Gotchas

- **Do not `await` anything else mid-transaction.** IndexedDB auto-commits a
  transaction once it has nothing left to do after microtasks drain. Awaiting a
  `fetch` in the middle closes it, and the next `store.put` fails. This is IndexedDB
  behaviour, not something the wrapper can hide.
- **Some methods throw rather than reject.** The library cannot know in advance which
  members return an `IDBRequest`, so `store.put` and friends may throw synchronously.
  Inside an `async` function there is no observable difference. For the same reason,
  assigning `onsuccess`/`onerror` to the returned promise does nothing — there is no
  request there. Use `unwrap()` if you need the real one.
- **Types degrade deliberately without a schema.** With no `DBSchema` type argument,
  store names widen to `string` and values to `any` — which is the documented way to
  opt out during multi-version migrations.

Full API reference, including every enhancement and the TypeScript opt-out, is in the
[package README](https://github.com/ngmaibulat/packages/tree/main/packages/indexeddb#readme).

## The high-level API

Everything above is the low-level API: stores, transactions and cursors, with promises
instead of requests. The same package also ships **[Nexie](./nexie.md)** at
`@aibulat/indexeddb/nexie` — a re-implementation of the Dexie 4 API, with a schema DSL,
a query builder, transactions that join automatically across `await`, and `liveQuery`.

```ts
import Nexie from "@aibulat/indexeddb/nexie";

const db = new Nexie("MyDB");
db.version(1).stores({ friends: "++id, name, age" });
await db.friends.where("age").above(25).toArray();
```

The two graphs are disjoint, so importing one never pulls in the other and the bundle
above is unaffected by the existence of the other.
