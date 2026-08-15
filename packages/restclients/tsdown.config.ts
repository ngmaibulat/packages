import { defineConfig } from "tsdown";

export default defineConfig({
    // One entry per subpath in the `exports` map. There is deliberately no root
    // entry -- `"." : null` blocks the bare import.
    entry: [
        "src/core/index.ts",
        "src/jsonplaceholder/index.ts",
        "src/reqres/index.ts",
        "src/dummyjson/index.ts",
        "src/httpbin/index.ts",
        "src/github/index.ts",
        "src/ipinfo/index.ts",
        "src/openmeteo/index.ts",
        "src/worldbank/index.ts",
    ],
    format: ["esm"],
    outDir: "dist",

    // Replaces `tsc -p tsconfig.json --emitDeclarationOnly`.
    dts: true,

    minify: false,

    // `sourcemap` is left at its default. tsdown emits .js.map anyway whenever
    // tsconfig sets `declarationMap`, and the .d.ts.map files are what shipped
    // before -- so the two travel together and `sourcemap: false` cannot separate
    // them. Both resolve here because `files` includes src/.

    // Not "node". This library must run in the browser too -- its tsconfig sets
    // `types: []` and pulls in lib.DOM for fetch on purpose -- so nothing here may
    // assume a Node resolution environment.
    platform: "neutral",
    target: "es2023",

    // tsdown defaults to .mjs/.d.mts; the `exports` map names dist/<name>/index.js
    // and index.d.ts.
    outExtensions: () => ({ js: ".js", dts: ".d.ts" }),

    // `esm-only` because this package is ESM-only by design: no CJS build, and the
    // `exports` map is the only entry point. The default profile would flag every
    // subpath for having no node10 resolution and for CJS resolving to ESM, neither
    // of which is a defect here.
    publint: true,
    attw: { profile: "esm-only" },

    // Note: code splitting is unconditional in tsdown, so the shared `core` chunk
    // that keeps `HttpError` a single class across all nine subpaths is structural
    // rather than a setting. ci.yml's `consumer` job asserts that identity.
});
