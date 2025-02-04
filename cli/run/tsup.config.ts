import { defineConfig } from "tsup";
import { exec } from "node:child_process";

export default defineConfig({
    entry: [
        "src/run.ts",
        "src/lib.ts",
        "src/tests/runvt.ts",
        "src/tests/watch.ts",
        "src/tests/sql.ts",
    ],
    format: ["esm"],
    outDir: "dist",
    dts: false,
    splitting: false,
    minify: false,
    bundle: true,
    target: "esnext",

    onSuccess: async () => {
        exec("chmod +x dist/tests/*.js");
        exec("chmod +x dist/run.js");
    },

    // esbuildOptions(options) {
    //     options.outExtension = { ".js": ".js" }; // Preserve .js extension in imports
    // },
});
