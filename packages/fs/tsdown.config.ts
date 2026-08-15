import { defineConfig } from "tsdown";

export default defineConfig({
    entry: [
        // The library surface; `main`/`types`/`exports` all point here.
        "src/index.ts",

        // The one bin. Keep in step with `bin` in package.json.
        "src/bin/fs.ts",
    ],
    format: ["esm"],
    outDir: "dist",
    dts: true,

    minify: false,
    platform: "node",
    target: "node22",

    outExtensions: () => ({ js: ".js", dts: ".d.ts" }),

    publint: true,
    attw: { profile: "esm-only" },
});
