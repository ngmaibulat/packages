import { defineConfig } from "tsdown";

export default defineConfig({
    // `main`/`types` point at dist/readJson.*, so the entry keeps that basename.
    entry: ["src/readJson.ts"],
    format: ["esm"],
    outDir: "dist",
    dts: true,

    minify: false,
    platform: "node",
    target: "node22",

    // tsdown defaults to .mjs/.d.mts; the manifest names the plain extensions.
    outExtensions: () => ({ js: ".js", dts: ".d.ts" }),

    publint: true,
    attw: { profile: "esm-only" },
});
