# Conformance gaps and the plan for closing them

Current state, Node 26 and Bun 1.3, identical on both:

|                           | Was   | Now       |
| ------------------------- | ----- | --------- |
| Passing conformance tests | 1,369 | **1,488** |
| Expected failures         | 144   | **25**    |
| Expected timeouts         | 4     | 4         |
| Unstable                  | 11    | 11        |
| Skipped files             | 19    | 19        |

The authoritative record is `test/wpt/manifests/*.toml`. A known failure is
recorded there rather than deleted, so fixing one turns into an _unexpected
pass_ — a red build — rather than silence. Regenerate with
`GENERATE_MANIFESTS=1 pnpm run test:wpt`, and **read the diff**: the audit that
matters is "0 expectations added".

---

## What has been done

### WebIDL fidelity (`src/lib/webidl.ts` + every class)

One helper, `defineInterface`, called once per class, plus an attribute
migration. Together these cleared 118 of the idlharness failures.

- **Interface objects carry their IDL identity.** `IDBRequest.name` was
  `"FDBRequest"`; interface objects reported the arity of whatever constructor
  the class happened to have. Visible in stack traces and `constructor.name`,
  so worth it independently of the tests.
- **Attributes live on the prototype.** 37 of them were own instance
  properties, so `Object.getOwnPropertyDescriptor(IDBRequest.prototype,
'readyState')` was `undefined` and any code feature-detecting
  `'durability' in IDBTransaction.prototype` got a false negative.
- **Event handlers belong to the right interface.** `FakeEventTarget` declared
  all eight (`onabort` … `onversionchange`) as plain fields, so _every_ instance
  carried _all eight_ as own properties — an `IDBDatabase` answered true to
  `'onupgradeneeded' in db`. They are `declare`-free accessors on each
  interface's own prototype now, and instances carry none.
- **Readonly attributes are readonly.** Ten had setters, eight of them no-op
  `/* for babel */` stubs left over from a build system this fork does not use.
  `IDBRequest.result`/`error` had real setters that internal code used; those
  writes go to the backing fields.
- **Members are enumerable and brand-checked**, and operations report the IDL's
  required-argument count rather than their JS arity.

### Behaviour

- **`IDBDatabase.transaction(store, 'versionchange')` throws TypeError.** It
  used to succeed. The check sits after the scope checks, because WPT requires
  `NotFoundError` to win for a missing store; the upgrade algorithm reaches the
  same code through `_versionchangeTransaction`.

### Test harness

- `assert_readonly` in `wpt-env.js` assigned and expected the assignment to be
  silently discarded. That holds for upstream's classic script, but these
  converted tests are ES modules and therefore strict, where assigning to a
  getter-only accessor throws. Once the attributes became genuinely readonly the
  helper started reporting real conformance as failure.

---

## What is left: 25 failures and 4 timeouts

### 1. Transaction activation timing — 8 tests + 4 timeouts (highest value)

Files: `transaction-deactivation-timing`, `upgrade-transaction-deactivation-timing`,
`event-dispatch-active-flag`, `upgrade-transaction-lifecycle-committed`, and
`idb-explicit-commit`.

The spec says a transaction is active for the task that created it _and through
that task's microtask checkpoint_, then inactive before the next task, and
active again while its requests' `success`/`error` events dispatch.
`src/lib/scheduling.ts` drives everything off `setImmediate` and never returns a
live transaction to "inactive", so:

```js
const tx = db.transaction("s", "readwrite"); // something keeps it alive
await new Promise((r) => setTimeout(r, 0));
tx._state; // "active"  -- the spec says "inactive"
tx.commit(); // should throw InvalidStateError; does not
```

That last line is why `idb-explicit-commit` fails: `commit()` already checks the
state correctly, it is the state that is wrong. **This is one root cause behind
all five files**, and the reason to prioritise it: a transaction that stays
usable here but would have gone inactive in a browser means a test passes here
and fails in production — the worst failure mode for a test double.

Approach: separate "the work queue has drained" from "the transaction is no
longer active", and clear the active flag at the end of the current task's
microtask checkpoint. Two of the four files currently time out, so expect the
failure count to move in both directions before it settles.

**Risk: high.** Its own change, nothing else mixed in.

### 2. Interfaces are constructible — 6 tests

`new IDBCursor()` should throw a TypeError; every interface here except
`IDBVersionChangeEvent` has no constructor in the IDL. Internal code does
construct them, so this needs the same kind of internal door as
`_versionchangeTransaction`. Mechanical, low risk, low user value.

### 3. `FakeEventTarget` is not `EventTarget` — 6 tests

`IDBRequest.prototype`'s prototype should be `EventTarget.prototype`. Both
runtimes now have a spec `EventTarget`, but IDB needs capture/bubble propagation
from request → transaction → database and `EventTarget` has none — inheriting
would keep the custom dispatch and gain only the prototype chain, plus real
`instanceof EventTarget`. **Do not attempt alongside item 1**; dispatch ordering
is the most delicate code here and item 1 already touches it.

### 4. Small, isolated

- `IDBFactory.databases()` should _reject_ rather than throw on a failed brand
  check, since it is promise-returning. One test; needs `defineInterface` to
  know which operations return promises.
- `Window.indexedDB` wants a getter; we install a data property. One test, and
  arguably the harness's `Window` stub rather than us.
- `key_invalid` "proxy of an array" — not fixable in portable JavaScript; the
  reasoning is recorded in the manifest.
- `ready-state-destroyed-execution-context` — needs a browsing context to tear
  down. Leave it.

---

## Phase 3 — spec-derived test coverage

Two layers already derive from the W3C standard:

- `test/wpt/converted/` — the conformance suite, copied October 2025 from wpt
  `c05ece9d6f`. Regenerate from `test/wpt/IndexedDB/` with
  `node test/wpt/convert.js`.
- `test/wpt/idlharness/IndexedDB.idl` — the interface definitions, **machine
  extracted from the spec text by Reffy/webref**. This is what
  `src/lib/webidl.ts` was written against; the operation arity tables in each
  class are transcribed from it.

So the work is refreshing and widening, not writing a generator:

1. **Re-sync WPT from upstream**, after item 1, so new failures are attributable.
2. **Revisit the 19 skipped files** — skipped as "can't feasibly run in Node"
   (iframes, cross-origin, partitioned storage). Some may be reachable now.
3. **Keep the IDL current** when re-syncing. A stale `.idl` silently stops
   testing new spec surface, and it now also silently stops checking arities.

## Guardrails

- Node and Bun report **identical** totals. There are no per-runtime manifest
  overrides and there should not be; a divergence is a finding.
- The expected-failure count only ever goes **down**. Read the regeneration diff
  and confirm nothing was _added_ before committing it.
- `@aibulat/indexeddb`'s 117 tests run against this package, so its suite is a
  second, independent check — particularly on item 1.
