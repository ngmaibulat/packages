import { defineConfig } from "tsdown";

export default defineConfig({
    // Single entry. src/index.ts is the composition root: it re-exports the
    // public surface from entry.ts and pulls database-extras and async-iterators
    // in for their side effects. See the sideEffects note in package.json.
    entry: ["src/index.ts"],
    format: ["esm"],
    outDir: "dist",

    dts: true,
    minify: false,

    // Not "node". This library only runs where IndexedDB exists, so its tsconfig
    // sets `types: []` and pulls lib.DOM in for IDBFactory & co. Nothing here may
    // assume a Node resolution environment. Same reasoning as restclients.
    platform: "neutral",
    target: "es2023",

    // tsdown defaults to .mjs/.d.mts; `main`, `types` and the exports map all
    // name the plain extensions.
    outExtensions: () => ({ js: ".js", dts: ".d.ts" }),

    publint: true,
    attw: { profile: "esm-only" },
});
