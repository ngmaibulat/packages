// Regressions for the spec-conformance and performance fixes made after the
// 0.1.2 review. Each `describe` names the behaviour, and each test says what
// went wrong before.

import { describe, it } from "node:test";
import * as assert from "node:assert";
import fakeIndexedDB from "../../src/fakeIndexedDB.ts";
import FDBKeyRange from "../../src/FDBKeyRange.ts";
import { installGlobals } from "../../src/install.ts";
import { SyntaxError as FakeSyntaxError } from "../../src/lib/errors.ts";
import { validateRequiredArguments } from "../../src/lib/validateRequiredArguments.ts";
import type FDBDatabase from "../../src/FDBDatabase.ts";
import type FDBObjectStore from "../../src/FDBObjectStore.ts";

let dbCount = 0;

/** Open a fresh database, running `upgrade` inside the versionchange transaction. */
function open(
    upgrade: (db: FDBDatabase) => void,
): Promise<FDBDatabase> {
    dbCount += 1;
    return new Promise((resolve, reject) => {
        const request = fakeIndexedDB.open(`conformance-fixes-${dbCount}`, 1);
        request.onupgradeneeded = () => upgrade(request.result);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

// The FDB* classes are structurally narrower than lib.dom's IDB* types in
// places (event handler signatures), so the helpers take the loose shape.
const settle = <T = any>(request: {
    onsuccess: any;
    onerror: any;
    result: any;
    error: any;
}): Promise<T> =>
    new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });

const complete = (transaction: {
    oncomplete: any;
    onabort: any;
    onerror: any;
    error: any;
}): Promise<void> =>
    new Promise((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onabort = () => reject(transaction.error);
        transaction.onerror = (event: Event) => event.preventDefault();
    });

describe("error construction", () => {
    it("SyntaxError carries the key-path message, not the VersionError one", () => {
        assert.match(new FakeSyntaxError().message, /key ?path/i);
        assert.doesNotMatch(new FakeSyntaxError().message, /version/i);
    });

    it("createObjectStore with a bad key path reports a key-path problem", async () => {
        let caught: unknown;
        await open((db) => {
            try {
                db.createObjectStore("s", { keyPath: "a b" });
            } catch (error) {
                caught = error;
            }
        });
        assert.equal((caught as DOMException).name, "SyntaxError");
        assert.match((caught as DOMException).message, /key ?path/i);
    });

    it("errors have no own enumerable `code`; the value comes from DOMException", async () => {
        let caught: DOMException | undefined;
        await open((db) => {
            try {
                db.createObjectStore("s", { keyPath: "a b" });
            } catch (error) {
                caught = error as DOMException;
            }
        });
        assert.deepEqual(Object.keys(caught!), []);
        assert.equal(caught!.code, DOMException.SYNTAX_ERR);
        assert.ok(caught instanceof DOMException);
    });

    it("validateRequiredArguments reports the number actually passed", () => {
        assert.throws(
            () => validateRequiredArguments(0, 1, "IDBFactory.open"),
            /At least 1 argument required, but only 0 passed/,
        );
        assert.throws(
            () => (fakeIndexedDB as any).open(),
            /only 0 passed/,
        );
    });
});

describe("keys and values", () => {
    it("put(null) on an in-line-key store is a DataError, not a TypeError", async () => {
        const db = await open((db) => {
            db.createObjectStore("s", { keyPath: "id", autoIncrement: true });
            db.createObjectStore("nested", { keyPath: "a.b", autoIncrement: true });
        });
        const store = db.transaction("s", "readwrite").objectStore("s");
        assert.throws(() => store.put(null), (e: DOMException) => e.name === "DataError");
        const nested = db.transaction("nested", "readwrite").objectStore("nested");
        assert.throws(() => nested.put(null), (e: DOMException) => e.name === "DataError");
        assert.throws(() => nested.put({ a: null }), (e: DOMException) => e.name === "DataError");
    });

    it("a zero-length typed array is a valid (empty) binary key", () => {
        assert.equal(fakeIndexedDB.cmp(new Uint8Array(0), new Uint8Array(0)), 0);
        assert.equal(fakeIndexedDB.cmp(new ArrayBuffer(0), new Uint8Array(0)), 0);
        assert.equal(fakeIndexedDB.cmp(new Uint8Array(0), new Uint8Array([1])), -1);
    });

    it("SharedArrayBuffer-backed keys compare and store like any binary key", async () => {
        if (typeof SharedArrayBuffer === "undefined") return;
        const a = new SharedArrayBuffer(2);
        const b = new SharedArrayBuffer(4);
        new Uint8Array(a).set([1, 2]);
        new Uint8Array(b).set([1, 2, 3, 4]);
        assert.equal(fakeIndexedDB.cmp(a, b), -1);
        assert.equal(fakeIndexedDB.cmp(a, new Uint8Array([1, 2]).buffer), 0);
        // The stored key is a plain ArrayBuffer copy.
        assert.ok(FDBKeyRange.only(a).lower instanceof ArrayBuffer);

        const db = await open((db) => db.createObjectStore("s"));
        const tx = db.transaction("s", "readwrite");
        const store = tx.objectStore("s");
        store.put("first", a);
        store.put("second", b);
        await complete(tx);
        const keys = await settle(db.transaction("s").objectStore("s").getAllKeys());
        assert.equal(keys.length, 2);
    });

    it("add/put report a key problem before trying to clone the value", async () => {
        const db = await open((db) => db.createObjectStore("s"));
        const store = db.transaction("s", "readwrite").objectStore("s");
        // Out-of-line store, no generator, no key: DataError, even though the
        // function value could never be cloned either.
        assert.throws(() => store.put(() => {}), (e: DOMException) => e.name === "DataError");
        // Invalid key: DataError, likewise before DataCloneError.
        assert.throws(
            () => store.put(() => {}, { not: "a key" }),
            (e: DOMException) => e.name === "DataError",
        );
        // With a valid key the clone failure is what is left.
        assert.throws(() => store.put(() => {}, 1), (e: DOMException) => e.name === "DataCloneError");
    });

    it("request.error is null, not undefined, after success", async () => {
        const db = await open((db) => db.createObjectStore("s").put(1, "a"));
        const request = db.transaction("s").objectStore("s").get("a");
        await settle(request);
        assert.strictEqual(request.error, null);
    });
});

describe("argument validation", () => {
    it("IDBIndex.get() and getKey() without an argument are TypeErrors", async () => {
        const db = await open((db) => {
            db.createObjectStore("s", { keyPath: "id" }).createIndex("i", "v");
        });
        const index = db.transaction("s").objectStore("s").index("i");
        assert.throws(() => (index as any).get(), TypeError);
        assert.throws(() => (index as any).getKey(), TypeError);
    });

    it("an invalid cursor direction is a TypeError everywhere it can be passed", async () => {
        const db = await open((db) => {
            const store = db.createObjectStore("s", { keyPath: "id" });
            store.createIndex("i", "v");
            store.put({ id: 1, v: 1 });
        });
        const store = db.transaction("s").objectStore("s");
        const index = store.index("i");
        for (const target of [store, index] as (FDBObjectStore | IDBIndex)[]) {
            assert.throws(() => (target as any).openCursor(null, "bogus"), TypeError);
            assert.throws(() => (target as any).openKeyCursor(null, "bogus"), TypeError);
            assert.throws(() => (target as any).getAll({ direction: "bogus" }), TypeError);
            assert.throws(() => (target as any).getAllKeys({ direction: "bogus" }), TypeError);
            assert.throws(() => (target as any).getAllRecords({ direction: "bogus" }), TypeError);
        }
        // The valid ones still work.
        const request = store.openCursor(null, "prevunique");
        const cursor = await settle(request);
        assert.equal(cursor!.direction, "prevunique");
    });
});

describe("event listeners", () => {
    it("registering the same listener twice fires it once", async () => {
        const db = await open((db) => db.createObjectStore("s").put(1, "a"));
        const request = db.transaction("s").objectStore("s").get("a");
        let calls = 0;
        const listener = () => {
            calls++;
        };
        request.addEventListener("success", listener);
        request.addEventListener("success", listener);
        // Different capture is a different listener, per the DOM standard.
        request.addEventListener("success", listener, true);
        await settle(request);
        await new Promise((resolve) => setTimeout(resolve, 0));
        assert.equal(calls, 2);
    });
});

describe("throughput", () => {
    // Guards against the two quadratic paths found in review: cursor iteration
    // over an explicit key range restarting from the range's start on every
    // continue(), and index maintenance scanning the whole index per delete.
    // Big enough that a quadratic path is unmistakable, small enough not to
    // starve the WPT children `node --test` runs alongside this file -- one of
    // them asserts on setTimeout(0) timing and fails under load.
    const N = 1200;

    async function populate(withIndex: boolean): Promise<FDBDatabase> {
        return open((db) => {
            const store = db.createObjectStore("s", { keyPath: "id" });
            if (withIndex) store.createIndex("byGroup", "group");
            for (let i = 0; i < N; i++) {
                store.put({ id: i, group: i % 10 });
            }
        });
    }

    async function timeCursor(db: FDBDatabase, range: IDBKeyRange | null) {
        const started = performance.now();
        let visited = 0;
        await new Promise<void>((resolve, reject) => {
            const request = db.transaction("s").objectStore("s").openCursor(range);
            request.onsuccess = () => {
                const cursor = request.result;
                if (!cursor) return resolve();
                visited++;
                cursor.continue();
            };
            request.onerror = () => reject(request.error);
        });
        assert.equal(visited, N);
        return performance.now() - started;
    }

    it("iterating a bounded range costs about the same as an unbounded one", async () => {
        const db = await populate(false);
        const unbounded = await timeCursor(db, null);
        const bounded = await timeCursor(db, FDBKeyRange.bound(0, N - 1));
        // Was ~44x. Allow generous slack for machine noise.
        assert.ok(
            bounded < unbounded * 5 + 50,
            `bounded ${bounded}ms vs unbounded ${unbounded}ms`,
        );
    });

    it("continue(key) past the range's end simply ends the cursor", async () => {
        const db = await populate(false);
        const request = db
            .transaction("s")
            .objectStore("s")
            .openCursor(FDBKeyRange.bound(0, 10));
        const results: number[] = [];
        await new Promise<void>((resolve, reject) => {
            request.onsuccess = () => {
                const cursor = request.result;
                if (!cursor) return resolve();
                results.push(cursor.key as number);
                cursor.continue(cursor.key === 0 ? 5 : 100);
            };
            request.onerror = () => reject(request.error);
        });
        assert.deepEqual(results, [0, 5]);
    });

    it("deleting every record of an indexed store is not quadratic", async () => {
        const timeClearByDelete = async (withIndex: boolean) => {
            const db = await populate(withIndex);
            const started = performance.now();
            const tx = db.transaction("s", "readwrite");
            const store = tx.objectStore("s");
            for (let i = 0; i < N; i++) store.delete(i);
            await complete(tx);
            assert.equal(await settle(db.transaction("s").objectStore("s").count()), 0);
            return performance.now() - started;
        };
        const plain = await timeClearByDelete(false);
        const indexed = await timeClearByDelete(true);
        // Was ~40x at this size, growing with N.
        assert.ok(indexed < plain * 5 + 100, `indexed ${indexed}ms vs plain ${plain}ms`);
    });

    it("index entries are removed exactly for the deleted record", async () => {
        const db = await open((db) => {
            const store = db.createObjectStore("s", { keyPath: "id" });
            store.createIndex("tags", "tags", { multiEntry: true });
            store.put({ id: 1, tags: ["a", "b", "a"] });
            store.put({ id: 2, tags: ["a"] });
        });
        const tx = db.transaction("s", "readwrite");
        tx.objectStore("s").delete(1);
        await complete(tx);
        const index = db.transaction("s").objectStore("s").index("tags");
        assert.deepEqual(await settle(index.getAllKeys()), [2]);
        assert.equal(await settle(index.count(null as any)), 1);
    });
});

describe("installGlobals", () => {
    it("is exported from the root and installs every interface", () => {
        const target = {} as Record<string, unknown>;
        installGlobals(target);
        assert.strictEqual(target["indexedDB"], fakeIndexedDB);
        for (const name of [
            "IDBCursor", "IDBCursorWithValue", "IDBDatabase", "IDBFactory", "IDBIndex",
            "IDBKeyRange", "IDBObjectStore", "IDBOpenDBRequest", "IDBRecord", "IDBRequest",
            "IDBTransaction", "IDBVersionChangeEvent",
        ]) {
            assert.equal(typeof target[name], "function", name);
        }
    });
});

describe("events", () => {
    it("defaultPrevented reflects preventDefault() on a cancelable event", async () => {
        const db = await open((db) => db.createObjectStore("s").put(1, "a"));
        const tx = db.transaction("s", "readwrite");
        const request = tx.objectStore("s").add(2, "a"); // ConstraintError
        let seenByTransaction: boolean | undefined;
        request.addEventListener("error", (event) => {
            assert.equal(event.defaultPrevented, false);
            event.preventDefault();
            assert.equal(event.defaultPrevented, true);
        });
        tx.addEventListener("error", (event) => {
            // Bubbled up, still cancelled.
            seenByTransaction = event.defaultPrevented;
        });
        await complete(tx);
        assert.equal(seenByTransaction, true);
    });
});
