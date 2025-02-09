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
    target: "esnext",

    onSuccess: async () => {
        exec("chmod +x dist/index.js");
    },
});
