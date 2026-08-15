import { detectPm } from "@/pm/pm.js";

import { APPS, scope, standaloneTailwind } from "./cli.js";
import type { Opts } from "./cli.js";

//The workspace root. It ships no source of its own - it holds the lockfile,
//the "tsreact" marker, and the scripts that fan out to apps/*.
//
//NOTE on the fan-out: "pnpm -r run X" runs X in every workspace package in
//topological order, and prefixes each line with the package name. That is why
//there is no concurrently dependency here - npm needed one because it runs
//workspace scripts serially, so a "dev" fan-out would start the API and never
//reach the web app. pnpm's --parallel does the same job with nothing added.
//
//Linting and formatting also live here rather than in each app: one config,
//one pass, one set of devDependencies, matching how the two-app template
//already worked.
//
//NOTE on the version floors here and in every gen*PackageJson: a caret floor
//is deliberately NOT the newest published patch. pnpm 11 defaults
//minimumReleaseAge to a week and refuses anything published inside it, so
//"vite": "^8.2.1" on the day 8.2.1 ships makes "pnpm install" fail outright -
//nothing older satisfies the range. "^8.0.0" still resolves to the newest
//allowed version and degrades gracefully instead. Expo is the exception: its
//pins are exact because the SDK requires it, and they are old enough by the
//time an SDK ships.
export default function genRootPackageJson(o: Opts) {
    const pm = detectPm();
    const apps = APPS[o.template];

    //where the Bruno collection lives, and which template this is - the
    //latter is what tells "create-tsreact api" where the client goes. Both
    //stay at the root even though the client itself lives in an app.
    const marker = o.api
        ? `\n    "tsreact": {\n        "api": "${o.api.dir}",\n        "template": "${o.template}"\n    },`
        : "";

    const api = o.api ? `\n        "api:gen": "${pm.dlx} create-tsreact@latest api",` : "";

    //expo is the one template whose app has no src/ - App.tsx and index.ts sit
    //at the app root next to app.json - so pointing at "apps/mobile/src" would
    //hand oxfmt a path that does not exist, and it exits 2 on that rather than
    //shrugging. Naming the two files is also what keeps the generated 4-space
    //json out of the formatter's way: "oxfmt apps/mobile" would rewrite
    //app.json and tsconfig.json to .editorconfig's 2-space setting.
    //
    //(With --api the client does land at apps/mobile/src/api, but that path is
    //in .oxfmtrc.json's ignorePatterns, so there is still nothing to add here.)
    const src =
        o.template === "expo"
            ? apps.map((a) => `apps/${a}/App.tsx apps/${a}/index.ts`).join(" ")
            : apps.map((a) => `apps/${a}/src`).join(" ");

    //oxfmt does not expand globs itself, so every app path is spelled out -
    //"apps/*/src" only works where a shell expands it first, which npm
    //scripts do on posix and cmd.exe does not.
    //
    //Every template gets this pair now. There used to be an "oxc" branch that
    //handed the esbuild and expo templates prettier instead; the split bought
    //nothing except two toolchains to keep in step, and oxlint needs no plugin,
    //parser or resolver package to install.
    const quality = `
        "lint": "oxlint",
        "format:check": "oxfmt --check ${src}",
        "format:fix": "oxfmt ${src}",`;

    const dev =
        o.template === "expo"
            ? `
        "start": "pnpm -r run start",
        "android": "pnpm -r run android",
        "ios": "pnpm -r run ios",
        "web": "pnpm -r run web",`
            : `
        "dev": "pnpm -r --parallel run dev",
        "build": "pnpm -r run build",`;

    //drizzle-kit runs inside the app, because it resolves drizzle.config.ts
    //relative to its working directory. These forward to it so the commands
    //steps() prints are the ones that work from where the user is standing.
    const db =
        o.template === "next-drizzle"
            ? `
        "db:push": "pnpm -r run db:push",
        "db:generate": "pnpm -r run db:generate",
        "db:migrate": "pnpm -r run db:migrate",
        "db:studio": "pnpm -r run db:studio",`
            : "";

    //only the two-app template needs a way to start one half on its own
    const halves =
        o.template === "fastify-react"
            ? `
        "dev:server": "pnpm --filter ${scope(o)}/server run dev",
        "dev:web": "pnpm --filter ${scope(o)}/web run dev",`
            : "";

    //the tailwind watcher is still a second process the user starts by hand;
    //the root just forwards to whichever app owns it. Only the templates whose
    //apps actually have a "tw" script - see standaloneTailwind in cli.ts, which
    //is also what help.ts checks before advertising this command.
    const tw = standaloneTailwind(o)
        ? `
        "tw": "pnpm -r run tw",`
        : "";

    //husky writes .husky/_ and points core.hooksPath at it. Outside a git
    //repository it prints ".git can't be found" and exits 0, so a scaffolded
    //directory that has not been "git init"-ed yet still installs cleanly and
    //the hook starts working the moment one exists.
    const prepare = o.husky
        ? `
        "prepare": "husky",`
        : "";

    const deps = [`"oxfmt": "^0.62.0"`, `"oxlint": "^1.70.0"`];

    if (o.husky) {
        deps.push(`"husky": "^9.1.0"`, `"lint-staged": "^17.0.0"`);
    }

    deps.sort();

    const tpl = `
{
    "name": "${o.name}",
    "version": "0.0.1",
    "description": "${DESCRIPTIONS[o.template]}",
    "private": true,
    "type": "module",${marker}
    "engines": {
        "node": "^20.19.0 || >=22.12.0"
    },
    "scripts": {${dev}${halves}${db}${tw}${prepare}
        "typecheck": "pnpm -r run typecheck",${quality}${api}
        "test": "echo 'Error: no test specified' && exit 1"
    },
    "keywords": [
        "created by tsreact"
    ],
    "author": "",
    "license": "MIT",
    "devDependencies": {
        ${deps.join(",\n        ")}
    }
}
`;

    return tpl;
}

//one line each, for the root manifest's description field
const DESCRIPTIONS: Record<Opts["template"], string> = {
    react: "Typescript/React application",
    extension: "Chrome MV3 extension in Typescript/React",
    pwa: "Installable Typescript/React PWA",
    expo: "React Native application on Expo",
    "vite-spa": "Typescript/React SPA on Vite",
    "rsbuild-spa": "Typescript/React SPA on Rsbuild",
    "next-drizzle": "Next.js app with Drizzle on SQLite",
    "fastify-react": "Fastify API and React client in one workspace",
};
