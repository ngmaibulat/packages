import { defineConfig } from "tsup";

export default defineConfig({
    entry: [
        "src/run.ts",
        "src/lib.ts",
        "src/tests/runvt.ts",
        "src/tests/watch.ts",
    ],
    format: ["esm"],
    outDir: "dist",
    dts: false,
    splitting: false,
    minify: false,
    bundle: true,
    target: "esnext",

    // esbuildOptions(options) {
    //     options.outExtension = { ".js": ".js" }; // Preserve .js extension in imports
    // },
});
