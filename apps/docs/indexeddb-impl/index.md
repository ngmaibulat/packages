# @aibulat/indexeddb-impl

IndexedDB, implemented in plain JavaScript, in memory. Import it and code that
expects a browser database runs in Node or Bun — no browser, no jsdom, no disk,
and a clean database every process.

It is a fork of [`fake-indexeddb`](https://github.com/dumbmatter/fakeIndexedDB)
by Jeremy Scheff at v6.2.5, with the API unchanged apart from an added
`installGlobals()`. Apache-2.0, and the only package here that is.

## Install

```bash
npm install --save-dev @aibulat/indexeddb-impl
```

## Use

```ts
import "@aibulat/indexeddb-impl/auto";

const request = indexedDB.open("my-db", 1);
```

That installs `indexedDB` and every `IDB*` constructor onto `globalThis`. To
avoid touching globals, take the pieces directly:

```ts
import { indexedDB, IDBKeyRange } from "@aibulat/indexeddb-impl";
```

### Pairing with the wrapper

[`@aibulat/indexeddb`](/indexeddb/) is a promise wrapper over the IndexedDB API;
this is an implementation of the API itself. Together they give you a typed,
promise-based database in a test process:

```ts
import "@aibulat/indexeddb-impl/auto";
import { openDB } from "@aibulat/indexeddb";

const db = await openDB("my-db", 1, {
    upgrade(db) {
        db.createObjectStore("keyval");
    },
});

await db.put("keyval", "hello", "greeting");
```

### `installGlobals()`

The callable form of `/auto`, for when a side-effect import will not do:

```ts
import { installGlobals } from "@aibulat/indexeddb-impl";

installGlobals();
```

A side-effect import runs once per module registry. Under a runner that shares
one process across test files — `bun test` does, `node --test` does not — that
means it cannot reinstall after a test has replaced or deleted the globals.
`installGlobals()` can, and it also accepts a target other than `globalThis`.

## Behaviour

| | |
|---|---|
| Storage | In memory, for the life of the process. Nothing is written to disk and there is nothing to clean up. |
| Scheduling | Tasks are queued with `setImmediate` where it exists, because IndexedDB requires a transaction to go inactive when the event loop turns. A microtask would run database operations too early. |
| Runtimes | Node >= 22.5 and Bun. Built `platform: "neutral"`, so it also runs in a browser or a worker. |
| Conformance | 1,369 of the W3C web-platform-tests IndexedDB tests pass. |

## Gotchas

- **It is not a browser.** 144 conformance tests are recorded as known failures —
  blob storage, some structured-clone corners, a few transaction-scheduling
  edges. The authoritative list is `test/wpt/manifests/` in the repository.
- **State persists across tests in one process.** Databases live in the module,
  so under a shared-process runner one test's database is visible to the next.
  Delete what you create, or use a unique database name per test.
- **Import `/auto` before the code under test.** The globals have to exist before
  anything reads `indexedDB`, which in an ES module means the import has to come
  first — imports are hoisted, so ordering within a file is by import position.
