import test from "node:test";
import assert from "node:assert/strict";

import { cleanVars } from "@/lib";

test("cleanVars keeps only PATH, HOME and SHELL", (t) => {
    const original = { ...process.env };

    t.after(() => {
        for (const key of Object.keys(process.env)) {
            delete process.env[key];
        }
        Object.assign(process.env, original);
    });

    process.env.PATH = "/usr/bin";
    process.env.HOME = "/home/tester";
    process.env.SHELL = "/bin/bash";
    process.env.RUN_TEST_SECRET = "should-be-removed";
    process.env.ANOTHER_ONE = "also-removed";

    cleanVars();

    assert.equal(process.env.PATH, "/usr/bin");
    assert.equal(process.env.HOME, "/home/tester");
    assert.equal(process.env.SHELL, "/bin/bash");
    assert.equal(process.env.RUN_TEST_SECRET, undefined);
    assert.equal(process.env.ANOTHER_ONE, undefined);

    assert.deepEqual(
        Object.keys(process.env).sort(),
        ["HOME", "PATH", "SHELL"],
        "nothing else may survive"
    );
});
