// AddEventListenerOptions: `once` and `signal`.
//
// Neither is covered by the W3C corpus, which is why both were accepted and
// silently ignored for so long -- the worst shape for a bug, because the call
// looks like it worked. See CONFORMANCE.md.

import { describe, it } from "node:test";
import * as assert from "node:assert";
import fakeIndexedDB from "../../src/fakeIndexedDB.ts";
import type FDBDatabase from "../../src/FDBDatabase.ts";

let dbCount = 0;

/** A store holding three records, so a cursor fires success repeatedly. */
function openWithRecords(): Promise<FDBDatabase> {
    dbCount += 1;
    return new Promise((resolve, reject) => {
        const request = fakeIndexedDB.open(`listener-options-${dbCount}`, 1);
        request.onupgradeneeded = () => {
            const store = request.result.createObjectStore("s");
            store.put(1, "a");
            store.put(2, "b");
            store.put(3, "c");
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

describe("addEventListener options", () => {
    it("once: fires at most one time", async () => {
        const db = await openWithRecords();
        const tx = db.transaction("s");
        const request = tx.objectStore("s").openCursor();

        let fired = 0;
        request.addEventListener(
            "success",
            () => {
                fired += 1;
                // Advancing re-fires success on the same request, which is what
                // made the old behaviour visible: the listener ran once per
                // record plus once for the final null cursor.
                const cursor = request.result;
                if (cursor) cursor.continue();
            },
            { once: true },
        );

        await new Promise((resolve) => (tx.oncomplete = resolve));
        assert.strictEqual(fired, 1);
        db.close();
    });

    it("once: each of two listeners fires once", async () => {
        const db = await openWithRecords();
        const tx = db.transaction("s");
        const request = tx.objectStore("s").openCursor();

        let first = 0;
        let second = 0;
        request.addEventListener("success", () => (first += 1), { once: true });
        request.addEventListener(
            "success",
            () => {
                second += 1;
                const cursor = request.result;
                if (cursor) cursor.continue();
            },
            { once: true },
        );

        await new Promise((resolve) => (tx.oncomplete = resolve));
        assert.deepStrictEqual([first, second], [1, 1]);
        db.close();
    });

    it("once: removeEventListener still detaches one that never fired", async () => {
        const db = await openWithRecords();
        const tx = db.transaction("s");
        const request = tx.objectStore("s").get("a");

        let fired = 0;
        const handler = () => (fired += 1);
        request.addEventListener("success", handler, { once: true });
        request.removeEventListener("success", handler);

        await new Promise((resolve) => (tx.oncomplete = resolve));
        assert.strictEqual(fired, 0);
        db.close();
    });

    it("signal: aborting before the event removes the listener", async () => {
        const db = await openWithRecords();
        const tx = db.transaction("s", "readwrite");
        const controller = new AbortController();

        let fired = 0;
        const request = tx.objectStore("s").put(9, "z");
        request.addEventListener("success", () => (fired += 1), {
            signal: controller.signal,
        });
        controller.abort();

        await new Promise((resolve) => (tx.oncomplete = resolve));
        assert.strictEqual(fired, 0);
        db.close();
    });

    it("signal: an already-aborted signal registers nothing", async () => {
        const db = await openWithRecords();
        const tx = db.transaction("s", "readwrite");
        const controller = new AbortController();
        controller.abort();

        let fired = 0;
        const request = tx.objectStore("s").put(8, "y");
        request.addEventListener("success", () => (fired += 1), {
            signal: controller.signal,
        });
        assert.strictEqual(
            request._listeners.length,
            0,
            "nothing should have been registered",
        );

        await new Promise((resolve) => (tx.oncomplete = resolve));
        assert.strictEqual(fired, 0);
        db.close();
    });

    it("signal: a listener that is never aborted still fires", async () => {
        const db = await openWithRecords();
        const tx = db.transaction("s");
        const controller = new AbortController();

        let fired = 0;
        const request = tx.objectStore("s").get("a");
        request.addEventListener("success", () => (fired += 1), {
            signal: controller.signal,
        });

        await new Promise((resolve) => (tx.oncomplete = resolve));
        assert.strictEqual(fired, 1);
        db.close();
    });

    it("removing a signalled listener detaches it from the signal", async () => {
        const db = await openWithRecords();
        const tx = db.transaction("s");
        const controller = new AbortController();

        const request = tx.objectStore("s").get("a");
        const handler = () => {};
        request.addEventListener("success", handler, {
            signal: controller.signal,
        });
        request.removeEventListener("success", handler);

        // Nothing is left to abort, and aborting must not throw or resurrect it.
        controller.abort();
        assert.strictEqual(request._listeners.length, 0);

        await new Promise((resolve) => (tx.oncomplete = resolve));
        db.close();
    });
});
