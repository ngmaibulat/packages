import { defineConfig } from "tsdown";

export default defineConfig({
    // The published artifact is the test files themselves -- bin/run.sh executes
    // dist/*.test.js. utils.ts and sample/*.ts are shared by several of them, so
    // tsdown hoists them into chunks; the glob in run.sh only matches *.test.js,
    // which no chunk filename ever does.
    entry: ["src/*.test.ts"],
    format: ["esm"],
    outDir: "dist",

    // Nothing here is a library: no types are exported and none are published.
    dts: false,

    minify: false,
    platform: "node",
    target: "node22",

    // tsdown defaults to .mjs. bin/run.sh globs dist/*.test.js.
    outExtensions: () => ({ js: ".js" }),

    // publint only. `attw` is not enabled here because its only finding is
    // "Package has no types", which is the design: what ships is compiled test
    // files, not a library.
    publint: true,
});
