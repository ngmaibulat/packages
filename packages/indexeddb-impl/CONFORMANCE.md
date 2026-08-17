# Conformance

Current state, Node 26 and Bun 1.3, identical on both:

|                           | At fork | Now       |
| ------------------------- | ------- | --------- |
| Passing conformance tests | 1,369   | **1,536** |
| Expected failures         | 144     | **3**     |
| Expected timeouts         | 4       | **1**     |
| Unstable                  | 11      | **2**     |
| Skipped files             | 19      | 19        |

The authoritative record is `test/wpt/manifests/*.toml`. A known failure is
recorded there rather than deleted, so fixing one turns into an _unexpected
pass_ — a red build — rather than silence. Regenerate with
`GENERATE_MANIFESTS=1 pnpm run test:wpt`, and **read the diff**: the audit that
matters is "0 expectations added".

---

## What was fixed

### Behaviour

- **Transaction activation timing.** A transaction was created `"active"` and
  never left that state, so requests placed from a later task — which a browser
  rejects with `TransactionInactiveError` — quietly succeeded, and `commit()`
  never threw. It now goes inactive after the task that created it and after
  each success/error dispatch. See the scheduling note below.
- **`objectStore()` threw the wrong error.** `InvalidStateError` is for a
  _finished_ transaction; an inactive one still hands back a store handle, and
  it is the request placed against that handle that throws
  `TransactionInactiveError`. Conflating the two only became visible once
  transactions started going inactive at all.
- **`db.transaction(store, "versionchange")` throws `TypeError`.** It used to
  succeed and return an upgrade transaction. Ordered after the scope checks so
  `NotFoundError` still wins for a missing store; the upgrade algorithm reaches
  the same code through `_versionchangeTransaction`.
- **`addEventListener` honours `once` and `signal`.** Both were accepted and
  silently ignored — a `{ once: true }` listener fired once per record over a
  cursor, and an aborted `AbortSignal` removed nothing. No WPT covers this,
  which is why it survived; `test/unit/eventListenerOptions.test.ts` does now.

### WebIDL

One helper, `src/lib/webidl.ts`, called once per class, plus an attribute
migration and the EventTarget splice. Together these took idlharness from 132
failures to zero.

- **All 207 idlharness assertions pass.** The interface surface matches the IDL.
- **Attributes live on the prototype.** 37 were own instance properties, so
  `'durability' in IDBTransaction.prototype` was false and any feature detection
  got the wrong answer.
- **Event handlers belong to the right interface.** `FakeEventTarget` declared
  all eight as plain fields, so _every_ instance carried _all eight_ — an
  `IDBDatabase` answered true to `'onupgradeneeded' in db`.
- **Readonly attributes are readonly.** Ten had setters, eight of them no-op
  `/* for babel */` stubs for a build system this fork does not use.
- **Interfaces are not constructible.** `new IDBCursor()` throws, as the IDL
  requires; internal construction goes through a counter-guarded gate.
- **`EventTarget` is in the prototype chain.** `IDBRequest`, `IDBDatabase` and
  `IDBTransaction` sit directly under it, so `instanceof EventTarget` works and
  instances carry real EventTarget internal slots.
- **`indexedDB` is a readonly attribute**, so it is an enumerable accessor with a
  brand-checking getter named `get indexedDB` and no setter — which means
  `globalThis.indexedDB = x` no longer works, exactly as in a browser. The
  property stays configurable, so `Object.defineProperty` or another
  `installGlobals()` call still substitutes it.
- Interface objects report their IDL `name` and `length`, members are enumerable
  and brand-checked, operations report the IDL's required-argument count, and
  `databases()` rejects rather than throws on a failed brand check.

### Corpus and harness

- **Re-synced from upstream wpt** (August 2026, `7327d61f88`), adding 17 tests,
  all passing. The IDL was already current.
- `assert_readonly` assigned and expected the assignment to be discarded — true
  for upstream's classic script, false in an ES module, where it throws. Once
  the attributes became genuinely readonly it started reporting correct
  behaviour as failure.
- `promise_rejects_js` was missing from the trimmed harness.
- `convert.js` resolved its paths from `process.cwd()`, as the runner did.

---

## What is left: 3 failures, 2 unstable, 1 timeout

### Transaction deactivation is a bounded microtask drain

Worth understanding, because it is what closed most of the gap and it is the
one piece of machinery here that is an approximation.

In a browser the microtask checkpoint runs _inside_ event dispatch — whenever
the JS stack empties between listeners — which is what keeps a transaction
active across the ordinary "await a request, then issue the next one" loop and
still has it inactive by the next task. `dispatchEvent` here is synchronous, so
microtasks only run after it returns, and no scheduling primitive lands in that
slot:

