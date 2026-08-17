# Unreleased — spec conformance at the edges, and two quadratic paths

A code review against the IndexedDB spec. None of these moved a conformance
expectation — the corpus was already green where it could be — but each is a
place where the implementation and a browser disagreed on an error, an order,
or a cost. `test/unit/conformance-fixes.test.ts` carries one test per item, and
the totals are 1,793 tests, identical under `node --test` and `bun test`.

## Behaviour

- **An upgrade transaction is inactive by the next task, deterministically.**
  After the `upgradeneeded` dispatch it went inactive through a task
  (`setImmediate`), which Node runs *after* the timers phase — so a
  `setTimeout(fn, 0)` queued inside the handler could still find it active once
  a millisecond had passed by the time the handler returned. That is the same
  race `lib/scheduling.ts` documents for `setImmediate`, and the reason every
  other deactivation already used the bounded microtask drain; the upgrade path
  was the one site left on the task. Load-dependent: WPT
  `upgrade-transaction-deactivation-timing` ("Upgrade transactions are
  deactivated before next task") failed 2 in 5 full Node runs and 8 in 72 when
  the file was forked 24-wide, never standalone, and never under Bun — and
  because the file's keep-alive spinner is only released after the assertion, a
  failure also timed the file out, so the suite went red twice. It uses
  `queueAfterCheckpoint` now; the regression test burns the millisecond inside
  the handler, so it fails on the old scheduling every time rather than under
  load.

- **`SyntaxError` carries its own message.** The default was the `VersionError`
  text; `messages.SyntaxError` existed and was never read.
- **`null` values are rejected as `DataError`**, not a raw `TypeError` (or,
  worse, accepted and failed later). `canInjectKey` and `storeRecord` treated
  `null` as an object.
- **`SharedArrayBuffer` and typed-array views over one are valid keys.** They
  were accepted by `valueToKey` and then unknown to `cmp`, which threw
  `DataError` from inside the abort rollback — outside any try/catch, so it
  killed the process. `valueToKey` now copies the bytes into a fresh
  `ArrayBuffer`; the detached check reads the view's buffer rather than the
  view (zero-length views were being rejected as detached).
- **Abort rollback is guarded.** A throw while undoing the log becomes the
  transaction's error instead of an uncaught exception; the log is walked on a
  copy rather than reversed in place; and aborting an upgrade transaction
  reverts only the connection that owns it — `_rawDatabase` is shared, and it
  was emptying every open connection.
- **`addEventListener` dedupes** on (type, callback, capture), as
  `EventTarget` requires. The same listener registered twice fired twice.
- **`Event.defaultPrevented` is a real getter** over the cancelled flag. It was
  always `false`, so a wrapper reading it after `preventDefault()` — the
  low-level `@aibulat/indexeddb` does exactly that — could not tell.
- `IDBIndex.get()`/`getKey()` with no argument is a `TypeError`, not
  `DataError`.
- An invalid `IDBCursorDirection` is a `TypeError` in `openCursor`,
  `openKeyCursor`, `getAll`/`getAllKeys` options and `getAllRecords`. It was
  silently accepted.
- `add`/`put` validate the key **before** cloning the value, so a bad key with
  an uncloneable value reports `DataError` as the spec orders, not
  `DataCloneError`.
- `IDBRequest.error` is `null` after success, per the IDL, not `undefined`.
- `multiEntry` index keys are deduplicated by key comparison rather than
  identity, so `[[1], [1]]` stores one entry.
- `validateRequiredArguments` reports the number actually passed.

## Performance

- **Cursor iteration over an explicit key range was O(n²).** `makeKeyRange`
  kept the *smaller* lower bound and the *larger* upper bound when combining
  the cursor's position with the caller's range, so every `continue()` rescanned
  from the start of the range. It now takes the tighter of each, and returns an
  empty range when they cross. Walking 4,000 records inside a bound range took
  3.2 s where the unbounded walk took 74 ms; it is 79 ms now.
- **Deleting a record with any index on the store was O(n²).**
  `RecordStore.deleteByValue` full-scanned the index for the primary key on
  every delete or overwrite. Indexes now compute the record's own index keys
  and delete by `(indexKey, primaryKey)`, a range lookup. Deleting 2,000
  records from a store with one index took 1.27 s, against 34 ms with no
  index; it is 40 ms now. Throughput guards for both live next to the existing
  `count()` one.
- `Index.getAllRecords` no longer clones each value twice; the scheduler is
  resolved once at module load rather than per task; `enforceRange` returns a
  number.

## Types and packaging

- **`types.d.ts` declares `installGlobals`** — the fork's headline addition
  had no type — and `forceCloseDatabase` takes an `IDBDatabase` instance
  rather than the constructor.
- `setErrorCode` is gone: the error classes are real `DOMException` subclasses,
  and the own enumerable `code` it added to four of them made
  `Object.keys(new DataError())` answer `['code']`.

## Test harness

- The WPT runner's `expectedTests` manifest key registers a fixed set of
  assertion names for a file that may time out, so a child that dies before
  printing cannot change the totals — the "identical on both runtimes" signal
  no longer has a legitimate reason to differ on the `UNSTABLE` file. A
  duplicate result is a verdict now rather than a `throw` that aborted the
  whole loop, and the dead `WRITE_TO_README` block (wrong path, null
  dereference, markers that did not exist) is deleted.
- `smoke.test.ts` calls `installGlobals()` rather than re-importing `auto`,
  the pattern the README warns about; `auto.test.ts` restores the source
  classes on `globalThis` in a `finally`, so under Bun's shared process it no
  longer leaves the `dist/` classes installed for the next file.

# 0.1.2 — transactions deactivate, and the IDL is honoured

Behavioural changes, so worth reading even though the API is unchanged. All of
this landed after 0.1.1 was published; the fork entry below describes it in
full, and this is the summary of what moved between the two releases.

- **Transactions now go inactive.** Previously a transaction was created
  `"active"` and never left that state, so a request placed from a later task —
  which a browser rejects with `TransactionInactiveError` — quietly succeeded.
  **A test suite that relied on that leniency will start failing here, and the
  failure is the finding**: the same code would already have been broken in a
  browser.
- `objectStore()` no longer conflates an inactive transaction with a finished
  one, `db.transaction(store, "versionchange")` throws `TypeError`, and
  `addEventListener` honours `once` and `signal` (both were accepted and
  silently ignored).
- The WebIDL pass: attributes moved to prototype accessors, readonly attributes
  lost their setters, interfaces became non-constructible, and
  `globalThis.indexedDB` is no longer assignable. Feature detection that reads
  `'x' in SomeInterface.prototype` now answers correctly.
- Conformance went from 1,488 passing / 25 recorded failures to **1,536 passing
  / 3**, with all 207 idlharness assertions passing, and the W3C corpus was
  re-synced from upstream (August 2026, `7327d61f88`). Nothing was added to the
  expectation manifests.

# 0.1.0 — forked as `@aibulat/indexeddb-impl`

> The conformance and behaviour sections below describe the state as of the
> latest release rather than what 0.1.0 itself shipped; see the 0.1.2 entry
> above for what changed after 0.1.1.

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

There is now one runner, `node:test`, over four suites and 1,774 tests, and the
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
