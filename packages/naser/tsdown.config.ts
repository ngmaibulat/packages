import { defineConfig } from "tsdown";

export default defineConfig({
    // src/lib.ts is here for the declaration, not the bundle: `types` points at
    // dist/lib.d.ts, and tsdown emits declarations per entry. The old `tsc &&
    // tsup` build got that file for free because tsc emitted every source file.
    entry: ["src/index.ts", "src/lib.ts"],
    format: ["esm"],
    outDir: "dist",
    dts: true,
    minify: false,
    platform: "node",
    target: "node22",

    // tsdown defaults to .mjs/.d.mts. This package is "type": "module" and both
    // `main` and `bin` name dist/index.js, so pin the plain extensions.
    outExtensions: () => ({ js: ".js", dts: ".d.ts" }),

    // `esm-only` because this package ships no CJS build; the default profile flags
    // the root entry for resolving to ESM from a CJS import, which is the point.
    publint: true,
    attw: { profile: "esm-only" },

    // No chmod hook: tsdown sets the executable bit on every entry that starts
    // with a shebang, which src/index.ts does.
});
