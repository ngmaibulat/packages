import { detectPm } from "@/pm/pm.js";
import chalk from "chalk";

import { apiRoot } from "./apiFiles.js";
import { DESCRIPTIONS, TEMPLATES, standaloneTailwind } from "./cli.js";
import type { Opts } from "./cli.js";

//error path: no app name was given
export function usage() {
    console.log("\n");
    console.log(chalk.redBright("Please provide appname\n"));
    console.log(chalk.yellowBright("Usage:"));
    console.log(chalk.yellowBright("\tnpm create tsreact <appname>"));
    console.log(chalk.yellowBright("\tnpm init tsreact   <appname>"));
    console.log(chalk.yellowBright("\tnpx create-tsreact <appname>"));
    console.log(chalk.yellowBright("\nRun with --help for options"));
    console.log("\n");
}

//rendered from TEMPLATES so the list cannot drift as templates are added.
//the column is measured rather than fixed, so a longer template name widens
//it instead of pushing its own description out of alignment.
//
//Shared by --help and --list-templates precisely so the two cannot disagree.
//indent is a parameter because --help nests the block under a heading and
//--list-templates does not.
export function templateList(indent = "    ") {
    const width = Math.max(...TEMPLATES.map((t) => t.length));

    return TEMPLATES.map((t) => `${indent}${t.padEnd(width)}  ${DESCRIPTIONS[t]}`).join("\n");
}

//the same data as an array rather than a table, for anything that has to
//consume this from a script. "default" is the flag parseArgs falls back to
//when --template is absent.
export function templatesJson() {
    return JSON.stringify(
        TEMPLATES.map((t) => ({
            name: t,
            default: t === "react",
            description: DESCRIPTIONS[t],
        })),
        null,
        2,
    );
}

export function help(version: string) {
    const names = TEMPLATES.map((t) => (t === "react" ? `${t} (default)` : t));
    const list = templateList();

    const msg =
        chalk.yellowBright(`\ncreate-tsreact ${version}\n`) +
        chalk.greenBright(`
Scaffold a TypeScript/React app - on a single esbuild command, or on Vite,
Next or Fastify. Pick with --template.

Usage:
    npx create-tsreact <appname> [options]
    npx create-tsreact api                  (inside a generated app)

Options:
    -t, --template <name>   ${names.join(" | ")}
        --tailwind          add Tailwind CSS v4
        --daisyui           add DaisyUI components (implies --tailwind)
        --husky             add a pre-commit hook: format staged files, lint
        --api <dir>         generate a typed client from a Bruno collection
        --api-env <name>    which environments/<name>.bru to resolve vars from
        --api-sample <how>  safe (default) | all | none - see below
        --refresh           re-run the requests instead of replaying samples
        --list-templates    print the table below and exit (--json for a list)
    -h, --help              show this help
    -v, --version           show the version

Templates:
${list}

The --api flag reads a Bruno collection, runs its requests once, and infers
TypeScript types from what the API actually returned. You get a typed client,
TanStack Query options and mutation hooks under src/api/, and the captured
responses in api/samples.json. The collection is copied into the app, so
"npm run api:gen" can regenerate later without the network.

Only GET and HEAD are executed by default: scaffolding an app must not POST to
a real API. Pass --api-sample=all to sample mutations too, or =none to skip the
network entirely and type every response as unknown.

Examples:
    npx create-tsreact myapp
    npx create-tsreact myext --template extension
    npx create-tsreact myapp --template pwa --daisyui
    npx create-tsreact myapp --template vite-spa
    npx create-tsreact myapp --template next-drizzle
    npx create-tsreact myapp --template vite-spa --husky
    npx create-tsreact myapp --api ./bruno --api-env local
    npx create-tsreact .

npm swallows unknown flags, so with "npm create" / "npm init" the options
must go after a "--" separator:

    npm create tsreact@latest myext -- --template extension
`);

    console.log(msg);
}

//with --tailwind the stylesheet is compiled by a second watcher, which has to
//run in its own terminal - there is no dependency-free, windows-portable way
//to start two watchers from one npm script
//
//Only the templates that run @tailwindcss/cli have a second watcher to start.
//The vite and next ones compile tailwind inside the bundler, and o.tailwind is
//forced true for them (see TAILWIND_ALWAYS in cli.ts), so without this check
//they would be told to run a "tw" script their package.json does not have.
function tailwindNote(o: Opts) {
    if (!standaloneTailwind(o)) {
        return "";
    }

    return (
        chalk.yellowBright(`\nTailwind runs as a second watcher:`) +
        chalk.greenBright(`
    ${detectPm().run("tw")}      (leave this running in its own terminal)
    `)
    );
}

//api/samples.json holds real response bodies. That is the point - it is what
//makes regeneration deterministic and reviewable - but it also means anyone
//sampling a production endpoint has just written live data into a file headed
//for git, and they should hear that once, loudly, rather than find out later.
function apiNote(o: Opts) {
    if (!o.api) {
        return "";
    }

    const sampled = Object.values(o.api.samples).filter((s) => !("skipped" in s)).length;
    const total = o.api.endpoints.length;

    const root = apiRoot(o);

    return (
        chalk.yellowBright(`\nAPI client:`) +
        chalk.greenBright(`
    ${total} endpoint(s) from ${o.api.collection}, ${sampled} sampled
    ${root}/       generated - "${detectPm().run("api:gen")}" rewrites it
    ${root}/config.ts  base url and token, yours to edit and kept on regen
    `) +
        chalk.yellowBright(
            `\nNote: api/samples.json contains real response bodies captured from the\nAPI. Read it before committing if that endpoint returns personal data.\n`,
        )
    );
}

