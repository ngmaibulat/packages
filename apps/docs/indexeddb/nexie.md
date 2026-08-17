# Nexie — the high-level API

`@aibulat/indexeddb` ships [two API sets](./index.md) from one package. The
[low-level one](./low-level.md) has you thinking in object stores, transactions and
cursors. **Nexie** is the high-level one — a re-implementation of the Dexie 4 API,
at its own subpath:

```ts
import Nexie from "@aibulat/indexeddb/nexie";

const db = new Nexie("MyDB");
db.version(1).stores({ friends: "++id, name, age" });

await db.friends.add({ name: "Alice", age: 30 });
const grownups = await db.friends.where("age").above(25).toArray();
```

No extra install, and no extra dependency: it is the same package. The two entries
are **disjoint** — nothing in the Nexie graph imports the low-level entry, so
`dist/index.js` is byte-identical to what it was before Nexie existed and importing
one never pulls in the other. `dist/nexie.js` is about 124 kB unminified against the
`.` entry's ~1.9 kB brotli'd.

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

Dexie-branded *identifiers* are renamed — `NexieError`, `Nexie.Promise`,
`Nexie.addons`, `Nexie.errnames`, `Nexie.currentTransaction`. API-visible *strings*
are not, because code matches on them: `.catch("ConstraintError", handler)` still
works, and so do the schema DSL, the `'rw!'` / `'r?'` mode strings and the `':id'`
magic index.

It is a clean-room implementation rather than a port. Dexie is Apache-2.0; this
package stays MIT, and no Dexie code was copied.

## Schema

```ts
db.version(1).stores({
    friends: "++id, name, age, *tags, [name+age], &email",
});
```

| Token | Meaning |
|---|---|
| `++id` | Auto-incrementing primary key |
| `id` | Primary key, supplied by you |
| `name` | Indexed property |
| `&email` | Unique index |
| `*tags` | Multi-entry index — one entry per array element |
| `[name+age]` | Compound index |
| *(leading `,`)* | Outbound primary key: no key inside the record |

A compound index also answers queries on its **leading prefix**: with only
`[name+age]` declared, `db.friends.where("name").equals("Alice")` works. That is a
correctness feature rather than an optimisation — Dexie users rely on it.

Later versions get an upgrade function, run once per version between the stored one
and the current:

```ts
db.version(2)
    .stores({ friends: "++id, name, age, email" })
    .upgrade((tx) => tx.table("friends").toCollection().modify((f) => {
        f.email ??= `${f.name}@example.com`;
    }));
```

## Querying

```ts
await db.friends.get(1);
await db.friends.where("age").between(20, 40).toArray();
await db.friends.where("name").startsWithIgnoreCase("a").limit(10).toArray();
await db.friends.where("age").anyOf([20, 30, 40]).reverse().sortBy("name");
await db.friends.where({ name: "Alice", age: 30 }).first();
await db.friends.orderBy("age").offset(10).limit(5).toArray();
await db.friends.filter((f) => f.name.length > 4).each((f) => console.log(f));
```

All 18 `WhereClause` operators are present — `equals`, `above`, `below`, `between`,
`anyOf`, `noneOf`, `startsWith`, the `…IgnoreCase` variants, `notEqual`, and the rest
— along with `or()` unions, `distinct()`, `until()` and the `each*` family.

Writes:

```ts
await db.friends.add({ name: "Alice", age: 30 });   // key written back onto the object
await db.friends.put({ id: 1, name: "Alice", age: 31 });
await db.friends.update(1, { age: 32 });
await db.friends.upsert(1, { age: 33 });
await db.friends.bulkAdd(records, { allKeys: true });
await db.friends.where("age").below(18).delete();
await db.friends.where("age").above(65).modify({ retired: true });
```

## Transactions

```ts
await db.transaction("rw", db.friends, async () => {
    await db.friends.add({ name: "Alice", age: 30 });
    await db.friends.where("name").equals("Bob").delete();
});
```

Table calls inside the scope join that transaction automatically, across `await` —
nothing is threaded through. Modes are `'r'`/`'readonly'` and `'rw'`/`'readwrite'`,
with `!` to force a new transaction and `?` to join a compatible one if there is one.

::: warning Await only Nexie promises inside a scope
The transaction is tracked in a zone that survives suspension, and that only works
for promises this library produced. Awaiting a native promise — a `fetch`, a foreign
library — loses the transaction, and the operation after it would otherwise open a
second one with no error. Use the escape hatch:

```ts
const data = await Nexie.waitFor(fetch("/api/friends").then((r) => r.json()));
```

`Nexie.waitFor` keeps the transaction alive as well as the zone.
:::

`Nexie.currentTransaction` is the transaction the calling code is inside, or `null`.

If a foreign `await` does slip through, the next table call on a table that scope
covers rejects with **`ForeignAwaitError`**, naming the fix — rather than quietly
opening a second transaction and losing the atomicity you asked for. The check is
narrow on purpose: it fires only when the scope is genuinely suspended on something
this library did not create, so unrelated concurrent work is not flagged for merely
running at the same time.

`Nexie.ignoreTransaction(fn)` is the other side of it. It runs `fn` outside the
ambient transaction, which is how bookkeeping survives a rollback of the work that
triggered it:

```ts
await db.transaction("rw", db.friends, async () => {
    await db.friends.add(friend);
    // Its own transaction, so the abort below cannot take it too.
    Nexie.ignoreTransaction(() => db.logs.add({ message: "attempted" }));
    throw new Error("rolling back");
});
```

