import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

/**
 * The Scalar bundle copied into the generated site, and the name it is given
 * there.
 *
 * `dist/browser/standalone.js` is Scalar's CDN build: a single self-contained
 * IIFE that registers `window.Scalar` and loads no chunks of its own. The
 * sibling `standalone.esm.js` is the one that lazy-loads ~90 files out of
 * `chunks/`, which is why it is not the one used here -- a generated folder has
 * to be deployable to a web server exactly as it comes out.
 */
export const BUNDLE_SOURCE = "dist/browser/standalone.js";
export const BUNDLE_NAME = "scalar.js";

const PACKAGE = "@scalar/api-reference";

const require = createRequire(import.meta.url);

/**
 * Locate the installed @scalar/api-reference package directory.
 *
 * The obvious `require.resolve("@scalar/api-reference/package.json")` does not
 * work here: the package publishes an `exports` map, and that map lists neither
 * `./package.json` nor anything under `dist/browser`. Resolving an unexported
 * subpath throws ERR_PACKAGE_PATH_NOT_EXPORTED, so the root has to be found by
 * resolving the one entry point that *is* exported and walking up from it.
 *
 * The walk stops at the manifest that names the package rather than at a fixed
 * depth, because how deep the entry sits inside the package is Scalar's
 * business and has already changed once.
 */
export function scalarDir(): string {
    let dir = path.dirname(require.resolve(PACKAGE));

    while (true) {
        const manifest = path.join(dir, "package.json");

        if (fs.existsSync(manifest)) {
            try {
                const { name } = JSON.parse(fs.readFileSync(manifest, "utf8"));

                if (name === PACKAGE) {
                    return dir;
                }
            } catch {
                // A manifest we cannot read is not the one we are looking for.
            }
        }

        const parent = path.dirname(dir);

        if (parent === dir) {
            throw new Error(`could not locate the ${PACKAGE} package directory`);
        }

        dir = parent;
    }
}

/** Absolute path to the browser bundle to copy. */
export function scalarBundle(): string {
    return path.join(scalarDir(), BUNDLE_SOURCE);
}
