# @aibulat/indexeddb-impl

A pure JavaScript, in-memory implementation of IndexedDB. Import it and code
that expects a browser database works in Node or Bun, with no browser, no
jsdom, and no disk.

> A fork of [`fake-indexeddb`](https://github.com/dumbmatter/fakeIndexedDB) by
> Jeremy Scheff, forked at v6.2.5. The API is unchanged. This fork is ESM only,
> builds with tsdown, and — the point of the exercise — runs **every** one of its
> test suites without a browser, under both `node --test` and `bun test`. See
> [CHANGELOG.md](CHANGELOG.md) for what changed and [NOTICE](NOTICE) for
> attribution.

## Install

```bash
npm install --save-dev @aibulat/indexeddb-impl
```

## Use

The usual way is the side-effect import, which installs `indexedDB` and the
`IDB*` constructors onto `globalThis`:

```ts
import "@aibulat/indexeddb-impl/auto";

const request = indexedDB.open("my-db", 1);
```

Or take the pieces directly, without touching globals:

```ts
import { indexedDB, IDBKeyRange } from "@aibulat/indexeddb-impl";
```

`installGlobals()` is the callable form of `/auto`. Reach for it when a side
effect import will not do — a runner that shares one process across test files
only executes the import once, so it cannot reinstall after a test has tampered
with the globals:

```ts
import { installGlobals } from "@aibulat/indexeddb-impl";

installGlobals(); // or installGlobals(someOtherGlobalObject)
```

Each database lives in memory for the life of the process. There is no
persistence and nothing to clean up between runs.

## With `@aibulat/indexeddb`

The sibling [`@aibulat/indexeddb`](../indexeddb) is a promise wrapper over the
IndexedDB API; this package is an implementation of the API itself. They compose:

```ts
import "@aibulat/indexeddb-impl/auto";
import { openDB } from "@aibulat/indexeddb";

const db = await openDB("my-db", 1, {
    upgrade(db) {
        db.createObjectStore("keyval");
    },
});
```

## Runtimes

Node >= 26 and Bun >= 1.3 (both declared in `engines`). It is written against the DOM lib rather than Node's, so
it also runs in a browser or a worker — which is mostly useful for testing a
page against a database that resets on reload.

## Tests

Four suites, 1,793 tests, all headless and all hermetic:

| Suite                | What it is                                                                                                                                                     |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `test/wpt/`          | The W3C [web-platform-tests](https://github.com/web-platform-tests/wpt) IndexedDB conformance corpus, 229 files (19 of them support files that are skipped), each forked into its own process. 1,536 pass. |
| `test/qunit/`        | The indexedDBmock corpus, 105 tests. Upstream could only run this in a real browser.                                                                           |
| `test/unit/`         | The project's own unit tests, 124 of them — including `conformance-fixes.test.ts`, one test per spec fix that the corpus did not cover.                        |
| `test/smoke.test.ts` | The public export surface, plus a Dexie round-trip.                                                                                                            |

```bash
pnpm run test        # everything, under node:test
pnpm run test:bun    # everything, under bun test
pnpm run test:wpt    # just the conformance corpus
pnpm run typecheck   # both the src and test projects
pnpm run build       # tsdown -> dist/, plus publint and attw
```

Both runners report the same totals. Expected conformance results live in
`test/wpt/manifests/*.toml`: a test known to fail is recorded there rather than
deleted, so fixing one shows up as an unexpected pass rather than silence.
Regenerate them with `GENERATE_MANIFESTS=1 pnpm run test:wpt`.

### Known gaps

Three conformance tests are recorded as expected failures, two as unstable and
one as an expected timeout, down from 144 failures at the fork. Every idlharness
assertion passes. What remains is event-loop emulation that Node and Bun cannot
express, plus two load-dependent races.

`test/wpt/manifests/` is the authoritative record, and
[CONFORMANCE.md](CONFORMANCE.md) breaks each one down.
