import { defineConfig } from "tsdown";

export default defineConfig({
    // The one entry is also the one bin; keep this in step with `bin` in package.json.
    entry: ["src/index.ts"],
    format: ["esm"],
    outDir: "dist",

    // A CLI with no importable surface, but the .d.ts costs nothing and keeps
    // attw's esm-only profile happy.
    dts: true,

    minify: false,
    platform: "node",
    target: "node22",

    outExtensions: () => ({ js: ".js", dts: ".d.ts" }),

    publint: true,
    attw: { profile: "esm-only" },
});
