import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The manifest sits at a different depth depending on what is running this code:
 * `src/version.ts` under the test suite, `dist/index.js` for the library entry, and
 * `dist/bin/<method>.js` once the bundler has inlined this module into each bin.
 * Walking up finds it in all three rather than baking in one of the depths.
 */
function readManifest(): { name: string; version: string } {
    let dir = path.dirname(fileURLToPath(import.meta.url));

    for (;;) {
        try {
            return JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8')) as {
                name: string;
                version: string;
            };
        } catch {
            const parent = path.dirname(dir);
            if (parent === dir) throw new Error('cannot locate package.json');
            dir = parent;
        }
    }
}

const manifest = readManifest();

export const NAME = manifest.name;
export const VERSION = manifest.version;
export const USER_AGENT = `${manifest.name}/${manifest.version}`;