`Nexie.vip(fn)` runs `fn` with the open gate lifted. `on('populate')` and
`on('ready')` subscribers are already VIP, which is what lets them open transactions
against a database whose own open has not finished.

## Opening a database you did not declare

Leave out `version().stores()` entirely and Nexie reads the schema out of the
database instead — for tooling, migrations, or simply finding out what is in there:

```ts
const db = new Nexie("SomeoneElsesDB");
await db.open();

db.dynamicallyOpened();               // true
db.tables.map((t) => t.name);         // whatever is actually there
db.table("friends").schema.indexes;   // including index shapes
await db.table("friends").toArray();  // and it is a working database
```

Opening a database that does not exist this way gives `NoSuchDatabaseError` rather
than a silently created empty one; pass `{ allowEmptyDB: true }` when creating it is
what you meant. The related statics are `Nexie.exists(name)`,
`Nexie.getDatabaseNames()` and `Nexie.delete(name)`.

## Options

```ts
new Nexie("MyDB", {
    autoOpen: true,                         // open on first use (default)
    allowEmptyDB: false,                    // see above
    chromeTransactionDurability: "relaxed", // faster commits; Chromium reads it
    modifyChunkSize: 200,                   // records per write-back request
    maxConnections: 100,                    // leak-warning threshold
    addons: [],
    indexedDB, IDBKeyRange,                 // inject an implementation
});
```

| | |
|---|---|
| `Nexie.debug = true` | Turns on the engine's own invariant assertion. Cheap; worth having on in development. |
| `Nexie.semVer` | The library version, substituted into the bundle at build time. |
| `Nexie.currentTransaction` | The ambient transaction, or `null`. |
| `Nexie.waitFor(p, ms?)` | Await a foreign promise without losing the transaction. |
| `connectionCount(name)` | How many connections this process holds to a database. |

`maxConnections` is a leak detector rather than a limit: IndexedDB has no connection
cap, and a page that keeps opening databases without closing them does not fail — it
starts blocking its own version upgrades much later, far from the cause. Passing the
threshold logs once per database and never throws.

In a browser, a page frozen into the **bfcache** has its database closed on
`pagehide` and reopened on `pageshow`. A browser may close those connections while
the page sits there and then hand the page back with them apparently intact; closing
deliberately means the state on the way out is one we chose.

## `liveQuery`

A query that re-runs itself whenever its own result could have changed:

```ts
import { liveQuery } from "@aibulat/indexeddb/nexie";

const subscription = liveQuery(() =>
    db.friends.where("age").above(25).toArray(),
).subscribe({
    next: (friends) => render(friends),
    error: (error) => console.error(error),
});

// later
subscription.unsubscribe();
```

The querier runs inside a zone that records the **key ranges** of every read it
makes. Each committed transaction publishes the key ranges it wrote, and a query
re-runs only where the two intersect — so a `liveQuery` over `db.friends.get(7)`
ignores writes to every other friend. Writes through a second connection, and writes
in another tab (via `BroadcastChannel`, feature-detected), arrive through the same
path.

Two things worth knowing:

- The zone rule from transactions applies here too: **await only Nexie promises
  inside a querier**, or reads after that point go unrecorded and the query stops
  re-running for them.
- Invalidation is exact on primary keys, and on secondary indexes for `add`, `put`
  and `delete`. A `put` reads the record it displaces, so a query watching the *old*
  value of a renamed field is woken as well as one watching the new value — that read
  happens only while something is subscribed, so an application with no `liveQuery`
  pays nothing for it. Range deletes are the one case still widened to the whole
  index, since being precise there would mean reading an unbounded number of records
  in order to invalidate them. The approximation is one-directional by design: it
  re-runs a query that need not have re-run, never the reverse.

The returned object also carries the rxjs interop key, so it can be handed to
`from()` and used as an ordinary observable.

## Hooks, events and middleware

```ts
db.friends.hook("creating", (primKey, obj) => {
    obj.createdAt = Date.now();
});

db.on("populate", () => db.friends.bulkAdd(seedData));
db.on("blocked", () => console.warn("another tab is holding the old version"));
```

`db.use()` installs a middleware over **DBCore**, the layer every read and every
write passes through. The library's own CRUD hooks and its observability are built on
it rather than beside it, which is what keeps the extension point exercised:

```ts
db.use({
    stack: "dbcore",
    name: "logger",
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

`mutate`, `get`, `getMany`, `count`, `query` and `openCursor` are all interceptable.

## Errors

```ts
try {
    await db.friends.add({ name: "Alice", email: "taken@example.com" });
} catch (error) {
    if (error instanceof Nexie.ConstraintError) { /* … */ }
}

await db.friends.add(friend).catch("ConstraintError", handleDuplicate);
```

Every error carries the Dexie `name` string, so both forms work, and
`Nexie.errnames.Constraint === "ConstraintError"` holds.

## Differences from Dexie

The API surface is complete. Two things are deliberately absent:

- **The query result cache.** Dexie's `cache: 'immutable' | 'cloned'` holds query
  results in memory and updates them optimistically. It is a performance layer rather
  than a correctness one — `liveQuery` is exact without it — and it carries the
  highest bug density per line in Dexie, so it is not here. The DBCore read path that
  every query now goes through is the seam it would plug into.
- **The `Dexie.Table<T, K>` namespace shim.** Import the types instead:

  ```ts
  import type { Table, Collection } from "@aibulat/indexeddb/nexie";
  ```

And two are shaped differently rather than missing: `Nexie.vip(fn)` is a function
rather than a property, and long-stack support is replaced by `Nexie.debug`, which
asserts the engine's own invariant instead of rewriting stack traces.
