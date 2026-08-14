import test from "node:test";
import assert from "node:assert/strict";

import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";

import { VT } from "@/vt";

const node = process.execPath;

test("spawn captures output and reports a clean exit", async () => {
    const vt = new VT();
    await vt.spawn(node, ["-e", "process.stdout.write('hello from the pty')"]);

    assert.match(vt.output(), /hello from the pty/);
    assert.equal(vt.exitCode, 0);
    assert.equal(vt.running, false, "running flips back to false on exit");
});

test("the child is given a real tty", async () => {
    const vt = new VT();
    await vt.spawn(node, [
        "-e",
        "process.stdout.write('isTTY=' + (process.stdout.isTTY === true))",
    ]);

    assert.match(vt.output(), /isTTY=true/);
});

test("a non-zero exit code is propagated", async () => {
    const vt = new VT();
    await vt.spawn(node, ["-e", "process.exit(42)"]);

    assert.equal(vt.exitCode, 42);
});

test("output is buffered across multiple writes", async () => {
    const vt = new VT();
    await vt.spawn(node, [
        "-e",
        "process.stdout.write('one'); process.stdout.write('two'); process.stdout.write('three')",
    ]);

    assert.match(vt.output(), /one.*two.*three/s);
    assert.ok(vt.buffer.length >= 1);
});

test("spawn honours the cwd it was constructed with", async (t) => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "run-vt-cwd-"));
    t.after(() => fs.rm(dir, { recursive: true, force: true }));

    const vt = new VT("xterm-color", 80, 40, dir);
    await vt.spawn(node, ["-e", "process.stdout.write(process.cwd())"]);

    // macOS reports /private/var for /var, so compare the realpath
    assert.match(vt.output(), new RegExp(path.basename(dir)));
});

test("env is passed through to the child", async () => {
    const vt = new VT("xterm-color", 80, 40, process.cwd(), {
        ...process.env,
        RUN_TEST_MARKER: "marker-value",
    });

    await vt.spawn(node, [
        "-e",
        "process.stdout.write(process.env.RUN_TEST_MARKER ?? 'unset')",
    ]);

    assert.match(vt.output(), /marker-value/);
});

// This is the reason VT exists in its current shape: programs such as `glow`
// emit a Device Status Report and block until the terminal answers. node-pty
// does not answer it, so VT does -- and keeps the query out of the output.
test("a Device Status Report is answered and stripped", { timeout: 20_000 }, async () => {
    const vt = new VT();

    // raw mode matters: in canonical mode the tty would hold the reply in its
    // line buffer until a newline arrives, which never comes. Real DSR users
    // such as `glow` put the terminal in raw mode for the same reason.
    await vt.spawn(node, [
        "-e",
        `process.stdin.setRawMode(true);
         process.stdin.setEncoding('utf8');
         process.stdin.on('data', (d) => {
             if (d.includes('R')) { process.stdout.write('REPLY_SEEN'); process.exit(0); }
         });
         process.stdout.write('\\x1B[6n');`,
    ]);

    const out = vt.output();

    assert.match(out, /REPLY_SEEN/, "VT must answer the cursor position request");
    assert.ok(
        !out.includes("\x1B[6n"),
        "the DSR query itself must not leak into the captured output"
    );
    assert.equal(vt.exitCode, 0);
});

test("a program that emits no DSR is unaffected", async () => {
    const vt = new VT();
    await vt.spawn(node, ["-e", "process.stdout.write('\\x1B[32mgreen\\x1B[0m')"]);

    assert.ok(
        vt.output().includes("\x1B[32m"),
        "ordinary ANSI escapes are preserved verbatim"
    );
});

// A pty spawn does not fail the way child_process does: the fork succeeds and
// the exec fails inside the child, so this surfaces as output plus rc=1 rather
// than a rejected promise. `run` therefore logs a normal record for a typo'd
// command instead of crashing.
test("a missing executable surfaces as rc=1, not a rejection", async () => {
    const vt = new VT();
    await vt.spawn("definitely-not-a-real-binary-xyz", []);

    assert.equal(vt.exitCode, 1);
    assert.match(vt.output(), /No such file or directory/i);
});
