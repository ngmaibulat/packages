import fs from "fs";
import path from "path";

import { CliError } from "@/bruno/error.js";
import { SAMPLE_MODES } from "@/bruno/spec.js";
import type { ApiSpec, SampleMode } from "@/bruno/spec.js";
import packageJson from "$/package.json" with { type: "json" };

//the array is the source of truth and Template is derived from it, so the
//two cannot drift - and --help renders from the same array
export const TEMPLATES = [
    "react",
    "extension",
    "pwa",
    "expo",
    "vite-spa",
    "rsbuild-spa",
    "next-drizzle",
    "fastify-react",
] as const;

export type Template = (typeof TEMPLATES)[number];

//one line each, rendered into --help so the list cannot drift from TEMPLATES
export const DESCRIPTIONS: Record<Template, string> = {
    react: "browser app, esbuild dev server with live reload",
    extension: "Chrome MV3 extension: popup + content script + background",
    pwa: "installable offline app: manifest + service worker",
    expo: "React Native app on Expo SDK 57 (metro, not esbuild)",
    "vite-spa": "React SPA on Vite 8, Tailwind 4, oxlint + oxfmt",
    "rsbuild-spa": "React SPA on Rsbuild 2 (Rspack), Tailwind 4",
    "next-drizzle": "Next 16 (Turbopack) + Drizzle on SQLite/libsql",
    "fastify-react": "workspaces monorepo: Fastify API + React on Vite",
};

//Every generated app is a pnpm workspace: a private root that holds the
//lockfile and the fan-out scripts, plus one directory per app under apps/.
//Most templates have exactly one; fastify-react has two.
//
//Keyed on the full Template union, so a new template cannot be added without
//declaring its layout - the same compile-time guard OUTPUT gives in
//genGitIgnore.ts.
//
//ORDER MATTERS: the first entry is the primary app, and that is the one --api
//puts the generated client in (see apiRoot in apiFiles.ts). fastify-react
//lists web first for exactly that reason - the client is consumed by the
//browser half, and a typed fetch wrapper in the server workspace would be
//nonsense.
export const APPS: Record<Template, readonly string[]> = {
    react: ["web"],
    extension: ["extension"],
    pwa: ["web"],
    expo: ["mobile"],
    "vite-spa": ["web"],
    "rsbuild-spa": ["web"],
    "next-drizzle": ["web"],
    "fastify-react": ["web", "server"],
};

//the directory --api writes into, and the one steps() points at
export function appDir(o: Opts) {
    return `apps/${APPS[o.template][0]}`;
}

//npm package names must be lowercase, and an app name may legitimately not
//be - "MyApp" is a valid directory but "@MyApp/web" is not a valid manifest.
export function scope(o: Opts) {
    return `@${o.name.toLowerCase()}`;
}

//Tailwind is not a flag on these - it is part of what the template is. The
//bundler plugin compiles it, so there is no separate CLI step to opt into.
//parseArgs forces o.tailwind true for them, which keeps every generator that
//already branches on that flag working without a per-template special case.
const TAILWIND_ALWAYS: readonly Template[] = [
    "vite-spa",
    "rsbuild-spa",
    "next-drizzle",
    "fastify-react",
];

//True when @tailwindcss/cli runs as its own watcher rather than inside the
//bundler - which is what decides whether there is a "tw" script to advertise,
//a "predev" hook to enable, and @source paths to name in styles.css.
//
//This is the complement of TAILWIND_ALWAYS, and deriving it rather than
//repeating "react || pwa || extension" in four places is the point: those
//copies used to drift, and one of them was a stale `!oxc` that meant "not a
//template with oxlint" back when only three templates had it. Expo cannot
//reach the true branch - parseArgs rejects --tailwind there outright, because
//React Native has no CSS for the tailwind CLI to compile.
export function standaloneTailwind(o: Opts) {
    return o.tailwind && !TAILWIND_ALWAYS.includes(o.template);
}

//what a preset returns: relative path -> contents. Almost everything is a
//string; a Buffer is the escape hatch for the pwa's png icons, which cannot
//be expressed as text and are generated rather than checked in.
export type Files = Record<string, string | Buffer>;

//everything a preset needs. generators that only depend on the app name keep
//taking a plain string; only the ones that actually branch take Opts.
export type Opts = {
    name: string;
    template: Template;
    tailwind: boolean;
    daisyui: boolean;
    //--husky: a pre-commit hook that formats staged files and lints. Opt-in
    //rather than default, because a scaffolder installing git hooks nobody
    //asked for is a surprise, and the scaffolded directory is usually not a
    //git repository yet.
    husky: boolean;
    //the parsed and sampled Bruno collection, absent unless --api was given.
    //Hanging it here rather than passing it alongside Opts is what lets every
    //genApi* module keep the one-argument signature the other generators use.
    api?: ApiSpec;
};

