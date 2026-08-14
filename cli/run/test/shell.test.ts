import test from "node:test";
import assert from "node:assert/strict";

import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import type readline from "node:readline";

import { checkExe, findExe } from "@/shell/lib";
import { mapCommands, pwd, cd } from "@/shell/commands";

// the built-ins only touch `rl` in `exit`, which is not exercised here
const rl = null as unknown as readline.Interface;

test("checkExe accepts an executable file", async () => {
    assert.equal(await checkExe(process.execPath), true);
});

test("checkExe rejects a missing path", async () => {
    assert.equal(await checkExe("/nonexistent/definitely-not-here"), false);
});

test("checkExe rejects a file without the execute bit", async (t) => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "run-shell-"));
    t.after(() => fs.rm(dir, { recursive: true, force: true }));

    const file = path.join(dir, "plain.txt");
    await fs.writeFile(file, "not executable", { mode: 0o644 });

    assert.equal(await checkExe(file), false);
});

test("findExe locates a command on the given PATH", async () => {
    const dir = path.dirname(process.execPath);
    const cmd = path.basename(process.execPath);

    assert.equal(await findExe(cmd, `/nonexistent:${dir}`), true);
});

test("findExe returns false for an unknown command", async () => {
    assert.equal(
        await findExe("definitely-not-a-real-binary-xyz", process.env.PATH ?? ""),
        false
    );
});

test("findExe returns false on an empty PATH", async () => {
    assert.equal(await findExe("node", ""), false);
});

test("the built-in table exposes exit, pwd and cd", () => {
    assert.deepEqual([...mapCommands.keys()].sort(), ["cd", "exit", "pwd"]);
});

test("pwd succeeds", () => {
    assert.equal(pwd([], rl), 0);
});

test("cd rejects anything but exactly one argument", () => {
    assert.equal(cd([], rl), 1);
    assert.equal(cd(["a", "b"], rl), 1);
});

test("cd changes the working directory", async (t) => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "run-shell-cd-"));
    const original = process.cwd();

    t.after(async () => {
        process.chdir(original);
        await fs.rm(dir, { recursive: true, force: true });
    });

    assert.equal(cd([dir], rl), 0);
    assert.equal(path.basename(process.cwd()), path.basename(dir));
});
