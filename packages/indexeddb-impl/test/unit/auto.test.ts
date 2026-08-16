import { describe, it } from "node:test";
import * as assert from "node:assert";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import * as fakeIndexedDB from "../../src/index.ts";
import { installGlobals } from "../../src/install.ts";

// The interface objects: writable, non-enumerable data properties, per WebIDL.
// `indexedDB` is not one of them -- it is a readonly attribute, so it gets an
// enumerable accessor with no setter, and is checked separately below.
const interfaceObjects = Object.keys(fakeIndexedDB).filter((prop) =>
    prop.startsWith("IDB"),
) as Array<keyof typeof fakeIndexedDB>;

const props = [...interfaceObjects, "indexedDB"] as Array<
    keyof typeof fakeIndexedDB
>;

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

        for (const prop of interfaceObjects) {
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

    it("installs indexedDB as the readonly attribute WebIDL declares", () => {
        clearGlobals();
        installGlobals();

        const descriptor = Object.getOwnPropertyDescriptor(
            globalThis,
            "indexedDB",
        )!;
        assert.equal(typeof descriptor.get, "function", "has a getter");
        assert.equal(descriptor.set, undefined, "readonly: no setter");
        assert.equal(descriptor.enumerable, true, "attributes are enumerable");
        assert.equal(descriptor.configurable, true);
        assert.equal(descriptor.get!.name, "get indexedDB");
        assert.equal(globalThis.indexedDB, fakeIndexedDB.indexedDB);

        // A [Global] attribute's getter has an implicit this...
        assert.equal(
            descriptor.get!.call(undefined),
            fakeIndexedDB.indexedDB,
            "implicit this",
        );
        // ...but any other receiver is a brand mismatch.
        assert.throws(() => descriptor.get!.call({}), TypeError);
    });

    it("indexedDB can still be replaced, just not by assignment", () => {
        clearGlobals();
        installGlobals();

        const substitute = {} as typeof fakeIndexedDB.indexedDB;
        Object.defineProperty(globalThis, "indexedDB", {
            value: substitute,
            configurable: true,
            writable: true,
        });
        assert.equal(globalThis.indexedDB, substitute);

        installGlobals();
        assert.equal(globalThis.indexedDB, fakeIndexedDB.indexedDB);
    });

    it("leaves the interface objects overwritable", async () => {
        // installGlobals() rather than `import "../../src/auto.ts"`: the import
        // only runs once per module registry, so under a runner that shares a
        // process across files (bun test) it is a no-op the second time and the
        // globals we just cleared stay cleared.
        installGlobals();

        for (const prop of interfaceObjects) {
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
