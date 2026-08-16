import { describe, it } from "node:test";
import * as assert from "node:assert";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import * as fakeIndexedDB from "../../src/index.ts";
import { installGlobals } from "../../src/install.ts";

// `indexedDB` is read-only natively, all the others are read-write.
const props = Object.keys(fakeIndexedDB).filter(
    (prop) => prop.startsWith("IDB") || prop === "indexedDB",
) as Array<keyof typeof fakeIndexedDB>;

/** Blank out the globals so we can watch `auto` install them. */
function clearGlobals() {
    Object.defineProperty(globalThis, "indexedDB", {
        set: undefined,
        get: () => undefined,
        enumerable: false,
        configurable: true,
    });
    for (const prop of props) {
        Object.defineProperty(globalThis, prop, {
            value: undefined,
            enumerable: false,
            configurable: true,
            writable: true,
        });
    }
}

describe("auto", () => {
    it("installs the globals with native-like descriptors", async () => {
        clearGlobals();

        // installGlobals() rather than `import "../../src/auto.ts"`: the import
        // only runs once per module registry, so under a runner that shares a
        // process across files (bun test) it is a no-op the second time and the
        // globals we just cleared stay cleared.
        installGlobals();

        for (const prop of props) {
            const descriptor = Object.getOwnPropertyDescriptor(
                globalThis,
                prop,
            );
            assert.equal(descriptor!.value, fakeIndexedDB[prop], prop);
            assert.equal(descriptor!.enumerable, false, `${prop} enumerable`);
            assert.equal(
                descriptor!.configurable,
                true,
                `${prop} configurable`,
            );
            assert.equal(descriptor!.writable, true, `${prop} writable`);
        }
    });

    it("leaves the globals overwritable", async () => {
        // installGlobals() rather than `import "../../src/auto.ts"`: the import
        // only runs once per module registry, so under a runner that shares a
        // process across files (bun test) it is a no-op the second time and the
        // globals we just cleared stay cleared.
        installGlobals();

        for (const prop of props) {
            const fake = {};
            (globalThis as any)[prop] = fake;
            assert.equal((globalThis as any)[prop], fake, prop);
        }
    });

    // Upstream's third case here asserted that the CJS `auto` build assigned
    // module.exports directly rather than module.exports.default (its issue
    // #130). This package is ESM only, so there is no CJS twin to get wrong.

    // The two entries must resolve to one copy of each class. tsdown splits the
    // shared modules into a chunk, which is what makes that true -- if they were
    // ever inlined per-entry instead, `auto` would install different classes
    // from the ones the main entry exports, and every `instanceof` in a
    // consumer's test suite would start failing. Nothing else checks this.
    it("built entries share one copy of each class", async (t) => {
        const dist = new URL("../../dist/", import.meta.url);
        if (!existsSync(fileURLToPath(new URL("index.js", dist)))) {
            t.skip("dist/ not built");
            return;
        }

        clearGlobals();
        const built = await import(new URL("index.js", dist).href);
        await import(new URL("auto.js", dist).href);

        for (const prop of props) {
            assert.equal(
                (globalThis as any)[prop],
                built[prop],
                `${prop} identity across dist/auto.js and dist/index.js`,
            );
        }
    });
});
