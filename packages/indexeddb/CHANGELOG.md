# 0.1.0 — forked as `@aibulat/indexeddb`

Forked from [`idb`](https://github.com/jakearchibald/idb) at v8.0.3 and moved into the
[`@aibulat/packages`](https://github.com/ngmaibulat/packages) workspace. **The library API is
unchanged** — `openDB`, `deleteDB`, `wrap`, `unwrap` and every type behave exactly as in idb 8.0.3.
The version resets to 0.1.0 because this is a new package name, not a continuation of idb's series.

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
  CI. All 91 tests are preserved.
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
