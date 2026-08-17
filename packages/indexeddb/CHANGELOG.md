# 0.1.6 — a full review of both APIs

A code review of both entries against real Dexie 4.4.4 and against the IndexedDB spec, with
every finding reproduced by running the sources before it was fixed. Nexie takes almost all of
the changes; the low-level API changes in one function and its types. The suite grows from 428
to 485 tests, and both runtimes report the same total.

**`dist/index.js` changed for the first time since 0.1.2** — deliberately, for the
`ignoreConstraints` fix below — so the byte-identity that the 0.1.2, 0.1.3 and 0.1.5 notes claim
now holds against the new digest. That claim is enforced from this release on:
`scripts/postbuild.mjs` runs from tsdown's `onSuccess`, hashes `dist/index.js` against the
committed `low-level-bundle.sha256`, and fails the build on a mismatch, on a `dist/chunks/`
directory (which would mean the two entries had started sharing code), or on a `dist/nexie.js`
whose `Nexie.semVer` was not substituted. `UPDATE_BUNDLE_DIGEST=1 pnpm run build` re-records the
digest when a change to the low-level bundle is intended. The version-string check that used to
live in `test/statics.test.ts` — and went red after every `pnpm bump` until a rebuild — moved
into the same script.

## Nexie — correctness

Bugs that lost data or hung, in the order they mattered:

- **A rejection nobody handled inside a scope now fails the scope.** A fire-and-forget write in
  an `on('populate')` subscriber, a `version().upgrade()` callback or a non-async transaction
  body that hit a `ConstraintError` was silently dropped: the transaction committed everything
  else and `open()` resolved. `NexiePromise` now tracks whether a rejection was observed by the
  end of the tick; inside a `follow()` scope an unobserved one is routed to the scope's sink and
  aborts it with that error, as Dexie does. Outside any scope it is reported like a native one —
  a `PromiseRejectionEvent('unhandledrejection')` where the host has one, otherwise
  `console.error` — through the overridable `NexiePromise.onUnhandled`. Reading `then` marks a
  promise handled, so an `await` a microtask later never trips it.
- **The zone work counter is exact.** A child zone charged its parent once but paid it back on
  every idle crossing, driving the parent negative after one nested scope. Downstream that made
  `_zoneLost` unreachable (a lost scope surfaced as `PrematureCommitError` instead of
  `ForeignAwaitError`) and left `follow()` unable to be woken. `retain`/`release` now charge the
  parent when the child goes idle → busy and pay it back once when it goes idle again.
- **`liveQuery` querier and observer run in the global zone.** They were parented on the zone of
  the transaction whose commit triggered them, so inside `next` `Nexie.currentTransaction` was a
  completed transaction and any table call threw `TransactionInactiveError`. `subscribe()` called
  inside a scope had the same problem. Both run in the root zone now, as do
  `globalEvents.storagemutated` listeners.
- **Two overlapping `Nexie.waitFor()` calls no longer hang the transaction.** The keep-alive spin
  stopped when *either* wait settled, stranding the other in the queue forever. It now counts
  outstanding waits and re-arms until the last one is done.
- **Changing a table's primary key across versions is refused** with
  `UpgradeError('Not yet support for changing primary key (table X: ++id -> uuid). Drop the
  table and recreate it in a new version instead.')`. It was silently accepted, leaving the store
  on the old key path and the schema on the new one.
- **Hooks, `mapToClass` and read hooks survive a later `db.version(n).stores()`.** Re-parsing the
  schema dropped them, so `hook('creating')` registered before a version declaration never fired.
- **`distinct()` is reusable.** Its dedupe set was built once at clone time; a second `toArray()`
  returned `[]` and `first()` followed by `toArray()` dropped a record.
- **`modify` honours `delete ref.value`** — the documented idiom raised `ModifyError`; only
  `ref.value = null` deleted.
