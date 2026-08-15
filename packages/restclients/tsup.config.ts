import { defineConfig } from "tsup";

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

    // The .d.ts files come from the `tsc --emitDeclarationOnly` half of `build`.
    dts: false,

    // Load-bearing, and the reason this config is not a copy of the others. Every
    // subpath barrel re-exports HttpError from core so consumers can instanceof-check
    // without a second import. Without splitting, each of the nine bundles gets its
    // own private copy of the class and `err instanceof HttpError` is false whenever
    // the error and the check came from different subpaths.
    splitting: true,

    minify: false,
    bundle: true,

    // Not "node". This library must run in the browser too -- its tsconfig sets
    // `types: []` and pulls in lib.DOM for fetch on purpose -- so nothing here may
    // assume a Node resolution environment.
    platform: "neutral",
    target: "es2023",
});