| Primitive        | Runs           | Why it fails                                                                                                                                 |
| ---------------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `queueMicrotask` | mid-checkpoint | One hop does not survive an `await`, which costs two. Lands mid promise-chain and breaks every "await a request, then issue the next" loop.  |
| `setImmediate`   | check phase    | Node runs timers before check, so it loses to a `setTimeout(…, 0)` the caller queues afterwards.                                             |
| `setTimeout`     | timers phase   | Wins that race, but Node's timer internals assign an `id` to a `TimersList`, tripping any test with a setter on `Object.prototype.id`.       |
| `MessageChannel` | poll phase     | Beats a _later_ timer, loses to an already-pending one — and Node and Bun order it differently, which would break the identical-totals rule. |

What does work is re-queueing a microtask a bounded number of times
(`queueAfterCheckpoint` in `lib/scheduling.ts`). Each re-queue goes to the
_back_ of the microtask queue, so a caller's chain of k hops all runs before
round k+1; if the queue empties sooner the remaining rounds run back-to-back,
still inside the same checkpoint. So it lands after any realistic continuation
and always before the next task — deterministically, on both runtimes.

The bound (64 rounds) is the approximation. A continuation longer than that
would find the transaction already inactive — which is also what a browser does
to anyone who awaits something slow mid-transaction.

All three deactivation points use it: a transaction created by
`db.transaction()`, a request whose success or error event has been dispatched,
and — since the review after 0.1.2 — the upgrade transaction once the
`upgradeneeded` dispatch returns. That last one was on `setImmediate` until
then, and it was the load-dependent race in the table above made real:
`upgrade-transaction-deactivation-timing` ("Upgrade transactions are
deactivated before next task") failed 8 in 72 forks and never standalone, and
only under Node. `conformance-fixes.test.ts` now burns the millisecond inside
the handler so the old ordering fails every time.

### The three that stay

- **`transaction-deactivation-timing`, "Deactivation of new transactions happens
  at end of invocation"** (1 of the file's 5). It asserts that microtasks run
  _between_ two listeners on the same event, which requires the checkpoint to
  run inside dispatch. That is the one thing the drain cannot emulate; doing so
  means yielding between listeners and changing dispatch ordering everywhere.
- **`key_invalid` "proxy of an array"** — not detectable in portable JavaScript.
  Both detectors, `util.types.isProxy` and a `structuredClone` round-trip, are
  unavailable or too expensive here. Reasoning in the manifest.
- **`ready-state-destroyed-execution-context`** — needs a browsing context to
  tear down.

### The two unstable

Both are load-dependent races that pass reliably on their own and fail
occasionally inside the full suite, where 200+ forked children compete for the
machine. Recorded `UNSTABLE` so neither outcome turns the build red.

- **`idbtransaction_abort`** — aborting during auto-commit, which depends on
  landing inside a window this implementation crosses within one task.
- **`upgrade-transaction-lifecycle-committed`** — a committed transaction
  reaches "finished" through a `queueTask`, which under load can slip past the
  caller's timer. Its timeout is part of the same race.

### The 19 skipped files

All carry a reason. Twelve are cross-iframe, cross-origin or partitioned
storage; the rest are `<input type=file>`, XMLHttpRequest, cross-origin
isolation, and `navigator.storageBuckets`, which this package does not intend to
support. `idb_webworkers` stays skipped for a better reason than the old "no Web
Worker in Node": both runtimes have workers now, but a worker gets its own
module registry and therefore its own empty database, so the test's premise
cannot hold for an in-memory implementation.

## Guardrails

- Node and Bun report **identical** totals. There are no per-runtime manifest
  overrides and there should not be; a divergence is a finding. The `bun` job in
  `ci.yml` enforces it.
- The expected-failure count only ever goes **down**. Read the regeneration diff
  and confirm nothing was _added_ before committing it. The exception is a
  corpus re-sync, where new tests for unimplemented surface legitimately add
  entries — each needs a comment saying so.
- `@aibulat/indexeddb`'s 117 tests run against this package, so its suite is a
  second, independent check.

## Where the spec-derived tests come from

- `test/wpt/converted/` — the W3C conformance suite, copied August 2026 from wpt
  `7327d61f88`. Regenerate from `test/wpt/IndexedDB/` with
  `node test/wpt/convert.js`.
- `test/wpt/idlharness/IndexedDB.idl` — the interface definitions, **machine
  extracted from the spec text by Reffy/webref**. `src/lib/webidl.ts` was
  written against it, and the operation arity tables in each class are
  transcribed from it, so a stale copy silently stops checking both.
