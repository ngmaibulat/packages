import { defineConfig } from "tsdown";

export default defineConfig({
    // The one entry is also the `wdc` bin. Keep in step with `bin` in package.json.
    entry: ["src/index.ts"],
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