//everything --api needs, kept separate from Opts because parseArgs stays
//synchronous and pure: it records what was asked for, and index.ts does the
//reading and the network
export type ApiArgs = {
    //the collection directory, as given on the command line
    dir: string;
    env?: string;
    mode: SampleMode;
    refresh: boolean;
};

export type Parsed =
    | { kind: "usage" }
    | { kind: "help" }
    | { kind: "version" }
    //"--list-templates", optionally "--json" for a machine-readable form
    | { kind: "templates"; json: boolean }
    | { kind: "create"; dir: string; opts: Opts; api?: ApiArgs }
    //"create-tsreact api" run inside an app that already exists: regenerate
    //src/api/ from the collection recorded in its package.json
    | {
          kind: "api";
          dir: string;
          env?: string;
          mode: SampleMode;
          refresh: boolean;
      };

//user-facing failure: index.ts prints the message and exits 1.
//
//Declared in src/bruno/ because parse/collection/sample all throw it, and
//importing it back out of this package would make the two mutually dependent.
//Imported and re-exported here so this file can throw it and every other call
//site in the CLI still says `from "./cli.js"`.
export { CliError };

//tsdown inlines this at build time, so the number travels with the bundle and
//nothing has to guess how deep dist/ ended up. Resolving package.json from
//import.meta.url at runtime is the same trap the rest of this repo has been
//bitten by twice - code splitting means a module's depth is not fixed.
export const VERSION = packageJson.version;

