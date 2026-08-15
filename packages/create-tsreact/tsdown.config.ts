import { defineConfig } from "tsdown";

export default defineConfig({
    // The one entry is also the `create-tsreact` bin. Keep in step with `bin` in package.json.
    entry: ["src/index.ts"],
    format: ["esm"],
    outDir: "dist",

    // A CLI with no public type surface, so there is nothing for attw to judge
    // either - publint alone gates the packaging.
    dts: false,

    minify: false,
    platform: "node",
    target: "node22",

    outExtensions: () => ({ js: ".js", dts: ".d.ts" }),

    publint: true,
});
