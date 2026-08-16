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
