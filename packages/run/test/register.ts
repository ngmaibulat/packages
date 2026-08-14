/**
 * Module resolution hook for the native node:test runner.
 *
 * The sources are written for the bundler (tsup), so they use two things
 * bare Node cannot resolve on its own:
 *
 *   - the tsconfig path aliases `@/*` (-> src/*) and `$/*` (-> package root)
 *   - extensionless relative imports, e.g. `import { runVT } from "./librun"`
 *
 * Node 23.6+ strips TypeScript types natively, so the only missing piece is
 * resolution. This hook fills that gap, which lets the tests import the real
 * `src/*.ts` files instead of a build artifact.
 *
 * Loaded via `node --import ./test/register.ts` (see the `test` script).
 */

import { registerHooks } from "node:module";
import { existsSync, statSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const packageRoot = path.resolve(import.meta.dirname, "..");

const aliases: [string, string][] = [
    ["@/", path.join(packageRoot, "src")],
    ["$/", packageRoot],
];

/** Resolve a path that may be missing its extension, mirroring tsup. */
function probe(basePath: string): string | undefined {
    const candidates = [
        basePath,
        `${basePath}.ts`,
        `${basePath}.js`,
        path.join(basePath, "index.ts"),
    ];

    for (const candidate of candidates) {
        if (existsSync(candidate) && statSync(candidate).isFile()) {
            return pathToFileURL(candidate).href;
        }
    }

    return undefined;
}

registerHooks({
    resolve(specifier, context, nextResolve) {
        for (const [prefix, target] of aliases) {
            if (specifier.startsWith(prefix)) {
                const url = probe(
                    path.join(target, specifier.slice(prefix.length))
                );

                if (url) {
                    return { url, shortCircuit: true };
                }
            }
        }

        if (specifier.startsWith(".") && context.parentURL?.startsWith("file:")) {
            const parentDir = path.dirname(fileURLToPath(context.parentURL));
            const url = probe(path.resolve(parentDir, specifier));

            if (url) {
                return { url, shortCircuit: true };
            }
        }

        return nextResolve(specifier, context);
    },
});
