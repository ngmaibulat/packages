import test from "node:test";
import assert from "node:assert/strict";

import os from "node:os";
import path from "node:path";
import { statSync } from "node:fs";

import { pad, getLogFileName, getLogDir, getLogFile } from "@/logging/logging";

test("pad left-pads to two digits", () => {
    assert.equal(pad(0), "00");
    assert.equal(pad(5), "05");
    assert.equal(pad(12), "12");
    assert.equal(pad(123), "123", "longer values are passed through");
});

test("getLogFileName embeds a sortable timestamp and the command", () => {
    const name = getLogFileName("ls");

    assert.match(
        name,
        /^run-\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}-ls\.log$/,
        `unexpected log file name: ${name}`
    );
});

test("getLogDir points at the XDG state dir and creates it", async () => {
    const dir = await getLogDir();

    assert.equal(dir, path.join(os.homedir(), ".local", "state", "ngm", "logs"));
    assert.ok(path.isAbsolute(dir));
    assert.ok(statSync(dir).isDirectory(), "log dir should exist after the call");

    // mkdir is recursive, so calling it again must not throw
    assert.equal(await getLogDir(), dir);
});

test("getLogFile joins the log dir and the generated name", async () => {
    const dir = await getLogDir();
    const full = await getLogFile("node");

    assert.ok(full.startsWith(dir), `${full} should live under ${dir}`);
    assert.match(path.basename(full), /^run-.*-node\.log$/);
});