- **`NexiePromise.any([])` rejects** with an `AggregateError` instead of never settling.
- **`where({...})` on an unindexed field compares by key equality**, so `Date`, array and binary
  criteria match. They were compared with `===`.
- The bfcache `pagehide`/`pageshow` listeners are removed when the last connection closes;
  every `new Nexie()` — including `Nexie.delete(name)` — leaked a pair.

## Nexie — Dexie parity

- `on('ready')`: a subscriber added when the database is already open fires at once; non-sticky
  subscribers fire once rather than on every reopen; the `bSticky` argument is honoured.
- Nested `'rw'` inside `'r'` is a `SubTransactionError` (it was `ReadOnlyError`; the name is
  API), as is a nested scope naming a table the parent did not include. `'?'` modes treat an
  inactive parent as absent. The four `!`/`?` modes have tests now.
- `Transaction` has `on('complete' | 'error' | 'abort')`.
- Added `EntityTable`, `InsertType`, `IDType`, `NonInsertProps`, the `TInsertType` parameter on
  `Table`, `Table.get(criteria)` and `Table.defineClass()`.
- `db.delete()` fires `on('blocked')`.
- `until()` sees mapped values, like `filter()`.
- A rejection adopted from a foreign thenable goes through the rejection mapper, so
  `instanceof Nexie.ConstraintError` holds for it.
- `isValidKey` rejects `NaN` and invalid `Date`s; `add()`/`remove()` modifiers follow Dexie
  exactly (arrays are concatenated/filtered and sorted, numbers are coerced, anything else is a
  `TypeError`). `add('x')` on an array field is no longer accepted — pass `add(['x'])`.

## Low-level API

- **`ignoreConstraints` removes its listener once the request settles**, and throws a `TypeError`
  when called after the request has already failed — before, it silently reported `undefined` for
  a write that had already aborted the transaction. This is the change to `dist/index.js`.
- `getAllRecords` is omitted from the wrapped store and index types, ahead of `lib.dom`
  declaring it (Chrome 141 ships it); without the `Omit` the package would stop compiling for
  consumers the day it lands.
- `"sideEffects": true` is declared in `package.json` rather than only implied by a comment.
- New tests: the exported type surface (`test/types.test.ts`), `durability`, `terminated`,
  `preventDefault()` on its own, and the `ignoreConstraints` rules above.
- README: `tx.done`'s synthetic `AbortError` message is documented, `ignoreConstraints` has its
  two rules spelled out, and the TypeScript section shows the cross-file schema types.

# 0.1.5 — the two APIs are documented as two APIs

No code changes: `dist/index.js` and `dist/nexie.js` are byte-identical to 0.1.4.

This package has shipped two independent APIs since 0.1.2 — the low-level idb
superset at `.` and Nexie at `./nexie` — but the documentation still read as one API
with a second bolted onto the end. The README is now explicitly in two parts, with a
comparison table above the table of contents:

|                  | Part 1 — low-level     | Part 2 — Nexie, high-level  |
| ---------------- | ---------------------- | --------------------------- |
| Import           | `@aibulat/indexeddb`   | `@aibulat/indexeddb/nexie`  |
| Shape            | `openDB()`, stores, cursors | `new Nexie()`, schema DSL, query builder |
| Size             | ~1.9 kB brotli'd       | ~124 kB unminified          |
| Coming from      | `idb`                  | `dexie`                     |

`Examples` and `TypeScript` were top-level sections sitting *between* the two APIs
while belonging entirely to the low-level one; they are subsections of Part 1 now.
Part 2 gained the `Schema`, `Querying` and `Errors` sections it had been missing, and
`Extending it` became `Hooks, events and middleware`.

The `description` and `keywords` in `package.json` described only the low-level API,
which is what npm shows above the README; both now name Nexie.

The documentation site splits the same way, into an overview that chooses between the
two, a low-level page and the Nexie page.

# 0.1.4 — a zone attribution bug, and a hang it caused

