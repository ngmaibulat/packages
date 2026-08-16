import { defineConfig } from "tsdown";

export default defineConfig({
    // Two entries: the library, and the side-effect module that installs it
    // onto globalThis. Upstream hand-maintained the second as auto/index.mjs
    // naming files inside build/; here it is a normal entry.
    entry: ["src/index.ts", "src/auto.ts"],
    format: ["esm"],
    outDir: "dist",

    // The public types are hand-written (types.d.ts), and deliberately so: they
    // describe the DOM API this package implements -- `typeof IDBFactory` and
    // friends -- rather than the FDB* classes that happen to implement it. That
    // is what makes it a drop-in for real IndexedDB. Generating declarations
    // from the sources would leak the implementation shape instead.
    dts: false,
    minify: false,

    // Not "node". This is an implementation of a browser API and must run in a
    // browser and a worker as readily as in Node or Bun. Same reasoning as
    // restclients and indexeddb.
    platform: "neutral",
    target: "es2023",

    // tsdown defaults to .mjs; `main` and the exports map name plain .js.
    outExtensions: () => ({ js: ".js", dts: ".d.ts" }),

    publint: true,
    attw: { profile: "esm-only" },
});
