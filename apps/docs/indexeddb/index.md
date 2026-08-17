# @aibulat/indexeddb

One package, **two APIs**. Install it once and pick the entry point that suits the
code you are writing: a thin promise wrapper over raw IndexedDB, or a full
Dexie-compatible database layer with a schema DSL, a query builder and reactive
queries.

It is a fork of [`idb`](https://github.com/jakearchibald/idb) by Jake Archibald,
forked at v8.0.3 and maintained as an API-compatible superset, with the high-level
API added alongside it. ESM only, zero runtime dependencies.

## Two APIs

| | [Low-level](./low-level.md) | [Nexie](./nexie.md) — high-level |
|---|---|---|
| **Import** | `@aibulat/indexeddb` | `@aibulat/indexeddb/nexie` |
| **Shape** | `openDB()`, object stores, transactions, cursors | `new Nexie()`, schema DSL, query builder |
| **Mental model** | raw IndexedDB, with promises and types | a small ORM over IndexedDB |
| **Size** | ~1.9 kB brotli'd | ~124 kB unminified |
| **Transactions** | native — they auto-commit if you `await` anything else | join automatically across `await` |
| **Reactive queries** | — | `liveQuery` |
| **Coming from** | `idb` — it is a superset, nothing to change | `dexie` — migration is a rename |

## Which one

**Take the [low-level API](./low-level.md)** if you want IndexedDB itself with the
sharp edges filed off. You keep full control of stores, transactions and cursors,
you keep the ~1.9 kB, and if you already use `idb` you are already using it — this
is an API-compatible superset.

**Take [Nexie](./nexie.md)** if you would rather describe a schema and query it. You
get `db.friends.where("age").above(25).toArray()` instead of a cursor walk,
transactions that survive `await` without auto-committing, CRUD hooks, middleware,
and `liveQuery` for views that re-render themselves when their own results change.
If you are coming from Dexie 4, migration is `Dexie` → `Nexie` and nothing else.

## Install

```bash
npm install @aibulat/indexeddb
```

That is the whole install for both. Nexie is not a separate package and adds no
dependency — it is a second entry point in this one.

The two module graphs are **disjoint**: nothing in the Nexie graph imports the
low-level entry, so importing one never pulls in the other. Choosing Nexie costs the
low-level bundle nothing, and the ~1.9 kB figure stays true for anyone who never
touches `./nexie`.

## The same task, both ways

Create a store, write a record, read it back.

::: code-group

```ts [Low-level]
import { openDB } from "@aibulat/indexeddb";

const db = await openDB("friends-db", 1, {
    upgrade(db) {
        const store = db.createObjectStore("friends", {
            keyPath: "id",
            autoIncrement: true,
        });
        store.createIndex("age", "age");
    },
});

await db.add("friends", { name: "Alice", age: 30 });

const grownups = await db.getAllFromIndex(
    "friends",
    "age",
    IDBKeyRange.lowerBound(26),
);
```

```ts [Nexie]
import Nexie from "@aibulat/indexeddb/nexie";

const db = new Nexie("friends-db");
db.version(1).stores({ friends: "++id, name, age" });

await db.friends.add({ name: "Alice", age: 30 });

const grownups = await db.friends.where("age").above(25).toArray();
```

:::

Same database, same storage engine underneath — only the API you write against
differs.