**Fixes a hang in 0.1.2 and 0.1.3.** A fire-and-forget transaction scope — one whose
body starts operations without returning or awaiting them — never resolved if the
database happened to be **already open**:

```ts
await db.open();
await db.transaction('rw', db.friends, () => {
    db.friends.add({ name: 'a' });   // started, not awaited
});                                  // never resolves
```

The same root cause silently disabled `ForeignAwaitError` under the same condition,
so a foreign `await` reported the older, vaguer `PrematureCommitError` instead.

The cause is one line in the promise engine. `p.then(cb)` registers the continuation
in the zone captured when `then` was read, but the *derived* promise was created in
whatever zone happened to be ambient when the continuation was registered. For an
`await`, that registration runs a microtask later from inside
`PromiseResolveThenableJob`, where the ambient zone is the echo front — some other
scope's zone. So the caller's outstanding work was attributed to that scope, and
`follow()` waited for a promise that could only settle once the caller was finished.
The derived promise is now created in the zone it belongs to.

It reproduced only with an already-open database because that is the path where
`db.transaction()` reaches the scope synchronously; opening lazily inserts a
microtask that moved the echo front out of the way. The suite opened lazily
everywhere, which is why it went unseen — there are now tests for both shapes with
the database explicitly opened first.

Also: `liveQuery` invalidation distinguishes "read the displaced records and found
none" from "did not read them". A `put` that inserts rather than replaces displaces
nothing, which is exact, and no longer widens to the whole index.

# 0.1.3 — Nexie completes its API surface

The `.` entry is untouched again: `dist/index.js` is byte-identical, verified by
md5 on every build.

## The transaction zone now reports what it used to lose

Awaiting a foreign promise inside `db.transaction()` kills the zone — that is a
property of `await` on a native promise, not something a library can hide. Until now
the next table call quietly opened a **second** transaction and the failure surfaced
later, if at all, as `PrematureCommitError`. It now rejects with **`ForeignAwaitError`**
naming the fix, at the operation that caused it.

The check is narrow rather than heuristic. It fires only when the scope's own zone is
quiescent — every promise this engine created inside it has settled while the body has
not finished, which is precisely the state of being suspended on something we cannot
see — and only for a table that scope covers. Unrelated concurrent work is not flagged
for running at the same time as a transaction; there is a test that says so.

`Nexie.ignoreTransaction(fn)` runs work deliberately outside the ambient transaction
(and opts out of the diagnosis), and `Nexie.vip(fn)` lifts the open gate.

## Two bugs found on the way

- **`NexiePromise.follow` clobbered the zone's finalizer.** `newZone` installs one
  that decrements the parent zone's work counter; `follow` replaced it outright, so a
  follow nested inside another follow stranded its parent above zero forever. The
  symptom was a database that opened and never resolved, and it was reachable from
  ordinary code: an `on('populate')` subscriber that called `db.transaction(...)`.
- **`on('populate')` and `version().upgrade()` did not carry their transaction into
  the callback's zone.** `trans.table('items')` worked, `db.items` deadlocked. Both
  now pass the transaction down, so either spelling does the same thing.

## Opening a database whose schema you never declared

Leave `version().stores()` out and Nexie reads the schema from the database itself —
stores, primary keys, index shapes, `multiEntry` and compound keyPaths included:

```ts
const db = new Nexie('SomeoneElsesDB');
await db.open();
db.dynamicallyOpened();               // true
await db.table('friends').toArray();  // a working database, not a description
```

Opening one that does not exist is a `NoSuchDatabaseError` rather than a silently
created empty database; `{ allowEmptyDB: true }` opts into creating it. **This changes
an existing behaviour:** `open()` with no declared version used to reject with
`SchemaError` unconditionally.

## `liveQuery` invalidation is now exact for `put` and `delete`

