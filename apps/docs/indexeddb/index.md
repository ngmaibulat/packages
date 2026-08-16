# @aibulat/indexeddb

IndexedDB, but usable. The raw API predates promises: every read is an `IDBRequest`
you attach `onsuccess` and `onerror` to, and the type definitions know nothing about
your schema. This library wraps the whole surface in `Proxy` objects so requests
become promises and store names become literal types.

It is a fork of [`idb`](https://github.com/jakearchibald/idb) by Jake Archibald at
v8.0.3, with the API unchanged. It is ~1.9 kB brotli'd and has no runtime
dependencies.

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

## Behaviour

| | |
|---|---|
| Requests | Any method that would return an `IDBRequest` returns a promise instead. |
| Transactions | `tx.done` is a promise for the transaction completing. `tx.store` is the store, when the transaction covers exactly one. |
| Shortcuts | `db.get`, `getKey`, `getAll`, `getAllKeys`, `count`, `put`, `add`, `delete`, `clear` and the `…FromIndex` variants run a whole one-store transaction for you. |
| Identity | Wrapped objects are cached, so `db.transaction === db.transaction`, and they still satisfy `instanceof IDBDatabase`. |
| Escape hatch | `unwrap()` returns the underlying native object; `wrap()` enhances one you were handed. |

## Gotchas

- **Do not `await` anything else mid-transaction.** IndexedDB auto-commits a
  transaction once it has nothing left to do after microtasks drain. Awaiting a
  `fetch` in the middle closes it, and the next `store.put` fails. This is IndexedDB
  behaviour, not something the wrapper can hide.
- **Some methods throw rather than reject.** The library cannot know in advance which
  members return an `IDBRequest`, so `store.put` and friends may throw synchronously.
  Inside an `async` function there is no observable difference.
- **Types degrade deliberately without a schema.** With no `DBSchema` type argument,
  store names widen to `string` and values to `any` — which is the documented way to
  opt out during multi-version migrations.

Full API reference, including every enhancement and the TypeScript opt-out, is in the
[package README](https://github.com/ngmaibulat/packages/tree/main/packages/indexeddb#readme).
