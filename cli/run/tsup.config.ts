import { defineConfig } from "tsup";
import { exec } from "node:child_process";

export default defineConfig({
    entry: [
        "src/lib.ts",

        "src/cli/run.ts",
        "src/cli/logview.ts",
        "src/cli/output.ts",
        "src/cli/shell.ts",

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
        exec("chmod +x dist/cli/*.js");
    },

    // esbuildOptions(options) {
    //     options.outExtension = { ".js": ".js" }; // Preserve .js extension in imports
    // },
});
