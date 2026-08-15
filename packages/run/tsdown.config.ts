import { defineConfig } from "tsdown";

export default defineConfig({
    entry: [
        "src/lib.ts",

        "src/cli/run.ts",
        "src/cli/logview.ts",
        "src/cli/output.ts",
        "src/cli/shell.ts",

        "src/tests/runvt.ts",
        "src/tests/watch.ts",
        "src/tests/sql.ts",
    ],
    format: ["esm"],
    outDir: "dist",

    // Replaces the `tsc` half of the old `tsc && tsup` build. `types` points at
    // dist/lib.d.ts, which is why src/lib.ts has to stay an entry.
    dts: true,

    minify: false,
    platform: "node",
    target: "node22",

    // tsdown defaults to .mjs/.d.mts. This package is "type": "module" and its
    // `bin` map names dist/cli/*.js, so pin the plain extensions.
    outExtensions: () => ({ js: ".js", dts: ".d.ts" }),

    // `esm-only` because this package ships no CJS build; the default profile flags
    // the root entry for resolving to ESM from a CJS import, which is the point.
    publint: true,
    attw: { profile: "esm-only" },

    // No chmod hook here on purpose: tsdown sets the executable bit on every
    // entry that starts with a shebang. The old tsup config shelled out to
    // `chmod +x` and never awaited it.
});