//deliberately not the full npm ruleset (214 chars, url-safety, core module
//names) - that is 40 lines or a dependency for failures nobody hits. this
//covers the ones that actually break: path escapes and unquotable names.
export function validateName(name: string) {
    if (!name) {
        throw new CliError("App name must not be empty");
    }
    if (name.includes("..")) {
        throw new CliError(`App name must not contain "..": ${name}`);
    }
    if (/[/\\]/.test(name)) {
        throw new CliError(`App name must not contain a path separator: ${name}`);
    }
    if (/^[._]/.test(name)) {
        throw new CliError(`App name must not start with "." or "_": ${name}`);
    }
    if (/["\\\p{Cc}]/u.test(name)) {
        throw new CliError(`App name contains an unsupported character: ${name}`);
    }
    return name;
}

//the target must be missing or empty. a bare .git is tolerated so that
//"create-tsreact ." works inside a freshly cloned repo.
export function assertTargetUsable(dir: string) {
    if (!fs.existsSync(dir)) {
        return;
    }
    if (!fs.statSync(dir).isDirectory()) {
        throw new CliError(`Not a directory: ${dir}`);
    }
    const entries = fs.readdirSync(dir).filter((e) => e !== ".git");
    if (entries.length > 0) {
        throw new CliError(`Directory is not empty: ${dir}`);
    }
}

//"tsreact": { "api": "api" } is written into the generated package.json by
//genPackageJson, and is the only marker that says where a scaffolded app's
//Bruno collection lives. Absent for apps scaffolded without --api.
export function recordedCollection(dir: string) {
    return marker(dir, "api");
}

//which template the app was scaffolded from, which is what decides where the
//generated client lives - see apiRoot() in apiFiles.ts.
//
//undefined means the app predates workspace layouts: it has a flat src/api/
//and a marker with only an "api" key. That case must NOT fall back to
//"react", because react's client now lives at apps/web/src/api - regenerating
//there would leave the real client stale and write a second one beside it.
//See LEGACY_API_ROOT in apiFiles.ts.
export function recordedTemplate(dir: string): Template | undefined {
    const recorded = marker(dir, "template");

    return (TEMPLATES as readonly string[]).includes(recorded ?? "")
        ? (recorded as Template)
        : undefined;
}

function marker(dir: string, key: string) {
    const file = path.join(dir, "package.json");

    if (!fs.existsSync(file)) {
        return undefined;
    }

    try {
        const pkg = JSON.parse(fs.readFileSync(file, "utf8"));
        const recorded = pkg?.tsreact?.[key];
        return typeof recorded === "string" ? recorded : undefined;
    } catch {
        //a package.json we cannot read is not a tsreact app as far as this
        //check is concerned; the create path will report it properly
        return undefined;
    }
}

//the parameter is "raw" rather than "value" in both of these: value() below is
//a module-level function, and naming the parameter after it would shadow it
function parseTemplate(raw: string | undefined): Template {
    if (!raw) {
        throw new CliError("--template needs a value: " + TEMPLATES.join(" | "));
    }
    if (!(TEMPLATES as readonly string[]).includes(raw)) {
        throw new CliError(`Unknown template "${raw}". Expected: ${TEMPLATES.join(" | ")}`);
    }
    return raw as Template;
}

function parseMode(raw: string | undefined): SampleMode {
    if (!raw || !(SAMPLE_MODES as readonly string[]).includes(raw)) {
        throw new CliError(`--api-sample expects one of: ${SAMPLE_MODES.join(" | ")}`);
    }

    return raw as SampleMode;
}

//a flag that takes a value, in either "--flag value" or "--flag=value" form.
//Returns the value and how many argv entries it consumed.
function value(argv: string[], i: number, flag: string) {
    const arg = argv[i];

    if (arg === flag) {
        const next = argv[i + 1];
        if (next === undefined || next.startsWith("-")) {
            throw new CliError(`${flag} needs a value`);
        }
        return { value: next, skip: 1 };
    }

    return { value: arg.slice(flag.length + 1), skip: 0 };
}

export function parseArgs(argv: string[]): Parsed {
    let template: Template = "react";
    let tailwind = false;
    let daisyui = false;
    let husky = false;
    let target = "";
    let api = "";
    let env: string | undefined;
    let mode: SampleMode = "safe";
    let refresh = false;
    let list = false;
    let json = false;

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];

        if (arg === "--help" || arg === "-h") {
            return { kind: "help" };
        }
        if (arg === "--version" || arg === "-v") {
            return { kind: "version" };
        }
        //unlike --help and --version this cannot return on sight: --json may
        //still be ahead of it in argv. The return happens after the loop.
        if (arg === "--list-templates") {
            list = true;
            continue;
        }
        if (arg === "--json") {
            json = true;
            continue;
        }
        if (arg === "--template" || arg === "-t") {
            template = parseTemplate(argv[++i]);
            continue;
        }
        if (arg.startsWith("--template=")) {
            template = parseTemplate(arg.slice("--template=".length));
            continue;
        }
        if (arg === "--tailwind") {
            tailwind = true;
            continue;
        }
        if (arg === "--daisyui") {
            daisyui = true;
            continue;
        }
        if (arg === "--husky") {
            husky = true;
            continue;
        }
        if (arg === "--api" || arg.startsWith("--api=")) {
            const got = value(argv, i, "--api");
            api = got.value;
            i += got.skip;
            continue;
        }
        if (arg === "--api-env" || arg.startsWith("--api-env=")) {
            const got = value(argv, i, "--api-env");
            env = got.value;
            i += got.skip;
            continue;
        }
        if (arg === "--api-sample" || arg.startsWith("--api-sample=")) {
            const got = value(argv, i, "--api-sample");
            mode = parseMode(got.value);
            i += got.skip;
            continue;
        }
        if (arg === "--refresh") {
            refresh = true;
            continue;
        }
        if (arg.startsWith("-")) {
            throw new CliError(`Unknown option: ${arg}`);
        }
        if (target) {
            throw new CliError(`Unexpected argument: ${arg}`);
        }
        target = arg;
    }

    //Listing is informational and takes no target, so it returns before every
    //check below - including the "no target means usage" one at the end.
    if (list) {
        return { kind: "templates", json };
    }

    //--json on its own would silently print nothing, which reads as a broken
    //install rather than a misused flag. Same reasoning as --refresh below.
    if (json) {
        throw new CliError("--json only applies with --list-templates");
    }

    //"create-tsreact api" regenerates in place. It is a subcommand rather
    //than a flag because it does the opposite of everything else here: it
    //requires a directory that already exists and is not empty.
    //
    //"api" is also a legal app name, so the two are told apart by looking at
    //the current directory: only an app this CLI generated with --api carries
    //a "tsreact" key in its package.json. Anywhere else, "api" is a name.
    if (target === "api" && recordedCollection(process.cwd())) {
        return { kind: "api", dir: process.cwd(), env, mode, refresh };
    }

    //daisyui is a tailwind plugin, so asking for it alone is a typo, not an
    //error worth stopping for
    if (daisyui) {
        tailwind = true;
    }

    //--tailwind on a template that always has it is a harmless no-op rather
    //than an error: the user asked for something they are already getting
    if (TAILWIND_ALWAYS.includes(template)) {
        tailwind = true;
    }

    //react native styles with StyleSheet objects - there is no CSS for the
    //tailwind CLI to compile. that is nativewind, a different project.
    if (tailwind && template === "expo") {
        throw new CliError(
            "--tailwind is not supported by the expo template: React Native has no CSS",
        );
    }

    //--refresh only means anything next to a collection, and silently doing
    //nothing is how a user ends up believing they re-sampled
    if (refresh && !api) {
        throw new CliError("--refresh only applies with --api");
    }

    if (!target) {
        return { kind: "usage" };
    }

    //"." and "./foo" are normalised before validation, so that "." means the
    //current directory and "./foo" does not trip the path-separator rule.
    const normalised = path.normalize(target);
    const dir = path.resolve(normalised);
    const name = validateName(path.basename(dir));

    assertTargetUsable(dir);

    return {
        kind: "create",
        dir,
        opts: { name, template, tailwind, daisyui, husky },
        //resolved against the cwd, not the target: --api points at a
        //collection that already exists, while the target must be empty
        api: api ? { dir: path.resolve(api), env, mode, refresh } : undefined,
    };
}
