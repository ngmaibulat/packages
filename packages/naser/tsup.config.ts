import { defineConfig } from "tsup";
import { exec } from "node:child_process";

export default defineConfig({
    entry: ["src/index.ts"],
    format: ["esm"],
    outDir: "dist",
    dts: false,
    splitting: false,
    minify: false,
    bundle: true,
    platform: "node",
    target: "node22",

    // tsup strips the "node:" prefix by default; keep it so builtin imports
    // stay unambiguous (and so "node:sqlite" style specifiers keep working).
    removeNodeProtocol: false,

    onSuccess: async () => {
        exec("chmod +x dist/index.js");
    },
});
