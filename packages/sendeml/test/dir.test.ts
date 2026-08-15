import assert from "node:assert";
import test from "node:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { isDir } from "@/utils/dir";

test("test existing dir", async () => {
    // The original asserted on "./queue", which only exists after getsamples.sh
    // has downloaded a corpus into the package root. Use a temp dir so the
    // suite stays hermetic and cwd-independent.
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "sendeml-"));

    try {
        const res = await isDir(dir);
        assert.equal(res, true);
    } finally {
        await fs.rm(dir, { recursive: true, force: true });
    }
});

test("test non-existent dir", async () => {
    const res = await isDir("./Karamba");
    assert.equal(res, false);
});

test("test throw error", async () => {
    async function shouldFail() {
        const res = await isDir("");
    }

    assert.rejects(shouldFail, {
        message: "Invalid Argument",
    });
});

test("test throw simple error", async () => {
    async function shouldFail() {
        throw new Error("Invalid Argument");
    }

    const err = new Error("Invalid Argument");

    assert.rejects(shouldFail, err);
});
