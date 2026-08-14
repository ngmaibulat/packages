import test from "node:test";
import assert from "node:assert/strict";

import { getExtensions, getEvents, replaceArgs } from "@/cli/args";

test("getExtensions returns an empty list when nothing is given", () => {
    assert.deepEqual(getExtensions(undefined), []);
    assert.deepEqual(getExtensions(""), []);
});

test("getExtensions splits a comma separated list", () => {
    assert.deepEqual(getExtensions("ts"), ["ts"]);
    assert.deepEqual(getExtensions("ts,js,css"), ["ts", "js", "css"]);
});

test("getEvents defaults to all", () => {
    assert.deepEqual(getEvents(undefined), ["all"]);
    assert.deepEqual(getEvents(""), ["all"]);
});

test("getEvents accepts the documented events", () => {
    assert.deepEqual(getEvents("create"), ["create"]);
    assert.deepEqual(getEvents("create,change,delete"), [
        "create",
        "change",
        "delete",
    ]);
});

test("getEvents rejects an unknown event", () => {
    assert.throws(() => getEvents("bogus"), /Invalid event: bogus/);
    assert.throws(() => getEvents("create,bogus"), /Invalid event: bogus/);
});

test("replaceArgs substitutes %path everywhere it appears", () => {
    const args = ["-l", "%path", "prefix-%path-suffix"];
    const result = replaceArgs(args, "src/lib.ts", undefined);

    assert.deepEqual(result, [
        "-l",
        "src/lib.ts",
        "prefix-src/lib.ts-suffix",
    ]);
});

test("replaceArgs leaves the caller's array untouched", () => {
    const args = ["%path"];
    replaceArgs(args, "a.ts", undefined);

    assert.deepEqual(args, ["%path"], "input array must not be mutated");
});

test("replaceArgs only substitutes %size and %mtime when stats are given", () => {
    const mtime = new Date("2026-01-02T03:04:05Z");
    const stats = { size: 1234, mtime };

    assert.deepEqual(replaceArgs(["%size", "%mtime"], "a.ts", stats), [
        "1234",
        mtime.toString(),
    ]);

    assert.deepEqual(
        replaceArgs(["%size", "%mtime"], "a.ts", undefined),
        ["%size", "%mtime"],
        "without stats the placeholders are left alone"
    );
});
