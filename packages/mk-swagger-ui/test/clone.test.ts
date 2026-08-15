import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { clean } from "@/clean";
import { clone, isRepoName, REPOS } from "@/clone";
import { CliError } from "@/errors";

// `clone` itself is not exercised here: it shells out to `git clone` over the
// network, and root `pnpm run test` is hermetic. Only the parts that decide
// what it would do are covered.

test("every repo declares the directory git clone would create", () => {
    for (const [name, repo] of Object.entries(REPOS)) {
        assert.equal(
            repo.dir,
            repo.url.split("/").pop(),
            `${name} names a directory git clone would not create`
        );
    }
});

test("isRepoName accepts the known targets and nothing else", () => {
    assert.ok(isRepoName("ui"));
    assert.ok(isRepoName("scalar"));
    assert.ok(!isRepoName("nonsense"));
    assert.ok(!isRepoName("toString"));
});

test("clone rejects an unknown target without running git", () => {
    assert.throws(() => clone("nonsense"), (err: unknown) => {
        assert.ok(err instanceof CliError);
        assert.equal(err.code, 1);
        assert.match(err.message, /unknown target/);
        return true;
    });
});

test("clean removes every directory get clones and nothing else", async (t) => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mk-swagger-ui-"));
    t.after(() => fs.rm(dir, { recursive: true, force: true }));

    for (const repo of Object.values(REPOS)) {
        await fs.mkdir(path.join(dir, repo.dir));
    }

    await fs.mkdir(path.join(dir, "keep-me"));

    const removed = await clean(dir);

    assert.deepEqual(
        removed.sort(),
        Object.values(REPOS)
            .map((r) => r.dir)
            .sort()
    );
    assert.deepEqual(await fs.readdir(dir), ["keep-me"]);
});

test("clean is quiet when there is nothing to remove", async (t) => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mk-swagger-ui-"));
    t.after(() => fs.rm(dir, { recursive: true, force: true }));

    assert.deepEqual(await clean(dir), []);
});
