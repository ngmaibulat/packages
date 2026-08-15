import { access, lstat, readlink, symlink, unlink } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { OPTIONAL_SHORTCUTS } from './args.ts';
import { CliError, EXIT, type ExitCode } from './errors.ts';

/**
 * `head` and `patch` are real commands on most systems (coreutils and GNU patch), and
 * npm's global bin directory usually precedes /usr/bin in PATH. Installing them by
 * default would shadow those tools system-wide, so they are opt-in.
 */

/**
 * Where this package's per-method bins live.
 *
 * Derived from this module's own location rather than `process.argv[1]`: npm installs
 * its shims as symlinks and Node reports argv[1] unresolved, so argv[1] points at the
 * shim directory rather than into the package.
 */
async function binSourceDir(): Promise<string> {
    let dir = path.dirname(fileURLToPath(import.meta.url));

    // Three layouts, and the bundler chooses between the last two on its own. From
    // source this module is `src/link.ts`, with the bins one level down in `src/bin`.
    // Inlined into a bin it *is* `dist/bin`. Hoisted into a shared chunk it is a
    // sibling, `dist/chunks`. Walking up until a `bin` directory turns up covers all
    // three without baking in a depth -- the same reason version.ts walks up looking
    // for package.json rather than hardcoding `../package.json`.
    for (;;) {
        if (path.basename(dir) === 'bin') return dir;

        const candidate = path.join(dir, 'bin');
        if (await exists(candidate)) return candidate;

        const parent = path.dirname(dir);
        if (parent === dir) {
            throw new CliError(EXIT.ERROR, 'cannot locate the directory httpc keeps its bins in');
        }

        dir = parent;
    }
}

/** `.js` when installed, `.ts` when running from source during development. */
function binExtension(): string {
    return path.extname(fileURLToPath(import.meta.url));
}

async function exists(target: string): Promise<boolean> {
    try {
        await access(target);
        return true;
    } catch {
        return false;
    }
}

/**
 * The directory a new shortcut must land in to be found.
 *
 * This is *not* `dirname(process.argv[1])`: npm's shim execs node with the real script
 * path, so argv[1] points inside the installed package (…/dist/bin), which is not on
 * PATH. The directory that matters is wherever the `httpc` shim itself sits.
 */
async function resolveShimDir(): Promise<string> {
    const found = await whichDir('httpc');
    if (found !== undefined) return found;

    // Global npm bins live alongside the node binary for nvm, fnm, and system installs.
    const beside = path.dirname(process.execPath);
    if (await exists(beside)) return beside;

    return await binSourceDir();
}

async function whichDir(command: string, skipDir?: string): Promise<string | undefined> {
    const skip = skipDir === undefined ? undefined : path.resolve(skipDir);

    for (const dir of (process.env.PATH ?? '').split(path.delimiter)) {
        if (dir === '') continue;
        if (skip !== undefined && path.resolve(dir) === skip) continue;
        if (await exists(path.join(dir, command))) return dir;
    }

    return undefined;
}

export async function runLink(
    action: 'link' | 'unlink',
    methods: readonly string[],
    stderr: NodeJS.WritableStream,
): Promise<ExitCode> {
    if (process.platform === 'win32') {
        throw new CliError(
            EXIT.ERROR,
            'httpc link is not supported on Windows',
            'define an alias instead, e.g. doskey head=httpc head $*',
        );
    }

    const allowed = new Set<string>(OPTIONAL_SHORTCUTS);
    const requested = methods.length > 0 ? methods : [...OPTIONAL_SHORTCUTS];

    for (const method of requested) {
        if (!allowed.has(method)) {
            throw new CliError(
                EXIT.USAGE,
                `${method} is not an opt-in shortcut`,
                `only ${[...allowed].join(' and ')} need linking; the others are installed already`,
            );
        }
    }

    const sourceDir = await binSourceDir();
    const shimDir = await resolveShimDir();
    const extension = binExtension();

    for (const method of requested) {
        // Point at the per-method bin, not at httpc: the method is baked into that file,
        // and a link to httpc would arrive with no way to tell which shortcut ran.
        const target = path.join(sourceDir, `${method}${extension}`);
        const linkPath = path.join(shimDir, method);

        if (action === 'unlink') {
            await removeLink(linkPath, sourceDir, method, stderr);
            continue;
        }

        if (!(await exists(target))) {
            throw new CliError(EXIT.ERROR, `cannot find ${target} to link against`);
        }

        await createLink(linkPath, target, method, shimDir, stderr);
    }

    return EXIT.OK;
}

async function linkTarget(linkPath: string): Promise<string | undefined> {
    try {
        const stats = await lstat(linkPath);
        if (!stats.isSymbolicLink()) return undefined;
        return path.resolve(path.dirname(linkPath), await readlink(linkPath));
    } catch {
        return undefined;
    }
}

async function createLink(
    linkPath: string,
    target: string,
    method: string,
    shimDir: string,
    stderr: NodeJS.WritableStream,
): Promise<void> {
    if (await exists(linkPath)) {
        if ((await linkTarget(linkPath)) === target) {
            stderr.write(`${method} is already linked\n`);
            return;
        }

        throw new CliError(
            EXIT.ERROR,
            `${linkPath} already exists and was not created by httpc`,
            'remove it yourself if you really want to replace it',
        );
    }

    try {
        await symlink(target, linkPath);
    } catch (err) {
        const code = (err as NodeJS.ErrnoException).code ?? 'unknown';
        throw new CliError(
            EXIT.ERROR,
            `cannot create ${linkPath}: ${code}`,
            code === 'EACCES' ? 'you may need to run this with elevated permissions' : undefined,
        );
    }

    // Look past our own link to find the command it now hides, so the user is told
    // rather than surprised later.
    const shadowed = await whichDir(method, shimDir);
    const note = shadowed === undefined ? '' : ` -- this now shadows ${path.join(shadowed, method)}`;

    stderr.write(`linked ${linkPath} -> ${target}${note}\n`);
}

async function removeLink(
    linkPath: string,
    sourceDir: string,
    method: string,
    stderr: NodeJS.WritableStream,
): Promise<void> {
    const target = await linkTarget(linkPath);

    if (target === undefined) {
        stderr.write(`${method} is not linked by httpc\n`);
        return;
    }

    if (path.dirname(target) !== sourceDir) {
        throw new CliError(EXIT.ERROR, `${linkPath} points at ${target}, not at httpc; leaving it alone`);
    }

    await unlink(linkPath);
    stderr.write(`unlinked ${linkPath}\n`);
}
