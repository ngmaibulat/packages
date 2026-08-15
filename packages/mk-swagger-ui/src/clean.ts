import fs from "node:fs/promises";
import path from "node:path";

import { REPOS } from "./clone";

/**
 * Remove the directories `get` clones.
 *
 * The published `bin/clean.sh` also removed `node_modules`, because the build
 * script installed packages into the caller's directory. It no longer does, so
 * this only undoes what `get` created.
 */
export async function clean(cwd = process.cwd()): Promise<string[]> {
    const removed: string[] = [];

    for (const { dir } of Object.values(REPOS)) {
        const target = path.join(cwd, dir);

        try {
            await fs.stat(target);
        } catch {
            continue;
        }

        await fs.rm(target, { recursive: true, force: true });
        removed.push(dir);
    }

    return removed;
}
