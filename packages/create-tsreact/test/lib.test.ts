import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { detectPm } from "@/pm/pm.js";
import { infer } from "@/bruno/infer.js";
import encodePng from "@/png/png.js";
import icon from "@/png/icon.js";

describe("detectPm", () => {
    // The user agent is the only thing that distinguishes "npm create tsreact"
    // from "pnpm create tsreact" - argv looks identical either way.
    it("reads the launcher out of npm_config_user_agent", () => {
        assert.equal(detectPm("npm/10.9.0 node/v26.3.0").name, "npm");
        assert.equal(detectPm("yarn/4.5.0 npm/? node/v26.3.0").name, "yarn");
        assert.equal(detectPm("bun/1.1.30 npm/? node/v26.3.0").name, "bun");
        assert.equal(detectPm("pnpm/11.6.0 npm/? node/v26.3.0").name, "pnpm");
    });

    // Not npm: the generated workspaces are built around pnpm, and an unset
    // agent means no package manager launched us at all.
    it("falls back to pnpm for an unset or unknown agent", () => {
        assert.equal(detectPm("").name, "pnpm");
        assert.equal(detectPm(undefined).name, "pnpm");
        assert.equal(detectPm("cargo/1.0.0").name, "pnpm");
    });

    it("spells run commands the way each tool wants them", () => {
        assert.equal(detectPm("npm/10.9.0").run("build"), "npm run build");
        assert.equal(detectPm("pnpm/11.6.0").run("build"), "pnpm build");
        assert.equal(detectPm("npm/10.9.0").dlx, "npx");
        assert.equal(detectPm("bun/1.1.30").dlx, "bunx");
    });
});

describe("infer", () => {
    it("names the primitives", () => {
        assert.equal(infer(["a"]), "string");
        assert.equal(infer([1]), "number");
        assert.equal(infer([true]), "boolean");
        assert.equal(infer([null]), "null");
    });

    it("falls back to unknown with nothing to go on", () => {
        assert.equal(infer([]), "unknown");
    });

    it("builds an object type from the sampled keys", () => {
        assert.equal(infer([{ id: 1, name: "x" }]), "{\n    id: number;\n    name: string;\n}");
    });

    // A key missing from any one sample is optional, not absent - this is what
    // keeps a generated client honest about a field the API omits sometimes.
    it("marks a key absent from some samples as optional", () => {
        assert.match(infer([{ id: 1, name: "x" }, { id: 2 }]), /name\?: string;/);
    });

    it("infers an array's element type", () => {
        assert.equal(infer([[1, 2]]), "number[]");
    });
});

describe("encodePng", () => {
    const size = 4;
    const rgba = Buffer.alloc(size * size * 4, 0x7f);

    it("emits the PNG signature", () => {
        const png = encodePng(size, rgba);
        assert.deepEqual([...png.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    });

    it("emits IHDR first and IEND last", () => {
        const png = encodePng(size, rgba);
        assert.equal(png.subarray(12, 16).toString("ascii"), "IHDR");
        assert.equal(png.subarray(png.length - 8, png.length - 4).toString("ascii"), "IEND");
    });

    it("records the size in IHDR", () => {
        const png = encodePng(size, rgba);
        assert.equal(png.readUInt32BE(16), size);
        assert.equal(png.readUInt32BE(20), size);
    });
});

describe("icon", () => {
    // The scaffolded PWA icons are generated rather than shipped as assets, so
    // the same app name must keep producing the same file.
    it("is deterministic for a given name and size", () => {
        assert.deepEqual(icon("myapp", 64), icon("myapp", 64));
    });

    it("differs between names and between maskable variants", () => {
        assert.notDeepEqual(icon("myapp", 64), icon("otherapp", 64));
        assert.notDeepEqual(icon("myapp", 64), icon("myapp", 64, true));
    });

    it("returns a decodable PNG", () => {
        const png = icon("myapp", 64);
        assert.deepEqual([...png.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
        assert.equal(png.readUInt32BE(16), 64);
    });
});