//Commands are printed for whichever package manager launched us, so someone
//who typed "npm create tsreact" is not told to run pnpm. See pm.ts.
//Every branch below prints its own command block, so the one place a step can
//be added to all of them is the string they all open with. That is what this
//wrapper is for: the husky note has to reach every template, and threading it
//through six call sites is how notes drift.
export function steps(name: string, o: Opts) {
    stepsFor(name, o);

    if (o.husky) {
        console.log(huskyNote());
    }
}

//The order of "git init" and the install is not cosmetic. husky installs the
//hook from its "prepare" script, package managers run prepare as part of
//install, and husky exits 0 with a message when there is no repository - so
//installing into a directory that is not yet a repo leaves a .husky/pre-commit
//that never runs and nothing that looks like an error. Hence the git init line
//above the install, and the recovery command in the note.
function huskyNote() {
    const pm = detectPm();

    return (
        chalk.yellowBright(`\nThe pre-commit hook:`) +
        chalk.greenBright(`
    it formats staged files with oxfmt and then runs the linter.
    "${pm.run("prepare")}" installs it, and the install above does that
    for you - but only inside a git repository, which is why "git init"
    comes first. Already installed? Run that command now.
    `)
    );
}

function stepsFor(name: string, o: Opts) {
    const pm = detectPm();

    //name is the path relative to cwd, so "." means we scaffolded in place.
    //With --husky the repository has to exist before the install runs; see
    //huskyNote above for what happens when it does not.
    const cd = (name === "." ? "" : `\n    cd ${name}`) + (o.husky ? `\n    git init` : "");

    //what Chrome is pointed at, from wherever the user is standing
    const unpacked = name === "." ? "apps/extension/public" : `${name}/apps/extension/public`;

    if (o.template === "extension") {
        const msg =
            chalk.yellowBright(`\nFurther steps:`) +
            chalk.greenBright(`${cd}
    ${pm.install}
    ${pm.run("build")}
    `) +
            tailwindNote(o) +
            apiNote(o) +
            chalk.yellowBright(`\nThen load it in Chrome:`) +
            chalk.greenBright(`
    1. open chrome://extensions
    2. enable Developer mode
    3. "Load unpacked" and select ${unpacked}
    `) +
            chalk.yellowBright(
                `\nNote: select that public/ folder, not the project root - the manifest\nlives there.\n`,
            );

        console.log(msg);
        return;
    }

    if (o.template === "expo") {
        const msg =
            chalk.yellowBright(`\nFurther steps:`) +
            chalk.greenBright(`${cd}
    ${pm.install}
    ${pm.run("start")}
    `) +
            apiNote(o) +
            chalk.yellowBright(
                `\nNote: the dependency versions are pinned to Expo SDK 57. After an SDK\nbump, run "expo install --fix" inside apps/mobile to realign them.\n`,
            ) +
            chalk.yellowBright(
                `\nThe .npmrc sets node-linker=hoisted, which Metro needs - it cannot\nresolve pnpm's default layout. Do not remove it.\n`,
            );

        console.log(msg);
        return;
    }

    if (o.template === "pwa") {
        const msg =
            chalk.yellowBright(`\nFurther steps:`) +
            chalk.greenBright(`${cd}
    ${pm.install}
    ${pm.run("dev")}
    `) +
            tailwindNote(o) +
            apiNote(o) +
            chalk.yellowBright(`\nNote on the service worker:`) +
            chalk.greenBright(`
    it is not registered on localhost, where it would serve a stale bundle
    and fight live reload. Run "${pm.run("build")}" and serve
    apps/web/public/ over https to exercise it.
    `) +
            chalk.yellowBright(
                `\nThe icons in apps/web/public/ are generated from the app name - replace\nthem with your own artwork when you have some.\n`,
            );

        console.log(msg);
        return;
    }

    if (o.template === "next-drizzle") {
        const msg =
            chalk.yellowBright(`\nFurther steps:`) +
            chalk.greenBright(`${cd}
    ${pm.install}
    ${pm.run("db:push")}
    ${pm.run("dev")}
    `) +
            apiNote(o) +
            chalk.yellowBright(`\nNote on the database:`) +
            chalk.greenBright(`
    "db:push" creates apps/web/local.db from apps/web/src/db/schema.ts.
    It is gitignored. To point at Turso instead, set DB_FILE_NAME and
    DB_AUTH_TOKEN - see apps/web/.env.example.
    `);

        console.log(msg);
        return;
    }

    if (o.template === "fastify-react") {
        const msg =
            chalk.yellowBright(`\nFurther steps:`) +
            chalk.greenBright(`${cd}
    ${pm.install}
    ${pm.run("dev")}
    `) +
            apiNote(o) +
            chalk.yellowBright(`\nNote on the two servers:`) +
            chalk.greenBright(`
    "${pm.run("dev")}" starts both - the web app on http://localhost:3000
    and the API on http://localhost:3001. Vite proxies /api to the second
    one, so the browser only ever talks to port 3000.
    `);

        console.log(msg);
        return;
    }

    //react and vite-spa. tailwindNote is a no-op for vite-spa, which has no
    //separate css watcher to run - the vite plugin compiles it in-process.
    const msg =
        chalk.yellowBright(`\nFurther steps:`) +
        chalk.greenBright(`${cd}
    ${pm.install}
    ${pm.run("dev")}
    `) +
        tailwindNote(o) +
        apiNote(o);

    console.log(msg);
}
