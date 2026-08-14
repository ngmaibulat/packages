// Reading the workspace: what packages exist, and what depends on what.
//
// Shared by release.ts and bump.ts because the two have to agree. A bump that
// walks the workspace differently from the publisher is a bump that produces
// releases the publisher then refuses - and finding that out at publish time is
// finding it out late.

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Trailing slash, and load-bearing: `${ROOT}${rel}` concatenates without a
// separator, and bump.ts's relative() strips this prefix off an absolute path.
export const ROOT = fileURLToPath(new URL('..', import.meta.url));

// Mirrors pnpm-workspace.yaml. Kept as a literal rather than parsed out of the
// YAML: two entries are not worth a dependency, and the whole file is three
// globs that have not changed since the workspace was created.
const MEMBER_DIRS = ['packages', 'apps', 'examples'];

// Every bucket, not just `dependencies`: bump.ts rewrites internal ranges
// wherever they are declared, and a devDependency on a workspace package is
// still a range that can go stale.
export const DEP_FIELDS = [
    'dependencies',
    'devDependencies',
    'peerDependencies',
    'optionalDependencies',
] as const;

export type DepField = (typeof DEP_FIELDS)[number];

export type Pkg = {
    dir: string;
    name: string;
    version?: string;
    private?: boolean;
} & Partial<Record<DepField, Record<string, string>>>;


// apps/ and examples/ as well as packages/, even though nothing outside
// packages/ is published: they are workspace members, so a range in one of them
// can name a package being bumped. Callers that only care about what ships
// filter with isPublishable().
export function readPackages(): Pkg[]
{
    const found: Pkg[] = [];

    for (const dir of MEMBER_DIRS) {
        let entries: string[];

        // examples/vt and examples/temporal are scratch directories with no
        // manifest, and a member dir can be missing entirely.
        try {
            entries = readdirSync(`${ROOT}${dir}`).sort();
        }
        catch {
            continue;
        }

        for (const entry of entries) {
            const path = `${ROOT}${dir}/${entry}/package.json`;

            let text: string;
            try {
                text = readFileSync(path, 'utf8');
            }
            catch {
                continue;
            }

            found.push({ ...JSON.parse(text), dir: `${ROOT}${dir}/${entry}` });
        }
    }

    return found;
}


// A member with no version is a scratch workspace entry, not something with a
// release to cut - the same answer as `private`, arrived at by omission rather
// than by declaration.
export function isPublishable(pkg: Pkg): boolean
{
    return !pkg.private && Boolean(pkg.version);
}


// Topological, not hardcoded: adding a third package should not quietly
// reintroduce the ordering bug this exists to prevent.
export function publishOrder(pkgs: Pkg[]): Pkg[]
{
    const byName = new Map(pkgs.map((p) => [p.name, p]));
    const ordered: Pkg[] = [];
    const seen = new Set<string>();

    function visit(pkg: Pkg, trail: string[])
    {
        if (seen.has(pkg.name)) return;

        if (trail.includes(pkg.name)) {
            throw new Error(`dependency cycle: ${[...trail, pkg.name].join(' -> ')}`);
        }

        for (const dep of Object.keys(pkg.dependencies ?? {})) {
            const local = byName.get(dep);
            if (local) visit(local, [...trail, pkg.name]);
        }

        seen.add(pkg.name);
        ordered.push(pkg);
    }

    for (const pkg of pkgs) visit(pkg, []);

    return ordered;
}
