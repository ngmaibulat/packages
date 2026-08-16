# 0.1.0 — forked as `@aibulat/indexeddb-impl`

Forked from [`fake-indexeddb`](https://github.com/dumbmatter/fakeIndexedDB) at
v6.2.5 and moved into the [`@aibulat/packages`](https://github.com/ngmaibulat/packages)
workspace, with no git history carried over. **The library API is unchanged** —
the same `indexedDB` factory, the same `IDB*` constructors, the same
`/auto` side-effect entry — plus one addition, `installGlobals()`.

The version resets to 0.1.0 because this is a new package name, not a
continuation of fake-indexeddb's series. Licensed Apache-2.0, retaining the
upstream copyright; see [NOTICE](NOTICE).

## Every test suite now runs without a browser

This was the reason for the fork. Upstream's `test` script chained six runners —
eslint, jest, two loose node scripts, mocha, a W3C runner, and QUnit under
**PhantomJS**, which has been unmaintained since 2018. In practice the QUnit
suite, ~5,600 lines and 105 tests, no longer ran anywhere.

There is now one runner, `node:test`, over four suites and 1,748 tests, and the
same suites also pass under `bun test` with identical totals.

- **The QUnit corpus runs headless.** `test/harness/qunit.ts` implements the
  slice of QUnit 1.x the corpus uses on top of `node:test`. The corpus itself is
  unmodified: its nine files were `<script>` tags sharing one global scope, so
  they are concatenated and evaluated as a single function body, which
  reproduces that scope without leaking onto `globalThis`. It is evaluated in the
  main realm rather than a `vm` context on purpose — a `vm` has its own
  intrinsics, and the fixtures build keys from `new Date()`, which the
  implementation key-encodes behind an `instanceof Date` check that is false
  across realms.
- **The mocha suite runs on `node:test`.** `test/harness/mocha.ts` adapts the
  one incompatibility: mocha passes `done` as the first argument, `node:test`
  passes its own context first. All 96 tests are preserved verbatim.
- **The W3C conformance corpus is unchanged in content** — 222 files, 1,369
  passing tests — but its runner was restructured; see below.
- **jest is gone.** Its only test asserted that `auto` works from jest's
  `setupFiles`, which tested jest rather than this package. The loose
  `test/test.js` and `test/dexie.js` scripts are `node:test` cases now, in
  `test/smoke.test.ts`.

## Runtime support

Node >= 22.5 and Bun. Four things had to change for Bun, and each was a real
latent problem rather than a Bun quirk:

- **The WPT runner nested `test()` inside `test()`**, which `node:test` allows
  and Bun does not ([oven-sh/bun#5090](https://github.com/oven-sh/bun/issues/5090)).
  Each file's child process is now awaited _before_ its assertions are
  registered, so they become siblings inside a `describe()`. Verdicts are
  computed synchronously as part of that, which also fixes manifest
  regeneration: it used to depend on test callbacks having already run.
- **A crashing child aborted the whole run.** `runTestFile` rejected out of the
  top-level loop, so every file after the failure was silently never
  registered — the run reported one error and a much smaller test count, which
  reads like "fewer tests exist" rather than "the suite stopped early". One bad
  file is now one failing test.
- **`wpt-env.js` assigned to `Blob`'s readonly accessors.** Its `File` polyfill
  set `this.name` and `this.lastModified`; Bun's `Blob.prototype` declares both
  as getter-only, and assigning through an inherited accessor throws in a class
  body. `Object.defineProperty` works on both.
- **`webidl2.js` never published its global under Bun.** The vendored UMD header
  checks for CJS first; Node's ESM loader leaves `module` undefined so it fell
  through to `globalThis.WebIDL2`, while Bun treats the `.js` as CJS and took the
  first branch, leaving `idlharness` to die on an undefined `WebIDL2`. The
  wrapper now always publishes the global.

## Conformance

Forked at 1,369 passing W3C web-platform-tests with 144 recorded failures, 4
expected timeouts and 11 unstable tests; now **1,536 passing with 3 failures, 1
timeout and 2 unstable**, and **every one of the 207 idlharness assertions
passes**. Nothing was added to the expectation manifests, and the corpus was
re-synced from upstream wpt along the way. See
[CONFORMANCE.md](CONFORMANCE.md) for the remainder and why each one stays.

### Behaviour

- **Transactions go inactive.** One was created `"active"` and never left that
  state, so a request placed from a later task -- which a browser rejects with
  `TransactionInactiveError` -- quietly succeeded, and `commit()` never threw.
  It now deactivates after the creating task and after each success/error
  dispatch, using a bounded microtask drain -- the only scheduling approach that
  lands after a caller's `await` chain but before their next task on both
  runtimes. That one change also settled eleven tests that had been recorded as
  flaky since the fork.
- **`objectStore()` threw `InvalidStateError` for a merely inactive
  transaction.** That is the error for a _finished_ one; an inactive
  transaction still returns a store handle, and the request against it is what
  throws.
- **`db.transaction(store, "versionchange")` throws `TypeError`** instead of
  handing back an upgrade transaction, ordered so `NotFoundError` still wins for
  a missing store.
- **`addEventListener` honours `once` and `signal`.** Both were accepted and
  silently ignored: a `{ once: true }` listener fired once per record over a
  cursor, and an aborted `AbortSignal` removed nothing. No W3C test covers
  either, which is why it went unnoticed.

### WebIDL

`src/lib/webidl.ts` gives each class the shape its IDL declares. Beyond the
conformance count, four of these were observable:

- **Feature detection answered wrongly.** 37 attributes were own instance
  properties, so `'durability' in IDBTransaction.prototype` was false.
- **Every instance carried all eight event-handler names**, so an `IDBDatabase`
  answered true to `'onupgradeneeded' in db`.
- **Ten readonly attributes had setters**, eight of them no-op `/* for babel */`
  stubs, so `cursor.key = x` silently appeared to work.
- **`instanceof EventTarget` was false.** `IDBRequest`, `IDBDatabase` and
  `IDBTransaction` now sit directly under `EventTarget` and carry its internal
  slots.
- **`globalThis.indexedDB` was assignable.** It is a readonly attribute in the
  IDL, so it is now an enumerable accessor with no setter -- assignment does
  nothing, exactly as in a browser. It stays configurable, so
  `Object.defineProperty` or another `installGlobals()` call still substitutes
  it.

Also: interfaces are no longer constructible (`new IDBCursor()` throws, as the
IDL requires), interface objects report their IDL `name` and `length`, members
are enumerable and brand-checked, operations report the IDL's required-argument
count, and `databases()` rejects rather than throws on a failed brand check.

### Corpus and harness

- Re-synced from upstream wpt (August 2026, `7327d61f88`), adding 17 tests, all
  passing.
- `assert_readonly` assigned and expected the assignment to be discarded, which
  holds for upstream's classic script but not in an ES module -- so once the
  attributes became genuinely readonly it reported correct behaviour as failure.
- `promise_rejects_js` was missing from the trimmed harness, and `convert.js`
  resolved its paths from the working directory.

## Packaging

- **ESM only.** The CommonJS build under `build/cjs` is gone, along with the
  `./lib/*` subpath exports that pointed into it. Two entries remain: `.` and
  `./auto`.
- Output moved from `build/` to `dist/`, built with **tsdown** rather than a
  Babel CLI invoked twice. `publint` and `attw` run as part of the build.
- **`auto` is a normal entry point.** Upstream hand-wrote `auto/index.mjs` and a
  CJS twin, both naming files inside `build/`; it is `src/auto.ts` now, with
  nothing to keep in step by hand.
- The two entries share a chunk, which is what makes `import "…/auto"` and
  `import { IDBKeyRange } from "…"` yield the _same_ classes. If they were ever
  inlined per-entry instead, every `instanceof` in a consumer's suite would
  start failing; `test/unit/auto.test.ts` asserts the identity against the built
  output, because nothing else would catch it.
- **The public types stay hand-written.** `types.d.ts` deliberately describes the
  DOM API (`typeof IDBFactory` and friends) rather than the `FDB*` classes that
  implement it, which is what makes the package a drop-in for real IndexedDB.
  Generating declarations from the sources would leak the implementation shape,
  so `dts` is off.

## Source changes

- Relative imports name `.ts` rather than the emitted `.js` sibling, matching
  `@aibulat/indexeddb` next door. This is what lets both `node --test` and
  `bun test` run the sources directly, with no build step and no
  `test/register.ts`.
- **`installGlobals()` is new**, exported from the root and from `/auto`'s
  implementation. `/auto` is a side-effect import, so it only ever runs once per
  module registry; a runner that shares a process across test files cannot use
  it to reinstall after a test has cleared the globals. That is not theoretical
  — it is exactly how `auto.test.ts` failed under `bun test`.
- Three latent typing problems surfaced under the workspace's stricter settings
  and were fixed rather than suppressed: nine members needed `override`
  (`noImplicitOverride`), `Set.prototype.intersection` was called through an
  `in` check that left it `unknown`, and `globalThis.setImmediate` was read
  without Node's types present. `useUnknownInCatchVariables` stays off, as
  upstream had it: the implementation reads `.name` off caught DOMExceptions in
  a dozen places.
- The WPT runner resolved its corpus from `process.cwd()`, so it only ran from
  the package root. It resolves from `import.meta.dirname` now.

## Not carried over

- The eslint config, husky hooks and `lint-staged`, per the workspace's
  conventions. Prettier remains, at the upstream tab width.
- `bin/update-browser-wpt-results.js` and the `version` script that ran it, which
  scraped browser results into the README.
- `src/test/indexedDBmock/index.html`, the QUnit browser bundle and
  `node-qunit-phantomjs`.
