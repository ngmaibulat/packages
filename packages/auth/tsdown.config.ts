import { defineConfig } from "tsdown";

export default defineConfig({
    // Three bins, no library surface. Keep in step with `bin` in package.json.
    entry: ["src/auth.ts", "src/bcrypt.ts", "src/bcrypt-compare.ts"],
    format: ["esm"],
    outDir: "dist",

    // Pure CLI: nothing imports this package, so there is no public type surface
    // and no attw run (the `bin`-only shape is the same one funtest has).
    dts: false,

    minify: false,
    platform: "node",
    target: "node22",

    outExtensions: () => ({ js: ".js", dts: ".d.ts" }),

    publint: true,
});
