import { defineConfig } from "tsdown";

export default defineConfig({
    // Four bins, no library surface. Keep in step with `bin` in package.json.
    entry: [
        "src/ubuntu-mysql.ts",
        "src/ubuntu-vim.ts",
        "src/c-vim.ts",
        "src/gen-pw.ts",
    ],
    format: ["esm"],
    outDir: "dist",

    // Pure CLI: no importable surface, so no declarations and no attw.
    dts: false,

    minify: false,
    platform: "node",
    target: "node22",

    // Replaces the old `tsc` -> `js/` -> rollup -> `dist/*.mjs` chain, which
    // shelled out to an undeclared global rollup and ran `git add .`.
    outExtensions: () => ({ js: ".js", dts: ".d.ts" }),

    publint: true,
});
