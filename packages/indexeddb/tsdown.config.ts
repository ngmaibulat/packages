import { defineConfig } from "tsdown";

export default defineConfig({
    // Single entry. src/index.ts is the composition root: it re-exports the
    // public surface from entry.ts and pulls database-extras and async-iterators
    // in for their side effects -- each installs proxy traps via replaceTraps.
    // That is why package.json must NOT declare `sideEffects: false`: a bundler
    // taking that at its word could drop those imports and silently remove the
    // db.get shortcuts and the async iterators.
    //
    // src/nexie.ts is the second, high-level root (the `./nexie` subpath). The
    // two graphs are deliberately DISJOINT -- nothing under src/nexie/ imports
    // entry.ts, wrap-idb-value.ts or util.ts. tsdown's code splitting is
    // unconditional, so any shared module would become a chunk that dist/index.js
    // then has to import; keeping them separate is what guarantees the low-level
    // bundle is byte-identical to what it was before Nexie existed. The
    // separation is also required rather than merely tidy: promisifyRequest
    // returns a NATIVE promise, and `await` on one of those bypasses `.then`,
    // which would kill Nexie's transaction zone on every request.
    entry: ["src/index.ts", "src/nexie.ts"],
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
