//NOTE on "external": fastify and its plugins must not be bundled. Fastify
//resolves plugin metadata by identity at registration time, and inlining two
//copies of it - or rewriting its dynamic requires - produces "fastify-plugin:
//plugin was not registered" style failures at runtime rather than at build.
//
//Everything in dependencies is externalised for that reason, which is also
//what keeps the bundle small: this exists to collapse src/ into one file for
//deployment, not to vendor node_modules.
export default function genRolldownConfig() {
    const tpl = `
import { createRequire } from "node:module";

import { defineConfig } from "rolldown";

const pkg = createRequire(import.meta.url)("./package.json");

export default defineConfig({
    input: "src/index.ts",
    platform: "node",
    output: {
        dir: "dist",
        format: "esm",
    },
    external: [
        /^node:/,
        ...Object.keys(pkg.dependencies ?? {}).map(
            (name) => new RegExp(\`^\${name}(/|$)\`)
        ),
    ],
});
`;

    return tpl;
}
