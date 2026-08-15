import { defineConfig } from "tsdown";

export default defineConfig({
    entry: ["src/index.ts"],
    format: ["esm"],
    outDir: "dist",

    // Replaces the old two-step build (esbuild CLI for the JS, a separate
    // `tsc -p tsc-types.json` for the declarations). tsdown emits both.
    dts: true,

    minify: false,
    platform: "node",
    target: "node22",

    // tsdown defaults to .mjs/.d.mts; `main`/`types` name the plain extensions.
    outExtensions: () => ({ js: ".js", dts: ".d.ts" }),

    publint: true,
    attw: { profile: "esm-only" },
});
