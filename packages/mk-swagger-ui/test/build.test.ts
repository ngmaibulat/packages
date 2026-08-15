import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { BUNDLE_NAME, scalarBundle, scalarDir } from "@/assets";
import { build, documentTitle, readDocument } from "@/build";
import { CliError } from "@/errors";

const fixture = path.resolve(import.meta.dirname, "../fixtures/openapi.yaml");

/**
 * Everything here writes into a mkdtemp directory and reads @scalar/api-reference
 * out of node_modules, so the suite stays hermetic -- which is what root
 * `pnpm run test` gates on.
 */
async function tmpdir(t: { after: (fn: () => void | Promise<void>) => void }) {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mk-swagger-ui-"));

    t.after(() => fs.rm(dir, { recursive: true, force: true }));

    return dir;
}

test("scalarDir finds the package root despite its gated exports map", async () => {
    const manifest = JSON.parse(
        await fs.readFile(path.join(scalarDir(), "package.json"), "utf8")
    );

    assert.equal(manifest.name, "@scalar/api-reference");
});

test("scalarBundle resolves to the standalone browser build", async () => {
    assert.ok((await fs.stat(scalarBundle())).isFile());
});

test("the standalone bundle loads no chunks of its own", async () => {
    // standalone.esm.js lazy-loads ~90 files out of chunks/; copying that one
    // would produce a folder that 404s the moment anything is clicked.
    const code = await fs.readFile(scalarBundle(), "utf8");

    assert.doesNotMatch(code, /chunks\/[A-Za-z0-9._-]+\.js/);
});

test("build writes the bundle, the page, the initializer and the spec", async (t) => {
    const dir = await tmpdir(t);
    const outDir = path.join(dir, "dist");

    const result = await build({ input: fixture, outDir });

    assert.equal(result.specFile, "openapi.json");

    const entries = (await fs.readdir(outDir)).sort();

    assert.deepEqual(entries, [
        "index.html",
        "openapi.json",
        BUNDLE_NAME,
        "scalar-initializer.js",
    ].sort());
});

test("build converts the YAML document to JSON", async (t) => {
    const dir = await tmpdir(t);
    const outDir = path.join(dir, "dist");

    await build({ input: fixture, outDir });

    const json = JSON.parse(
        await fs.readFile(path.join(outDir, "openapi.json"), "utf8")
    );

    assert.equal(json.info.title, "Pet Store");
    assert.ok(json.components.schemas.Pet);
});

test("build copies the bundle byte for byte", async (t) => {
    const dir = await tmpdir(t);
    const outDir = path.join(dir, "dist");

    await build({ input: fixture, outDir });

    const source = await fs.readFile(scalarBundle());
    const copied = await fs.readFile(path.join(outDir, BUNDLE_NAME));

    assert.ok(source.equals(copied));
});

test("build titles the page from the document", async (t) => {
    const dir = await tmpdir(t);
    const outDir = path.join(dir, "dist");

    const result = await build({ input: fixture, outDir });

    assert.equal(result.title, "Pet Store");
    assert.match(
        await fs.readFile(path.join(outDir, "index.html"), "utf8"),
        /<title>Pet Store<\/title>/
    );
});

test("documentTitle falls back to the filename", () => {
    assert.equal(documentTitle({}, "/tmp/my-api.yaml"), "my-api");
    assert.equal(documentTitle(null, "/tmp/my-api.yaml"), "my-api");
    assert.equal(documentTitle({ info: {} }, "/tmp/my-api.yaml"), "my-api");
    assert.equal(documentTitle({ info: { title: "  " } }, "/tmp/my-api.yaml"), "my-api");
});

test("the generated site references nothing off-host by default", async (t) => {
    const dir = await tmpdir(t);
    const outDir = path.join(dir, "dist");

    await build({ input: fixture, outDir });

    const html = await fs.readFile(path.join(outDir, "index.html"), "utf8");
    const init = await fs.readFile(
        path.join(outDir, "scalar-initializer.js"),
        "utf8"
    );

    assert.doesNotMatch(html, /https?:\/\//);
    assert.match(init, /withDefaultFonts: false/);
});

test("build --fonts opts into the hosted webfonts", async (t) => {
    const dir = await tmpdir(t);
    const outDir = path.join(dir, "dist");

    await build({ input: fixture, outDir, fonts: true });

    assert.match(
        await fs.readFile(path.join(outDir, "scalar-initializer.js"), "utf8"),
        /withDefaultFonts: true/
    );
});

test("build names the spec after the input file", async (t) => {
    const dir = await tmpdir(t);
    const input = path.join(dir, "my-api.yaml");

    await fs.copyFile(fixture, input);

    const result = await build({ input, outDir: path.join(dir, "dist") });

    assert.equal(result.specFile, "my-api.json");
    assert.match(
        await fs.readFile(path.join(dir, "dist", "scalar-initializer.js"), "utf8"),
        /url: "my-api\.json"/
    );
});

test("build writes nothing outside the output directory", async (t) => {
    const dir = await tmpdir(t);

    await build({ input: fixture, outDir: path.join(dir, "dist") });

    assert.deepEqual(await fs.readdir(dir), ["dist"]);
});

test("build refuses an output directory that already exists", async (t) => {
    const dir = await tmpdir(t);
    const outDir = path.join(dir, "dist");

    await fs.mkdir(outDir);

    await assert.rejects(() => build({ input: fixture, outDir }), {
        name: "CliError",
        message: /already exists/,
    });
});

test("build --force writes into an existing output directory", async (t) => {
    const dir = await tmpdir(t);
    const outDir = path.join(dir, "dist");

    await fs.mkdir(outDir);
    await fs.writeFile(path.join(outDir, "keep.txt"), "kept");

    await build({ input: fixture, outDir, force: true });

    assert.equal(await fs.readFile(path.join(outDir, "keep.txt"), "utf8"), "kept");
    assert.ok((await fs.readdir(outDir)).includes("index.html"));
});

test("readDocument reports a missing input with exit code 1", async () => {
    await assert.rejects(() => readDocument("/nope/missing.yaml"), (err: unknown) => {
        assert.ok(err instanceof CliError);
        assert.equal(err.code, 1);
        assert.match(err.message, /does not exist/);
        return true;
    });
});

test("readDocument reports an unparseable document with exit code 2", async (t) => {
    const dir = await tmpdir(t);
    const input = path.join(dir, "broken.yaml");

    await fs.writeFile(input, "paths:\n  - a\n  b: [unclosed\n");

    await assert.rejects(() => readDocument(input), (err: unknown) => {
        assert.ok(err instanceof CliError);
        assert.equal(err.code, 2);
        return true;
    });
});
