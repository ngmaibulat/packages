// Mocha's shape, on top of node:test.
//
// The suites under test/unit came from upstream's mocha runner, which needed a
// build step and a browser-less-but-separate runner. They are kept verbatim
// apart from their imports, because they are the closest thing this project has
// to a regression corpus and a rewrite would be 2,300 lines of risk for no
// coverage.
//
// The one incompatibility is the callback signature: mocha passes `done` as the
// first argument, node:test passes its TestContext first and only offers a
// callback second. So `it` here adapts a mocha-style function into a promise.

import {
    describe as nodeDescribe,
    it as nodeIt,
    beforeEach as nodeBeforeEach,
    afterEach as nodeAfterEach,
} from "node:test";

type Done = (error?: unknown) => void;
type MochaFn = ((done: Done) => void) | (() => unknown);

/** True when the function declared a `done` parameter. */
const isCallbackStyle = (fn: MochaFn): fn is (done: Done) => void =>
    fn.length > 0;

function adapt(fn: MochaFn): () => void | Promise<void> {
    if (!isCallbackStyle(fn)) return fn as () => void | Promise<void>;

    return () =>
        new Promise<void>((resolve, reject) => {
            let settled = false;
            const done: Done = (error) => {
                // mocha treats a second done() as an error; here it would be an
                // unhandled rejection long after the test passed, which is far
                // harder to trace back. Swallowing it matches node:test, which
                // ignores a resolve() after settling.
                if (settled) return;
                settled = true;
                if (error) reject(error);
                else resolve();
            };
            try {
                fn(done);
            } catch (error) {
                done(error);
            }
        });
}

export const describe = nodeDescribe;
export const beforeEach = (fn: MochaFn) => nodeBeforeEach(adapt(fn));
export const afterEach = (fn: MochaFn) => nodeAfterEach(adapt(fn));

export function it(name: string, fn: MochaFn): void {
    nodeIt(name, adapt(fn));
}
