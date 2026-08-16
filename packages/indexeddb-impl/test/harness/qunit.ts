// QUnit's shape, on top of node:test.
//
// The suite under test/qunit/suite is the indexedDBmock conformance corpus:
// 105 tests, ~5,600 lines, written for QUnit and run by upstream in a real
// browser through node-qunit-phantomjs. PhantomJS has been unmaintained since
// 2018, so in practice that suite stopped running. This harness is what lets it
// run under `node --test` and `bun test` instead, which is the whole point of
// the exercise -- it is the last part of the project that needed a browser.
//
// Two things about the corpus drive the design:
//
//   1. The files were <script> tags. setup.js declares the fixtures and helper
//      functions (`indexedDb`, `dbName`, `initionalSituation`, ...) that the
//      other eight rely on finding in the shared global scope. So they are
//      concatenated and evaluated as one function body: every top-level `var`
//      and `function` becomes a local of that one scope, which reproduces the
//      script-tag semantics without actually leaking onto globalThis.
//
//   2. It is evaluated in *this* realm, not a vm context. A vm gets its own
//      intrinsics, and the fixtures build keys out of `new Date()` -- which the
//      implementation key-encodes with an `instanceof Date` check. Across
//      realms that check is false, and the failures look like key bugs rather
//      than harness bugs.

import { describe, it } from "node:test";
import * as assert from "node:assert";
import { readFileSync } from "node:fs";

// A test that loses an event -- never firing onsuccess or onerror -- would
// otherwise hang the whole run, because nothing releases its async() handle.
// QUnit had its own per-test timeout; this is the equivalent.
const TEST_TIMEOUT_MS = 10_000;

/** The QUnit assert object, as far as this corpus uses it. */
export interface QUnitAssert {
    ok(value: unknown, message?: string): void;
    equal(actual: unknown, expected: unknown, message?: string): void;
    deepEqual(actual: unknown, expected: unknown, message?: string): void;
    expect(count: number): void;
    async(): () => void;
}

type QUnitTestFn = (assert: QUnitAssert) => void;

interface Registration {
    module: string;
    name: string;
    fn: QUnitTestFn;
}

/**
 * Build the assert object for one test, plus a promise that settles when every
 * `async()` handle has been released.
 */
function createAssert(): {
    api: QUnitAssert;
    finished: Promise<void>;
    verify: () => void;
    bodyDone: () => void;
} {
    let count = 0;
    let expected: number | undefined;
    let pending = 0;
    let asyncRequested = false;
    // Until the test function has returned we cannot tell a synchronous test
    // from an async one that has not reached its first async() yet.
    let bodyReturned = false;
    let resolve!: () => void;
    let reject!: (error: unknown) => void;

    const finished = new Promise<void>((res, rej) => {
        resolve = res;
        reject = rej;
    });

    const settleIfDone = () => {
        if (!bodyReturned) return;
        // A test that never called async() is synchronous and is over as soon
        // as its body returns; one that did is over when every handle is back.
        if (!asyncRequested || pending === 0) resolve();
    };

    const track =
        <A extends unknown[]>(fn: (...args: A) => void) =>
        (...args: A) => {
            count += 1;
            try {
                fn(...args);
            } catch (error) {
                // A failed assertion inside an IDB event handler would
                // otherwise be swallowed by the event dispatch and show up as a
                // timeout with no message.
                reject(error);
            }
        };

    const api: QUnitAssert = {
        ok: track((value: unknown, message?: string) =>
            assert.ok(value, message),
        ),
        // QUnit's equal is intentionally loose, and the corpus relies on it
        // (comparing a Date to a string, a number to a numeric string).
        equal: track((actual: unknown, expected: unknown, message?: string) =>
            assert.equal(actual, expected, message),
        ),
        deepEqual: track(
            (actual: unknown, expected: unknown, message?: string) =>
                assert.deepEqual(actual, expected, message),
        ),
        expect(n: number) {
            expected = n;
        },
        async() {
            asyncRequested = true;
            pending += 1;
            let released = false;
            return () => {
                if (released) return;
                released = true;
                pending -= 1;
                settleIfDone();
            };
        },
    };

    const verify = () => {
        if (expected !== undefined && count !== expected) {
            assert.fail(`expected ${expected} assertions, ${count} ran`);
        }
    };

    /** Called once the test body has returned, to settle synchronous tests. */
    const bodyDone = () => {
        bodyReturned = true;
        settleIfDone();
    };

    return { api, finished, verify, bodyDone };
}

/**
 * Evaluate the concatenated suite, collect what it registers, and emit it as
 * node:test suites.
 *
 * @param files Absolute paths, in the order the original index.html loaded them.
 * @param globals Browser globals the corpus expects (`window`, `location`, ...).
 */
export function runQUnitSuite(
    files: string[],
    globals: Record<string, unknown>,
): void {
    const registrations: Registration[] = [];
    let currentModule = "QUnit";

    // QUnit 1.x, which this corpus was written against, exposed `ok`, `equal`
    // and `deepEqual` as globals as well as on the assert argument, and the
    // corpus mixes both freely -- often `assert.ok` in the outer callback and a
    // bare `ok` inside a nested one. Left undefined they throw ReferenceError,
    // which the corpus's own try/catch then reports as a misleading
    // "Transaction exception" rather than a missing global.
    //
    // They delegate to whichever test is running. That is safe because
    // node:test runs the tests in a describe serially and we await each one's
    // completion, so exactly one is ever current -- the same assumption QUnit
    // 1.x made.
    let currentAssert: QUnitAssert | undefined;
    const requireCurrent = (): QUnitAssert => {
        if (!currentAssert) {
            throw new Error(
                "a QUnit global assertion fired outside a running test",
            );
        }
        return currentAssert;
    };
    const legacyGlobals = {
        ok: (value: unknown, message?: string) =>
            requireCurrent().ok(value, message),
        equal: (actual: unknown, expected: unknown, message?: string) =>
            requireCurrent().equal(actual, expected, message),
        deepEqual: (actual: unknown, expected: unknown, message?: string) =>
            requireCurrent().deepEqual(actual, expected, message),
    };

    const QUnit = {
        // QUnit.start() is a no-op for us: there is no autostart to defer to.
        start() {},
        module(name: string) {
            currentModule = name;
        },
        test(name: string, fn: QUnitTestFn) {
            registrations.push({ module: currentModule, name, fn });
        },
    };

    const source = files
        .map((file) => `\n//# ${file}\n${readFileSync(file, "utf8")}`)
        .join("\n");

    const injected: Record<string, unknown> = {
        QUnit,
        ...legacyGlobals,
        ...globals,
    };
    const evaluate = new Function(...Object.keys(injected), source);
    evaluate(...Object.values(injected));

    // Group by module, preserving registration order, so the output reads the
    // way the original QUnit run did.
    const byModule = new Map<string, Registration[]>();
    for (const registration of registrations) {
        const list = byModule.get(registration.module) ?? [];
        list.push(registration);
        byModule.set(registration.module, list);
    }

    for (const [moduleName, tests] of byModule) {
        describe(moduleName, () => {
            for (const registration of tests) {
                it(
                    registration.name,
                    { timeout: TEST_TIMEOUT_MS },
                    async () => {
                        const { api, finished, verify, bodyDone } =
                            createAssert();
                        currentAssert = api;
                        try {
                            registration.fn(api);
                            bodyDone();
                            await finished;
                        } finally {
                            currentAssert = undefined;
                        }
                        verify();
                    },
                );
            }
        });
    }
}
