import { defineConfig } from "tsup";
import { execFileSync } from "node:child_process";

export default defineConfig({
    entry: [
        "src/index.ts",

        "src/bin/httpc.ts",
        "src/bin/get.ts",
        "src/bin/post.ts",
        "src/bin/put.ts",
        "src/bin/delete.ts",
        "src/bin/options.ts",
        "src/bin/query.ts",

        // Not in the `bin` map -- they would shadow coreutils `head` and GNU `patch`
        // -- but `httpc link head patch` symlinks them out of dist/bin at runtime, so
        // they still have to be built.
        "src/bin/head.ts",
        "src/bin/patch.ts",
    ],
    format: ["esm"],
    outDir: "dist",

    // The .d.ts files come from the `tsc --emitDeclarationOnly` half of `build`.
    dts: false,

    splitting: false,
    minify: false,
    bundle: true,
    platform: "node",
    target: "node22",

    // tsup strips the "node:" prefix by default, which rewrites builtin imports to
    // bare specifiers that resolve to nothing at runtime.
    removeNodeProtocol: false,

    // tsc and esbuild both preserve the shebang but neither sets the executable bit.
    // postbuild.mjs does that, and hard-fails if a bin ever loses its shebang. Run it
    // synchronously, not through a detached exec: it is a gate, and a gate whose exit
    // code nothing waits for is not a gate.
    onSuccess: async () => {
        execFileSync("node", ["scripts/postbuild.mjs"], { stdio: "inherit" });
    },
});
