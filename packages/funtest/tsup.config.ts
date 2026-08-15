import { defineConfig } from "tsup";

export default defineConfig({
    // The published artifact is the test files themselves -- bin/run.sh executes
    // dist/*.test.js. utils.ts and sample/*.ts get inlined into each one.
    entry: ["src/*.test.ts"],
    format: ["esm"],
    outDir: "dist",

    // Nothing here is a library: no types are exported and none are published.
    dts: false,

    splitting: false,
    minify: false,
    bundle: true,
    platform: "node",
    target: "node22",

    // The suites import node:test and node:assert/strict.
    removeNodeProtocol: false,
});
