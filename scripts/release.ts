// Publish every publishable package, in dependency order.
//
// `pnpm -r publish` would very nearly do this, and it is not enough. Publishing
// is the one thing in this repo that cannot be undone - npm allows an unpublish
// for 72 hours and then the version number is spent forever - so the interesting
// part is not the ordering, it is everything this refuses to do.
//
// Every check runs against every package BEFORE anything is published. A release
// that fails halfway leaves the registry in a state no commit describes: a
// dependent published against a dependency that is not there yet, and no way back.

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import semver from 'semver';

import { ROOT, isPublishable, publishOrder, readPackages, type Pkg } from './workspace.ts';

const dryRun = process.argv.includes('--dry-run');

// npm trusted publishing: GitHub Actions sets both of these, and only when the
// job asked for `id-token: write`. Their presence is the whole signal - there is
// no credential to look for, because npm mints a short-lived one from the OIDC
// claim at publish time.
const oidc = Boolean(
    process.env.ACTIONS_ID_TOKEN_REQUEST_URL && process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN,
);


async function publishedVersions(name: string): Promise<Set<string>>
{
    const res = await fetch(`https://registry.npmjs.org/${name}`);

    // a name nobody has ever published is the normal case for a first release
    if (res.status === 404) return new Set();
    if (!res.ok) throw new Error(`registry lookup for ${name} failed: ${res.status}`);

    return new Set(Object.keys(((await res.json()) as { versions?: object }).versions ?? {}));
}


