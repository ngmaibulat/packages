import { defineConfig } from "tsdown";

export default defineConfig({
    // The one entry is also the `ctl-ufw` bin.
    entry: ["src/ufw.ts"],
    format: ["esm"],
    outDir: "dist",

    // Pure CLI: no importable surface, so no declarations and no attw.
    dts: false,

    minify: false,
    platform: "node",
    target: "node22",

    outExtensions: () => ({ js: ".js", dts: ".d.ts" }),

    publint: true,
});
