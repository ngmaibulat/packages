// The public surface, and one real consumer.
//
// Upstream kept these as two loose scripts under test/ that ran against the
// build output (`node test/test.js && node test/dexie.js`) and signalled failure
// by throwing or calling process.exit. They are node:test cases here, and they
// exercise the sources rather than the build.

import { describe, it } from "node:test";
import * as assert from "node:assert";
import {
    indexedDB,
    IDBCursor,
    IDBCursorWithValue,
    IDBDatabase,
    IDBFactory,
    IDBIndex,
    IDBKeyRange,
    IDBObjectStore,
    IDBOpenDBRequest,
    IDBRecord,
    IDBRequest,
    IDBTransaction,
    IDBVersionChangeEvent,
    forceCloseDatabase,
} from "../src/index.ts";
import fakeIndexedDBDefault from "../src/index.ts";

describe("public surface", () => {
    it("exports every IDB constructor", () => {
        const exports = {
            IDBCursor,
            IDBCursorWithValue,
            IDBDatabase,
            IDBFactory,
            IDBIndex,
            IDBKeyRange,
            IDBObjectStore,
            IDBOpenDBRequest,
            IDBRecord,
            IDBRequest,
            IDBTransaction,
            IDBVersionChangeEvent,
        };

        for (const [name, value] of Object.entries(exports)) {
            assert.strictEqual(typeof value, "function", name);
        }
    });

    it("exports the factory as both a default and a named binding", () => {
        assert.strictEqual(fakeIndexedDBDefault, indexedDB);
        assert.ok(indexedDB instanceof IDBFactory);
    });

    it("exports forceCloseDatabase", () => {
        assert.strictEqual(typeof forceCloseDatabase, "function");
    });
});

interface Friend {
    id?: number;
    name: string;
    age: number;
}

describe("dexie", () => {
    // Dexie is the most widely used IndexedDB wrapper, and it leans on corners
    // of the spec -- compound indexes, key ranges, schema upgrades -- that the
    // unit tests do not reach on their own. If this breaks, something real has
    // regressed.
    it("round-trips through a Dexie database", async () => {
        await import("../src/auto.ts");
        // Named import: dexie's .d.ts declares `Dexie`, and only the runtime
        // wrapper adds a default, so the default is untyped.
        const { Dexie } = await import("dexie");
        type Table = import("dexie").Table<Friend, number>;

        // Dexie types the tables off the subclass, not off the schema string,
        // so the intersection is how you tell it what stores() just declared.
        const db = new Dexie("SmokeDatabase") as InstanceType<typeof Dexie> & {
            friends: Table;
        };
        db.version(1).stores({ friends: "++id, name, age" });

        await db.friends.add({ name: "Alice", age: 25 });
        await db.friends.add({ name: "Bob", age: 80 });

        const oldFriends = await db.friends.where("age").above(75).toArray();
        assert.strictEqual(oldFriends.length, 1);
        assert.strictEqual(oldFriends[0].name, "Bob");

        db.close();
    });
});