A `put` reads the record it displaces, so a query on `where('name').equals('Alice')`
is woken when Alice is renamed — the new record says nothing about the old value, and
before this the whole index had to be invalidated to be safe. The read happens only
while something is subscribed, so an application with no `liveQuery` pays nothing.
Range deletes remain widened to the whole index, deliberately: being precise there
means reading an unbounded number of records in order to invalidate them.

## Additions

- `Nexie.exists(name)`, `Nexie.getDatabaseNames()`, `Nexie.delete(name)`.
- `Nexie.debug` — asserts the engine's own invariant, that our thenable never fulfils
  with another thenable. Off by default; worth having on in development.
- `Nexie.semVer`, substituted into the bundle at build time rather than hardcoded, so
  it cannot drift from the manifest. Running the sources directly it reads
  `0.0.0-src`, which is honest rather than plausible.
- Options: `allowEmptyDB`, `chromeTransactionDurability`, `modifyChunkSize`,
  `maxConnections`.
- `modifyChunkSize` (default 200) splits `Collection.modify`'s write-back into several
  mutations instead of one enormous request. The walk still collects first — writing
  through the cursor would mutate the index being iterated.
- `maxConnections` (default 100) is a leak detector, not a limit: it warns once per
  database and never throws. Exported alongside `connectionCount(name)`.
- **bfcache support.** A page frozen into the back/forward cache has its database
  closed on `pagehide` and reopened on `pageshow`, because a browser may close those
  connections while the page sits there and hand it back looking intact. Guarded on
  `document`, and tested against a stand-in page rather than left to rot.

## Still not here, on purpose

The query result cache (`cache: 'immutable' | 'cloned'`) is a performance layer, not a
correctness one, and carries the highest bug density per line in Dexie. The DBCore
read path is the seam it would plug into if that changes.

# 0.1.2 — Nexie, a second API at `@aibulat/indexeddb/nexie`

The package now offers **two API sets**. The `.` entry is unchanged in every respect — same
exports, same behaviour, and `dist/index.js` is byte-for-byte what it was before this release,
which is verified by md5 on every build rather than assumed. The ~1.9 kB brotli'd figure still
describes it.

The new one is `@aibulat/indexeddb/nexie`: **Nexie**, a re-implementation of the Dexie 4 API for
callers who would rather write `db.friends.where('age').above(25).toArray()` than open a
transaction and drive a cursor. It is a clean-room implementation — Dexie is Apache-2.0, this
package stays MIT, and no Dexie code was copied — and migration from Dexie is a rename:
`Dexie` → `Nexie`. Error `name` strings, the schema DSL, the `'rw!'`/`'r?'` modes and `':id'` are
unchanged, because code matches on those.

The two graphs are deliberately disjoint: nothing under `src/nexie/` imports the low-level entry,
so the bundler emits no shared chunk and neither entry can drag the other in. `dist/nexie.js` is
about 124 kB unminified.

What is in it: schema versions and upgrades, `Table` CRUD and bulk operations, the full
`WhereClause` (all 18 operators) and `Collection`, virtual indexes (a `[a+b+c]` index answers
queries on `[a+b]` and on `a`), transactions with automatic joining across `await`, CRUD hooks,
`db.on(…)` events, `db.use()` middleware over DBCore, `mapToClass`/`Entity`, addons — and, new in
this release, **`liveQuery`**.

### `liveQuery`

```ts
import { liveQuery } from '@aibulat/indexeddb/nexie';

const sub = liveQuery(() => db.friends.where('age').above(25).toArray())
    .subscribe((friends) => render(friends));
```

A querier runs inside a zone that records the key ranges of every read it makes; each committed
transaction publishes the key ranges it wrote; a query re-runs only where the two intersect. So a
`liveQuery` over `db.friends.get(7)` is not woken by a write to friend 8. Notifications cross
connections in the same context and, where `BroadcastChannel` exists, other tabs — feature-detected,
because this package also runs under Node and Bun.

