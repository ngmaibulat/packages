import { defineConfig } from "tsup";

export default defineConfig({
    entry: ["src/run.ts", "src/lib.ts"],
    format: ["esm"],
    outDir: "dist",
    dts: false,
    splitting: false,
    minify: false,
    bundle: true,
    target: "esnext",
});
