import test from "node:test";
import assert from "node:assert/strict";

import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";

import { convert, convertFile } from "@/lib";

const ESC = String.fromCharCode(27);

test("a colour escape becomes a styled span", () => {
    const html = convert(`${ESC}[32mHello${ESC}[0m`);

    assert.match(html, /^<span style="color:[^"]+">Hello<\/span>$/);
    assert.ok(!html.includes(ESC), "no escape sequence may survive");
});

test("text without escapes is passed through unchanged", () => {
    assert.equal(convert("plain text"), "plain text");
    assert.equal(convert(""), "");
});

test("newlines are preserved", () => {
    assert.equal(convert("a\nb"), "a\nb");
});

test("several colours produce several spans", () => {
    const html = convert(`${ESC}[31mred${ESC}[0m and ${ESC}[34mblue${ESC}[0m`);
    const spans = html.match(/<span /g) ?? [];

    assert.equal(spans.length, 2);
    assert.match(html, /red/);
    assert.match(html, /blue/);
    assert.match(html, / and /);
});

// Documented, deliberate: anser does not escape markup. Anything piped through
// naser is trusted content, not arbitrary untrusted input.
test("existing markup is not escaped", () => {
    assert.equal(convert("<b>x</b>"), "<b>x</b>");
});

test("convertFile reads and converts a file from disk", async (t) => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "naser-"));
    t.after(() => fs.rm(dir, { recursive: true, force: true }));

    const file = path.join(dir, "out.txt");
    await fs.writeFile(file, `${ESC}[32m Hello ${ESC}[0m`, "utf-8");

    const html = await convertFile(file);

    assert.match(html, /<span style="color:[^"]+"> Hello <\/span>/);
});

test("convertFile rejects on a missing file", async () => {
    await assert.rejects(
        () => convertFile("/nonexistent/definitely-not-here.txt"),
        /ENOENT/
    );
});