Invalidation is exact on primary keys and on secondary indexes for `add`; `put`, `delete` and range
deletes widen to the whole index, since knowing which index entries those *remove* would mean
reading the old record first. The approximation only ever runs a query that need not have run.

### Under the hood

- **Every read now goes through DBCore**, cursor walks included, alongside every write. That is
  what makes one middleware sufficient to observe a query, and it is also why `db.use()` can now
  intercept reads: `query`, `openCursor` and an index-aware `count` joined `mutate`, `get`,
  `getMany` and `count` in the interface.
- `Collection.delete()`'s range fast path, `Table.upsert()` and `Table.bulkUpdate()` used to write
  straight to IndexedDB, so CRUD hooks never saw them. They go through `mutate` now, which fixes
  that as a side effect.
- `RangeSet`, `mergeRanges` and `rangesOverlap` are exported: a sorted disjoint set of inclusive
  key ranges, which is what the observability machinery compares.

### Testing

The suite is 388 tests and must report identical totals under `node --test` and `bun test`; CI runs
both. The zone that carries a transaction across `await` rests on the normative ordering of `Await`
and promise-resolve-thenable jobs, and Bun is JSC where Node is V8 — a divergence there would be a
design bug, not a runtime quirk.

# 0.1.1 — bug fixes and additions upstream never shipped

This is where the fork stops being a mirror of idb 8.0.3 and becomes an **API-compatible
superset**. Everything idb does still works the same way; the changes below either fix behaviour
that was already wrong or add surface that upstream accepted in principle and never merged.
Upstream has not pushed a commit since 2025-05-07.

Nothing here is breaking for a consumer of 0.1.0, with one exception noted under *Types*.

### Fixes

