import { defineConfig } from "tsdown";
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

    // Replaces `tsc --emitDeclarationOnly`.
    dts: true,

    minify: false,
    platform: "node",
    target: "node22",

    // tsdown defaults to .mjs/.d.mts; the `bin` map and `exports` name plain .js
    // and .d.ts.
    outExtensions: () => ({ js: ".js", dts: ".d.ts" }),

    // `esm-only` because this package ships no CJS build; the default profile flags
    // the root entry for resolving to ESM from a CJS import, which is the point.
    publint: true,
    attw: { profile: "esm-only" },

    // Splitting is unconditional in tsdown, so cli.ts and friends land in a shared
    // chunk instead of being inlined into all ten entries. Keep those chunks out of
    // dist/bin: scripts/postbuild.mjs treats every .js in there as a bin and fails
    // the build if it has no shebang.
    outputOptions: {
        chunkFileNames: "chunks/[name]-[hash].js",
    },

    // tsdown sets the executable bit itself, but postbuild.mjs is the gate that
    // hard-fails if a bin ever loses its shebang. Run it synchronously, not through
    // a detached exec: a gate whose exit code nothing waits for is not a gate.
    onSuccess: async () => {
        execFileSync("node", ["scripts/postbuild.mjs"], { stdio: "inherit" });
    },
});