// npm reads ~/.npmrc itself, so this is not what authenticates the publish - it
// exists so a missing credential is reported here, before anything is packed,
// rather than as a 401 partway through a multi-package release.
//
// The default registry only, to match the lookup above: no `_auth`, no scoped
// registry mapping. Widening this is reimplementing npm's config resolution.
function npmToken(): string | undefined
{
    const fromEnv = process.env.NPM_CONFIG_TOKEN ?? process.env.NPM_TOKEN;
    if (fromEnv) return fromEnv;

    const npmrc = join(homedir(), '.npmrc');
    if (!existsSync(npmrc)) return undefined;

    for (const line of readFileSync(npmrc, 'utf8').split('\n')) {
        const [key, ...rest] = line.split('=');
        if (key.trim() !== '//registry.npmjs.org/:_authToken') continue;

        // npm allows ${VAR} in .npmrc, and quotes around the value
        return rest.join('=').trim()
            .replace(/^["']|["']$/g, '')
            .replace(/\$\{([^}]+)\}/g, (_, name) => process.env[name] ?? '');
    }

    return undefined;
}


const packages = readPackages().filter(isPublishable) as (Pkg & { version: string })[];
const order = publishOrder(packages) as (Pkg & { version: string })[];

console.log(`release order: ${order.map((p) => `${p.name}@${p.version}`).join(' -> ')}`);
console.log(oidc ? 'auth: trusted publishing (npm, OIDC)\n' : 'auth: token (npm)\n');

const problems: string[] = [];

// 1. a release has to describe a commit, or the tarball and the tag disagree
const status = spawnSync('git', ['status', '--porcelain'], { cwd: ROOT });
const dirty = status.stdout?.toString().trim() ?? '';
if (dirty) problems.push(`the worktree is dirty:\n${dirty}`);

// 2. what is on the registry already, and what each package will resolve to
const registry = new Map<string, Set<string>>();
for (const pkg of order) registry.set(pkg.name, await publishedVersions(pkg.name));

const skip = new Set<string>();

for (const pkg of order) {
    if (registry.get(pkg.name)!.has(pkg.version)) {
        // not an error: this is what a re-run after a half-failed release looks
        // like, and refusing it would make the failure harder to recover from
        skip.add(pkg.name);
        console.log(`${pkg.name}@${pkg.version} is already published, will skip`);
    }
}

// Every version is already out. Since publish.yml runs on every push that touches
// a manifest, this is the common case - and there is nothing left for the checks
// below to protect, including the verify step, which is the expensive one.
if (skip.size === order.length) {
    console.log('\nnothing to publish');
    process.exit(0);
}

// 3. the check that ordering alone cannot make: does each workspace dependency
//    range actually match the version being published? Publishing a dependent
//    against `dep: ^0.6.0` while dep sits at 0.5.0 succeeds at the registry and
//    fails at every `npm install` afterwards.
const versionOf = new Map(order.map((p) => [p.name, p.version]));

for (const pkg of order) {
    for (const [dep, range] of Object.entries(pkg.dependencies ?? {})) {
        const local = versionOf.get(dep);
        if (!local) continue;

        if (range.startsWith('workspace:')) {
            problems.push(
                `${pkg.name} depends on ${dep} as "${range}". npm publish does not rewrite that, `
                + 'and this repo has shipped with plain semver. Pin it to a real range.',
            );
            continue;
        }

        if (!semver.satisfies(local, range)) {
            problems.push(
                `${pkg.name} depends on ${dep}@${range}, but ${dep} is at ${local}. `
                + `Publishing this pair makes ${pkg.name} uninstallable.`,
            );
        }
    }
}

// 4. the credential itself. npm only notices a missing one after it has packed
//    the tarball, which on a multi-package release is late enough to stop halfway
//    - the one state this script exists to avoid.
const willPublish = order.some((p) => !skip.has(p.name));
let token: string | undefined;

if (oidc) {
    // Nothing to authenticate ahead of time: the exchange happens inside npm
    // publish. What can be checked early is the npm doing it - an older npm has
    // no exchange at all and fails with a bare 401 that names no cause.
    const probe = spawnSync('npm', ['--version']);
    const npmVersion = probe.error || probe.status !== 0
        ? ''
        : probe.stdout.toString().trim();

    if (!semver.satisfies(npmVersion, '>=11.5.1')) {
        problems.push(`trusted publishing needs npm >= 11.5.1, this one is ${npmVersion || 'missing'}`);
    }
    else console.log(`publishing with npm ${npmVersion}`);
}
// `npm publish --dry-run` never contacts the registry, so a dry run needs no
// credential and asking for one would make the rehearsal harder than the thing
// it rehearses.
else if (willPublish && !dryRun) {
    token = npmToken();

    if (!token) {
        problems.push('no npm credentials: run `npm login`, or set NPM_CONFIG_TOKEN');
    }
    else {
        const who = spawnSync('npm', ['whoami'], {
            cwd: ROOT,
            env: { ...process.env, NPM_CONFIG_TOKEN: token },
        });

        if (who.error || who.status !== 0) {
            problems.push(`npm rejected the token: ${who.stderr?.toString().trim() ?? who.error?.message}`);
        }
        else console.log(`authenticated as ${who.stdout.toString().trim()}`);
    }
}

// 5. the suite, again. ci.yml runs it on every push, but a release is the one
//    place where "it passed on some earlier commit" is not good enough.
if (!dryRun) {
    console.log('\nverifying...');
    for (const script of ['typecheck', 'test']) {
        const proc = spawnSync('pnpm', ['run', script], { cwd: ROOT, stdio: 'inherit' });
        if (proc.error || proc.status !== 0) problems.push(`\`pnpm run ${script}\` failed`);
    }
}

if (problems.length) {
    console.error(`\nrefusing to publish:\n${problems.map((p) => `  - ${p}`).join('\n')}`);
    process.exit(1);
}

// Only now, with every package checked, does anything reach the registry.
const publishEnv = token ? { ...process.env, NPM_CONFIG_TOKEN: token } : process.env;

for (const pkg of order) {
    if (skip.has(pkg.name)) continue;

    console.log(`\npublishing ${pkg.name}@${pkg.version}`);

    // npm publish has no --cwd; it takes the package from the process cwd. Both
    // packages declare prepack, which is what puts dist/ in the tarball - it is
    // gitignored, so nothing else in CI builds it.
    //
    // In OIDC mode the environment is passed through untouched: npm does the
    // token exchange itself from ACTIONS_ID_TOKEN_REQUEST_*, and an injected
    // NPM_CONFIG_TOKEN would shadow it.
    const proc = spawnSync('npm', ['publish', ...(dryRun ? ['--dry-run'] : [])], {
        cwd: pkg.dir,
        env: oidc ? process.env : publishEnv,
        stdio: 'inherit',
    });

    if (proc.error || proc.status !== 0) {
        console.error(
            `\n${pkg.name} failed to publish. Anything before it in the order is already on the `
            + 'registry; fix the cause and re-run - published versions are skipped.',
        );
        process.exit(proc.status ?? 1);
    }
}

console.log(dryRun ? '\ndry run complete, nothing published' : '\ndone');