- **`NaN` no longer throws.** `wrap()` cached its result whenever `newValue !== value`, which is
  true for `NaN`, so a primitive reached `WeakMap.set` and threw
  `TypeError: Invalid value used as weak map key`. The throw happened inside the request's success
  handler, which aborted the transaction — reading a stored `NaN` took the whole thing down. The
  guard is `Object.is` now. (upstream
  [#315](https://github.com/jakearchibald/idb/issues/315))
- **`tx.done` rejects with the real error.** A request's `error` event bubbles to the transaction
  *before* the transaction is aborted with it, so `tx.error` is still `null` while it dispatches and
  the only reachable cause is `event.target.error`. idb read `tx.error`, found nothing, and rejected
  with a fabricated, stackless, message-less `DOMException('AbortError')` — discarding the
  `ConstraintError` or `QuotaExceededError` that actually happened. You now get the real error, and
  an `AbortError` only when there genuinely was no other cause. (upstream
  [#166](https://github.com/jakearchibald/idb/issues/166),
  [#326](https://github.com/jakearchibald/idb/issues/326),
  [#334](https://github.com/jakearchibald/idb/issues/334); improves on the unmerged
  [PR #338](https://github.com/jakearchibald/idb/pull/338), which fixed the error but kept the
  wrong trigger)
- **`tx.done` no longer rejects for a transaction that committed.** An error that is
  `preventDefault()`ed does not abort the transaction, but idb rejected on the `error` event
  regardless, reporting failure for a transaction whose data was safely written. `done` now settles
  on `complete`/`abort`, which is what those events mean. Not filed upstream.
- **No more unhandled rejections from `tx.done`.** The promise is created eagerly when the
  transaction is wrapped, so a failure before the caller reached `await tx.done` — or a caller that
  never awaited it, which is normal for a read — surfaced as an unhandled rejection. Reported on
  iOS, where WebKit aborts transactions when the app is backgrounded. A no-op handler is attached
  to the cached promise; `await tx.done` is unaffected. (upstream
  [#320](https://github.com/jakearchibald/idb/issues/320))

### Additions

- **`getAll`, `getAllKeys` and `getAllRecords` take an options object**, with `query`, `count` and
  `direction` — the only way to read records in reverse. On stores, indexes, and the `db.*`
  shortcuts. `getAllRecords` returns `{ key, primaryKey, value }`. Needs browser support for
  `getAllRecords` (Chrome/Edge 141+). (upstream
  [#349](https://github.com/jakearchibald/idb/issues/349), unmerged
  [PR #350](https://github.com/jakearchibald/idb/pull/350))
- **`iterateKeys()`** on stores and indexes — `iterate()`'s partner over `openKeyCursor`, for
  iterating keys without reading values. (upstream
  [#112](https://github.com/jakearchibald/idb/issues/112))
- **`ignoreConstraints(operation)`** — lets a duplicate key be skipped without aborting the whole
  transaction, resolving `undefined` for the skipped record. The semantics upstream specified but
  never implemented, and only possible once `tx.done` stopped rejecting on a handled error.
  (upstream [#256](https://github.com/jakearchibald/idb/issues/256))
- **`using db = await openDB(…)`** closes the connection at the end of the scope, via
  `Symbol.dispose`. (upstream [#300](https://github.com/jakearchibald/idb/issues/300))

### Types

- Exported `DBSchemaValue`, `IndexKeys` and `IDBTransactionOptions`, and hoisted the `openDB`/
  `deleteDB` callbacks into named types (`OpenDBUpgradeCallback`, `OpenDBBlockedCallback`,
  `OpenDBBlockingCallback`, `OpenDBTerminatedCallback`, `DeleteDBBlockedCallback`), so a schema or
  a migration can be assembled across files. (upstream
  [#237](https://github.com/jakearchibald/idb/issues/237),
  [#314](https://github.com/jakearchibald/idb/issues/314))
- `transaction()` is one generic rather than two overloads, so an editor autocompletes store-name
  literals for the array form. **The one visible change:**
  `Parameters<typeof db.transaction>[0]` is now `StoreName | ArrayLike<StoreName>` rather than only
  `ArrayLike<StoreName>`. Every call that compiled before still compiles. (unmerged
  [PR #345](https://github.com/jakearchibald/idb/pull/345))
- `Symbol.dispose` is declared through a key that collapses to `never` when the consumer's `lib`
  lacks `ESNext.Disposable`, so the member disappears instead of failing to compile. This is
  deliberately not the mistake upstream made with `WeakKey` in
  [#331](https://github.com/jakearchibald/idb/issues/331).

Considered and deliberately left out: PR #333 (wrapping errors in `Error` — invalid as submitted,
breaking, and the real benefit is delivered above), PR #291 / #275 (union narrowing — breaking to
the exported type surface), PR #252 / #150 (auto-increment key typing — ships a TODO in a public
`.d.ts`), and #346 / #319 / #230 (the `never` collapse for union store names — one real root cause,
but non-trivial variance work).

# 0.1.0 — forked as `@aibulat/indexeddb`

Forked from [`idb`](https://github.com/jakearchibald/idb) at v8.0.3 and moved into the
[`@aibulat/packages`](https://github.com/ngmaibulat/packages) workspace. The library API is
unchanged at this version — `openDB`, `deleteDB`, `wrap`, `unwrap` and every type behave exactly as
in idb 8.0.3. (0.1.1 above is where that stops being true, in an additive direction.) The version
resets to 0.1.0 because this is a new package name, not a continuation of idb's series.

Packaging changes:

- **ESM only.** The CommonJS (`build/index.cjs`) and minified UMD (`build/umd.js`) builds are gone,
  along with the `idb` browser global. Import it as a module, or assign your own global.
- Output moved from `build/` to `dist/`, built with `tsdown` instead of rollup. `publint` and
  `arethetypeswrong` now run as part of the build.
- Type declarations are emitted as a single bundled `dist/index.d.ts` rather than one `.d.ts` per
  source module. Source maps and declaration maps are now published.
- The `exports` map no longer exposes `./build/*`, so deep imports into build output are gone.
- Dropped the dead `with-*` entry in `files` — a leftover from 7.x, whose separate async-iterators
  build 8.x had already removed.
- Licensed MIT, retaining the upstream ISC copyright notice. See `LICENSE`.

Development changes (no effect on consumers):

- Tests moved from mocha-in-a-real-browser to `node:test` against `fake-indexeddb`, so they run in
  CI. All 91 tests are preserved. (0.1.1 adds 26 more.)
- Fixed a latent type assertion in the suite: `createIndex` propagates `TxStores` as
  `ArrayLike<StoreNames<DBTypes>>`, not `[StoreName]`. Upstream asserted the latter and only passed
  because its test project resolved `../src` through the emitted `.d.ts` rather than the source.
- Removed the rollup/terser brotli size-report script. The published bundle is unminified, so the
  README's old "~1.19kB brotli'd" figure no longer applied; it is now ~1.9 kB.

# Breaking changes in 8.x

- Finally dropped support for old EdgeHTML engine.
- Dropped support for browsers that don't support [`cursor.request`](https://caniuse.com/mdn-api_idbcursor_request).
- Removed separate async iterators build. It's now one build with async iterator support.

# Breaking changes in 7.x

- No longer committing `build` to GitHub.
- Renamed files in dist.
- Added conditional exports.
- iife build is now a umd.

# Breaking changes in 6.x

Some TypeScript definitions changed so write-methods are missing from 'readonly' transactions. This might be backwards-incompatible with code that performs a lot of type wrangling.

# Breaking changes in 5.x

I moved some files around, so I bumped the major version for safety.

# Changes in 4.x

## Breaking changes

### Opening a database

```js
// Old 3.x way
import { openDb } from 'idb';

openDb('db-name', 1, (upgradeDb) => {
  console.log(upgradeDb.oldVersion);
  console.log(upgradeDb.transaction);
});
```

```js
// New 4.x way
import { openDB } from 'idb';

openDB('db-name', 1, {
  upgrade(db, oldVersion, newVersion, transaction) {
    console.log(oldVersion);
    console.log(transaction);
  },
});
```

- `openDb` and `deleteDb` were renamed `openDB` and `deleteDB` to be more consistent with DOM naming.
- The signature of `openDB` changed. The third parameter used to be the upgrade callback, it's now an option object which can include an `upgrade` method.
- There's no `UpgradeDB` anymore. You get the same database `openDB` resolves with. Versions numbers and the upgrade transaction are included as additional parameters.

### Promises & throwing

The library turns all `IDBRequest` objects into promises, but it doesn't know in advance which methods may return promises.

As a result, methods such as `store.put` may throw instead of returning a promise.

If you're using async functions, there isn't a difference.

### Other breaking changes

- `iterateCursor` and `iterateKeyCursor` have been removed. These existed to work around browsers microtask issues which have since been fixed. Async iterators provide similar functionality.
- All pseudo-private properties (those beginning with an underscore) are gone. Use `unwrap()` to get access to bare IDB objects.
- `transaction.complete` was renamed to `transaction.done` to be shorter and more consistent with the DOM.
- `getAll` is no longer polyfilled on indexes and stores.
- The library no longer officially supports IE11.

## New stuff

- The library now uses proxies, so objects will include everything from their plain-IDB equivalents.
- TypeScript support has massively improved, including the ability to provide types for your database.
- Optional support for async iterators, which makes handling cursors much easier.
- Database objects now have shortcuts for single actions (like `get`, `put`, `add`, `getAll` etc etc).
- For transactions that cover a single store `transaction.store` is a reference to that store.
- `openDB` lets you add callbacks for when your database is blocking another connection, or when you're blocked by another connection.

# Changes in 3.x

The library became a module.

```js
// Old 2.x way:
import idb from 'idb';
idb.open(…);
idb.delete(…);

// 3.x way:
import { openDb, deleteDb } from 'idb';
openDb(…);
deleteDb(…);
```
