#!/usr/bin/env node

// Scaffolds every template into a temp dir, installs, type-checks and builds
// it, then asserts on what landed on disk. No test framework - plain node, so
// it adds no dependency to a project whose whole pitch is dependency count.
//
// Run with: npm test

import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const cli = path.join(root, "dist", "index.js");

let failures = 0;

function check(label, ok, detail = "") {
    const mark = ok ? "ok  " : "FAIL";
    console.log(`${mark} ${label}${detail && !ok ? ` - ${detail}` : ""}`);
    if (!ok) {
        failures++;
    }
}

function run(cmd, args, cwd) {
    return execFileSync(cmd, args, { cwd, encoding: "utf8", stdio: "pipe" });
}

function scaffold(dir, args) {
    return execFileSync(process.execPath, [cli, ...args], {
        cwd: dir,
        encoding: "utf8",
        stdio: "pipe",
    });
}

// Every template ships oxlint and oxfmt now, so every template can be held to
// them. This is the assertion that a freshly scaffolded app is clean out of
// the box - the failure it exists to catch is a generated source that trips a
// default-on rule, which is how "react/react-in-jsx-scope" was found: it
// predates the automatic runtime and every template here generates
// "jsx": "react-jsx", so leaving it on made a brand new app lint dirty.
//
// format:check is the other half. The generated sources are written in the
// style oxfmt produces, so anyone running format:fix on an untouched scaffold
// should get no diff at all.
function quality(app) {
    for (const script of ["lint", "format:check"]) {
        check(
            `${script} passes on a fresh scaffold`,
            (() => {
                try {
                    run("pnpm", ["run", script], app);
                    return true;
                } catch (err) {
                    console.log(err.stdout || err.message);
                    return false;
                }
            })(),
        );
    }
}

function exitCodeOf(args, cwd) {
    try {
        execFileSync(process.execPath, [cli, ...args], { cwd, stdio: "pipe" });
        return 0;
    } catch (err) {
        return err.status;
    }
}

// like exitCodeOf, but keeps what the CLI said - the point of several of the
// --api checks is that a failure is a readable sentence, not a stack trace
function runCli(args, cwd) {
    try {
        const stdout = execFileSync(process.execPath, [cli, ...args], {
            cwd,
            encoding: "utf8",
            stdio: "pipe",
        });
        return { status: 0, output: stdout };
    } catch (err) {
        return {
            status: err.status,
            output: `${err.stdout ?? ""}${err.stderr ?? ""}`,
        };
    }
}

// The fixture API the --api section samples against.
//
// It runs in its own process, and it has to: every scaffold below goes through
// execFileSync, which blocks this process's event loop, so an in-process
// http.Server would never get to accept the connection and every request would
// sit there until the sampler's timeout. It binds port 0 and reports what it
// got, so two copies of this suite can run at once.
const FIXTURE_API = `
import http from "node:http";

const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://fixture");
    const json = (status, body) => {
        res.statusCode = status;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify(body));
    };

    if (url.pathname === "/users" && req.method === "GET") {
        // the second element deliberately omits "nickname" and nulls "email",
        // which is what drives the optional and the union in the inferred
        // type. "tags" is empty in one and populated in the other, which is
        // what widens it to string[] rather than never[].
        return json(200, [
            { id: 1, name: "ada", email: "a@x", nickname: "countess", tags: [] },
            { id: 2, name: "bob", email: null, tags: ["admin"] },
        ]);
    }
    if (url.pathname === "/users" && req.method === "POST") {
        return json(201, { id: 3 });
    }
    if (/^\\/users\\/[^/]+$/.test(url.pathname)) {
        return json(200, { id: 1, name: "ada", meta: { seen: 3 } });
    }
    return json(404, { error: "not found" });
});

server.listen(0, "127.0.0.1", () => console.log("PORT=" + server.address().port));
`;

async function startFixtureApi(dir) {
    const file = path.join(dir, "fixture-api.mjs");
    fs.writeFileSync(file, FIXTURE_API);

    const proc = spawn(process.execPath, [file], {
        stdio: ["ignore", "pipe", "inherit"],
    });

    const port = await new Promise((resolve, reject) => {
        let buffered = "";
        proc.stdout.on("data", (chunk) => {
            buffered += chunk;
            const match = buffered.match(/PORT=(\d+)/);
            if (match) {
                resolve(Number(match[1]));
            }
        });
        proc.on("exit", (code) => reject(new Error(`fixture api exited with ${code}`)));
    });

    return { proc, port };
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tsreact-smoke-"));

// hoisted so the finally below can reap it even if a check above throws -
// otherwise a failed run leaves a node process holding a port
let fixture = null;

try {
    // --- argument handling -------------------------------------------------
    console.log("\n# cli");

    check("no args exits 1", exitCodeOf([], tmp) === 1);
    check("--help exits 0", exitCodeOf(["--help"], tmp) === 0);
    check("--help does not create a directory", !fs.existsSync(path.join(tmp, "--help")));
    check("unknown template exits 1", exitCodeOf(["x", "-t", "svelte"], tmp) === 1);
    check("unquotable name is rejected", exitCodeOf(['a"b'], tmp) === 1);
    check(
        "--version prints the package version",
        scaffold(tmp, ["--version"]).trim() ===
            JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).version,
    );

    // --- templates ---------------------------------------------------------
    const templates = [
        {
            name: "react",
            args: [],
            files: [
                "package.json",
                "pnpm-workspace.yaml",
                ".oxlintrc.json",
                ".oxfmtrc.json",
                "apps/web/package.json",
                "apps/web/public/index.html",
                "apps/web/src/app.tsx",
                "apps/web/src/app.css",
                "apps/web/src/env.d.ts",
            ],
            jsonFiles: ["apps/web/package.json"],
            outDir: "apps/web/public",
            outputs: ["app.js", "app.css"],
        },
        {
            name: "extension",
            args: ["--template", "extension"],
            files: [
                "package.json",
                "pnpm-workspace.yaml",
                ".oxlintrc.json",
                ".oxfmtrc.json",
                "apps/extension/package.json",
                "apps/extension/public/manifest.json",
                "apps/extension/public/popup.html",
                "apps/extension/src/popup.tsx",
                "apps/extension/src/content.ts",
                "apps/extension/src/background.ts",
                "apps/extension/src/env.d.ts",
            ],
            jsonFiles: ["apps/extension/package.json"],
            outDir: "apps/extension/public",
            outputs: ["popup.js", "popup.css", "content.js", "background.js"],
        },
        {
            name: "pwa",
            args: ["--template", "pwa"],
            files: [
                "package.json",
                "pnpm-workspace.yaml",
                ".oxlintrc.json",
                ".oxfmtrc.json",
                "apps/web/tsconfig.sw.json",
                "apps/web/public/index.html",
                "apps/web/public/manifest.webmanifest",
                "apps/web/public/icon.svg",
                "apps/web/public/icon-192.png",
                "apps/web/public/icon-512.png",
                "apps/web/public/icon-maskable-512.png",
                "apps/web/src/app.tsx",
                "apps/web/src/sw.ts",
            ],
            jsonFiles: ["apps/web/package.json"],
            outDir: "apps/web/public",
            outputs: ["app.js", "app.css", "sw.js"],
        },
        {
            // the flags are meant to compose with a template rather than be
            // one, so this row exercises the react template with all three on.
            // It is also the only row that produces an .npmrc, because
            // predev is a pre<name> hook and pnpm skips those by default,
            // and the only one that produces a hook.
            name: "tailwind",
            args: ["--tailwind", "--daisyui", "--husky"],
            files: [
                "package.json",
                ".npmrc",
                ".husky/pre-commit",
                ".lintstagedrc.json",
                "apps/web/src/styles.css",
                "apps/web/src/app.css",
            ],
            husky: true,
            jsonFiles: ["apps/web/package.json"],
            outDir: "apps/web/public",
            outputs: ["app.js", "app.css"],
        },
        {
            // expo bundles with metro and has no build or typecheck script,
            // and a real install is huge and slow. --lockfile-only still does
            // full registry + peer resolution, which is the failure mode a
            // handwritten pin table actually has, so that runs; everything
            // else here is a file/JSON assertion. NOT a full build check.
            name: "expo",
            args: ["--template", "expo"],
            files: [
                "package.json",
                "pnpm-workspace.yaml",
                ".oxlintrc.json",
                ".oxfmtrc.json",
                ".gitignore",
                "apps/mobile/package.json",
                "apps/mobile/app.json",
                "apps/mobile/tsconfig.json",
                "apps/mobile/index.ts",
                "apps/mobile/App.tsx",
            ],
            jsonFiles: ["apps/mobile/package.json"],
            outputs: [],
            resolveOnly: true,
        },
        {
            // vite writes dist/ rather than public/, and index.html is a
            // build input at the app root rather than a file that ships as-is
            name: "vite-spa",
            args: ["--template", "vite-spa"],
            files: [
                "package.json",
                "pnpm-workspace.yaml",
                ".oxlintrc.json",
                ".oxfmtrc.json",
                "apps/web/package.json",
                "apps/web/vite.config.ts",
                "apps/web/index.html",
                "apps/web/src/main.tsx",
                "apps/web/src/App.tsx",
                "apps/web/src/index.css",
                "apps/web/src/vite-env.d.ts",
            ],
            jsonFiles: ["apps/web/package.json"],
            outDir: "apps/web/dist",
            outputs: ["index.html"],
        },
        {
            // the one template with no html file of its own: rsbuild generates
            // the document from its built-in template, so dist/index.html is
            // produced from nothing but html.title in rsbuild.config.ts. There
            // is no *-env.d.ts either - rsbuild's css and import.meta types
            // come from the "types" array in tsconfig.json instead.
            name: "rsbuild-spa",
            args: ["--template", "rsbuild-spa"],
            files: [
                "package.json",
                "pnpm-workspace.yaml",
                ".oxlintrc.json",
                ".oxfmtrc.json",
                "apps/web/package.json",
                "apps/web/tsconfig.json",
                "apps/web/rsbuild.config.ts",
                "apps/web/src/main.tsx",
                "apps/web/src/App.tsx",
                "apps/web/src/index.css",
            ],
            jsonFiles: ["apps/web/package.json"],
            outDir: "apps/web/dist",
            outputs: ["index.html"],
        },
        {
            // no "next build": Turbopack's first build downloads native
            // binaries and would dominate the suite, while the risk worth
            // catching here - TypeScript 7 against Next 16's own types - is
            // entirely in the typecheck. NOT a full build check.
            name: "next-drizzle",
            args: ["--template", "next-drizzle"],
            files: [
                "package.json",
                "pnpm-workspace.yaml",
                ".oxlintrc.json",
                "apps/web/package.json",
                "apps/web/next.config.ts",
                "apps/web/postcss.config.mjs",
                "apps/web/drizzle.config.ts",
                "apps/web/next-env.d.ts",
                "apps/web/.env.example",
                "apps/web/src/app/layout.tsx",
                "apps/web/src/app/page.tsx",
                "apps/web/src/app/globals.css",
                "apps/web/src/db/index.ts",
                "apps/web/src/db/schema.ts",
            ],
            jsonFiles: ["apps/web/package.json"],
            outputs: [],
            skipBuild: true,
        },
        {
            // the only template with two apps, so the only one where the
            // fan-out scripts have more than one thing to fan out to
            name: "fastify-react",
            args: ["--template", "fastify-react"],
            files: [
                "package.json",
                "pnpm-workspace.yaml",
                "apps/server/package.json",
                "apps/server/tsconfig.json",
                "apps/server/rolldown.config.ts",
                "apps/server/src/index.ts",
                "apps/web/package.json",
                "apps/web/vite.config.ts",
                "apps/web/index.html",
                "apps/web/src/main.tsx",
            ],
            jsonFiles: ["apps/server/package.json", "apps/web/package.json"],
            outDir: ".",
            outputs: ["apps/web/dist/index.html", "apps/server/dist/index.js"],
        },
    ];

    for (const t of templates) {
        console.log(`\n# ${t.name}`);
        const app = path.join(tmp, t.name);
        scaffold(tmp, [t.name, ...t.args]);

        for (const f of t.files) {
            check(`emits ${f}`, fs.existsSync(path.join(app, f)));
        }

        // the sweep only sees the top level, which is everything for a
        // single-package template. jsonFiles names the ones a monorepo keeps
        // further down.
        const jsonFiles = [
            ...fs.readdirSync(app).filter((f) => f.endsWith(".json")),
            ...(t.jsonFiles ?? []),
        ];

        for (const f of jsonFiles) {
            try {
                JSON.parse(fs.readFileSync(path.join(app, f), "utf8"));
                check(`${f} is valid json`, true);
            } catch (err) {
                check(`${f} is valid json`, false, err.message);
            }
        }

        // pnpm ignores package.json's "workspaces" array, so this file is
        // what actually makes apps/* packages. Read before the resolveOnly
        // branch below, which needs it too.
        const workspaceYaml = fs.readFileSync(path.join(app, "pnpm-workspace.yaml"), "utf8");
        check("pnpm-workspace.yaml lists apps/*", /^\s*-\s*apps\/\*\s*$/m.test(workspaceYaml));
        check(
            "the root manifest declares no npm workspaces",
            JSON.parse(fs.readFileSync(path.join(app, "package.json"), "utf8")).workspaces ===
                undefined,
        );

        // esbuild unpacks its binary in a postinstall, which pnpm skips unless
        // it is named - and then the build fails with no obvious cause. It
        // reaches almost every template, directly or through drizzle-kit and
        // tsx, so every workspace file names it.
        check(
            "esbuild is allowed to run its postinstall",
            /allowBuilds:\s*\n\s*esbuild:\s*true/.test(workspaceYaml),
        );

        // expo: prove the pinned versions still resolve against each other,
        // then stop - there is nothing here esbuild can build.
        if (t.resolveOnly) {
            check(
                "pinned versions resolve",
                (() => {
                    try {
                        run("pnpm", ["install", "--lockfile-only"], app);
                        return true;
                    } catch (err) {
                        console.log(err.stdout || err.message);
                        return false;
                    }
                })(),
            );

            const mobile = path.join(app, "apps/mobile");

            const pkg = JSON.parse(fs.readFileSync(path.join(mobile, "package.json"), "utf8"));
            check("main points at index.ts", pkg.main === "index.ts");
            check("expo is a dependency", pkg.dependencies.expo !== undefined);

            // the template ships no binary assets, so app.json must not
            // reference any - expo falls back to its own defaults
            const appJson = fs.readFileSync(path.join(mobile, "app.json"), "utf8");
            check("app.json references no image assets", !/icon|splash|favicon/i.test(appJson));

            const tsconfig = JSON.parse(
                fs.readFileSync(path.join(mobile, "tsconfig.json"), "utf8"),
            );
            check("tsconfig extends expo's base", tsconfig.extends === "expo/tsconfig.base");

            // Metro walks node_modules upward and cannot follow pnpm's
            // symlinked layout. Asserting the setting is written is not
            // enough - pnpm 11 ignores node-linker in .npmrc entirely, so
            // the spelling that does nothing looks identical to the one that
            // works. Assert the effect: with the hoisted linker a real
            // install puts expo at the top of node_modules rather than
            // behind a .pnpm/ symlink.
            check(
                "nodeLinker: hoisted is set for metro",
                /^nodeLinker:\s*hoisted$/m.test(workspaceYaml),
            );
            run("pnpm", ["install"], app);
            check(
                "the hoisted linker actually flattens node_modules",
                fs.existsSync(path.join(app, "node_modules/expo/package.json")),
            );

            // this row has no build or typecheck to run, but the install above
            // is real, so the oxc tools are present and App.tsx can be held to
            // them like every other template
            quality(app);
            continue;
        }

        run("pnpm", ["install"], app);
        check(
            "typecheck passes",
            (() => {
                try {
                    run("pnpm", ["run", "typecheck"], app);
                    return true;
                } catch (err) {
                    console.log(err.stdout || err.message);
                    return false;
                }
            })(),
        );

        quality(app);

        // --husky. The two files are asserted above with the rest; what
        // matters here is the third piece, which lives in the root manifest
        // and is the half a preset cannot emit.
        if (t.husky) {
            const pkg = JSON.parse(fs.readFileSync(path.join(app, "package.json"), "utf8"));

            check("prepare runs husky", pkg.scripts.prepare === "husky");
            check(
                "husky and lint-staged are devDependencies",
                pkg.devDependencies.husky !== undefined &&
                    pkg.devDependencies["lint-staged"] !== undefined,
            );

            // the hook is run by husky's shim with "sh -e", so a husky 8
            // shebang or husky.sh source line in here is dead weight at best
            const hook = fs.readFileSync(path.join(app, ".husky/pre-commit"), "utf8");
            check("the hook carries no husky 8 shim", !/husky\.sh|#!/.test(hook));

            // lint-staged hands oxfmt exactly the staged files, and the api
            // client is in .oxfmtrc.json's ignorePatterns - so a commit of
            // nothing but a regenerated client would leave oxfmt with every
            // file excluded, where it exits 2 and takes the commit with it
            const staged = fs.readFileSync(path.join(app, ".lintstagedrc.json"), "utf8");
            check(
                "oxfmt tolerates a fully-ignored staged set",
                staged.includes("--no-error-on-unmatched-pattern"),
            );
        }

        if (t.name === "next-drizzle") {
            const web = path.join(app, "apps/web");

            const pkg = JSON.parse(fs.readFileSync(path.join(web, "package.json"), "utf8"));
            check("next is a dependency", pkg.dependencies.next !== undefined);
            check(
                "drizzle is wired up",
                pkg.dependencies["drizzle-orm"] !== undefined &&
                    pkg.dependencies["@libsql/client"] !== undefined,
            );

            // Turbopack is the default in Next 16, so the flag is gone
            check("build does not pass --turbopack", pkg.scripts.build === "next build");

            // a webpack key makes "next build" fail outright under Turbopack
            // rather than falling back to webpack
            const config = fs.readFileSync(path.join(web, "next.config.ts"), "utf8");
            check("next.config.ts declares no webpack config", !/webpack/.test(config));

            // Next rewrites tsconfig.json on first run and reports what it
            // changed. These two are the ones it insists on, so generating
            // them means a fresh scaffold produces no diff and no notice.
            const tsconfig = JSON.parse(fs.readFileSync(path.join(web, "tsconfig.json"), "utf8"));
            check(
                "jsx is react-jsx, which Next 16 mandates",
                tsconfig.compilerOptions.jsx === "react-jsx",
            );
            check(
                "both generated route type dirs are included",
                tsconfig.include.includes(".next/types/**/*.ts") &&
                    tsconfig.include.includes(".next/dev/types/**/*.ts"),
            );
        }

        // next-drizzle stops here. A Turbopack build downloads native
        // binaries and dominates the run, while the risk this row exists to
        // catch - TypeScript 7 against Next 16's own types - is entirely in
        // the typecheck above. NOT a full build check.
        if (t.skipBuild) {
            continue;
        }

        run("pnpm", ["run", "build"], app);

        // outDir defaults to public/, which is where esbuild writes. vite
        // writes dist/, and the monorepo has one per workspace - those rows
        // set outDir "." and give full paths instead.
        const outDir = t.outDir ?? ".";
        for (const out of t.outputs) {
            check(`builds ${path.join(outDir, out)}`, fs.existsSync(path.join(app, outDir, out)));
        }

        // --minify is what makes esbuild define NODE_ENV as "production";
        // without it the bundle ships React's development build.
        if (t.name === "react") {
            const bundle = fs.readFileSync(path.join(app, "apps/web/public", "app.js"), "utf8");
            check("ships production react", !bundle.includes("react-dom.development"));
        }

        // a module service worker has to be registered with {type:"module"},
        // which is not supported everywhere, so sw.js must stay classic
        if (t.name === "pwa") {
            const sw = fs.readFileSync(path.join(app, "apps/web/public", "sw.js"), "utf8");
            check("sw.js is not an es module", !/^\s*(import|export)[ {]/m.test(sw));

            const manifest = JSON.parse(
                fs.readFileSync(path.join(app, "apps/web/public", "manifest.webmanifest"), "utf8"),
            );
            for (const key of ["name", "start_url", "display", "icons"]) {
                check(`manifest has ${key}`, manifest[key] !== undefined);
            }

            const html = fs.readFileSync(path.join(app, "apps/web/public", "index.html"), "utf8");
            check("index.html links the manifest", html.includes('rel="manifest"'));

            // Chrome will not offer to install without raster icons, so the
            // pngs are generated rather than left to the user. Parse the
            // IHDR back out: a truncated or mis-encoded png would still
            // "exist", and nothing else in the pipeline would notice.
            for (const [file, expected] of [
                ["icon-192.png", 192],
                ["icon-512.png", 512],
                ["icon-maskable-512.png", 512],
            ]) {
                const png = fs.readFileSync(path.join(app, "apps/web/public", file));
                const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

                check(`${file} is a png`, png.subarray(0, 8).equals(signature));
                check(
                    `${file} is ${expected}x${expected}`,
                    png.readUInt32BE(16) === expected && png.readUInt32BE(20) === expected,
                );
            }

            const icons = manifest.icons.map((i) => i.src);
            check(
                "manifest lists the raster icons",
                icons.includes("icon-192.png") && icons.includes("icon-512.png"),
            );
            check(
                "manifest has a maskable icon",
                manifest.icons.some((i) => i.purpose === "maskable"),
            );
        }

        // tailwind compiles into src/app.css, which app.tsx imports - that is
        // what keeps the generated css inside esbuild's import graph, and so
        // out of public/ where it would break the live-reload swap. daisyui
        // is tree-shaken, so .btn only lands here if the markup drove it.
        if (t.name === "tailwind") {
            const css = fs.readFileSync(path.join(app, "apps/web/public", "app.css"), "utf8");
            check("tailwind output reaches public/app.css", css.includes("tailwindcss"));
            check("daisyui components are compiled in", css.includes(".btn"));

            // "predev" is a pre<name> hook, and pnpm does not run those for
            // arbitrary scripts unless this is on. Without it the first
            // "pnpm dev" serves an unstyled page and says nothing about why.
            check(
                "pre/post scripts are enabled for predev",
                /^enable-pre-post-scripts=true$/m.test(
                    fs.readFileSync(path.join(app, ".npmrc"), "utf8"),
                ),
            );
        }

        // content scripts and MV3 service workers must be classic scripts
        if (t.name === "extension") {
            for (const out of ["content.js", "background.js", "popup.js"]) {
                const js = fs.readFileSync(path.join(app, "apps/extension/public", out), "utf8");
                check(`${out} is not an es module`, !/^\s*(import|export)[ {]/m.test(js));
            }
            const manifest = JSON.parse(
                fs.readFileSync(path.join(app, "apps/extension/public", "manifest.json"), "utf8"),
            );
            for (const key of ["manifest_version", "name", "version"]) {
                check(`manifest has ${key}`, manifest[key] !== undefined);
            }
        }

        // vite decides production mode from its own build, not from a minify
        // flag, but the failure it protects against is the same one the react
        // row checks. Tailwind here is compiled by @tailwindcss/vite rather
        // than by the cli, and daisyui is absent - so the assertion is that a
        // utility the markup actually uses reached the stylesheet.
        if (t.name === "vite-spa") {
            const assets = path.join(app, "apps/web/dist", "assets");
            const js = fs
                .readdirSync(assets)
                .filter((f) => f.endsWith(".js"))
                .map((f) => fs.readFileSync(path.join(assets, f), "utf8"))
                .join("");
            const css = fs
                .readdirSync(assets)
                .filter((f) => f.endsWith(".css"))
                .map((f) => fs.readFileSync(path.join(assets, f), "utf8"))
                .join("");

            check("ships production react", !js.includes("react-dom.development"));
            check("tailwind output reaches the bundle", css.includes("--tw-"));
            check("a utility used in App.tsx is compiled in", /\.max-w-lg\b/.test(css));
        }

        // Same three risks as vite-spa, one directory layout further down
        // (rsbuild hashes into dist/static/{js,css}), plus one this template
        // has to itself: dist/index.html is generated rather than copied from
        // a source file, so the only thing carrying the app name into it is
        // html.title - and the only thing the mount point can agree with is
        // rsbuild's built-in template, which main.tsx expects to say "root".
        if (t.name === "rsbuild-spa") {
            const read = (kind, ext) => {
                const dir = path.join(app, "apps/web/dist/static", kind);
                return fs
                    .readdirSync(dir)
                    .filter((f) => f.endsWith(ext))
                    .map((f) => fs.readFileSync(path.join(dir, f), "utf8"))
                    .join("");
            };

            const js = read("js", ".js");
            const css = read("css", ".css");
            const html = fs.readFileSync(path.join(app, "apps/web/dist/index.html"), "utf8");

            check("ships production react", !js.includes("react-dom.development"));
            check("tailwind output reaches the bundle", css.includes("--tw-"));
            check("a utility used in App.tsx is compiled in", /\.max-w-lg\b/.test(css));
            check(
                "the generated html carries the app name",
                html.includes(`<title>${t.name}</title>`),
            );
            check("the generated html mounts where main.tsx looks", /id="root"/.test(html));
        }

        // the server half is bundled by rolldown with its runtime deps left
        // external: inlining fastify breaks the identity checks its plugin
        // system does at registration time, and that fails at runtime rather
        // than at build.
        if (t.name === "fastify-react") {
            const server = fs.readFileSync(path.join(app, "apps/server/dist/index.js"), "utf8");
            check("the server bundle is an es module", /^\s*import[ {]/m.test(server));
            check("fastify is left external", /from ["']fastify["']/.test(server));

            // both halves must be reachable from one fan-out
            const rootPkg = JSON.parse(fs.readFileSync(path.join(app, "package.json"), "utf8"));
            check(
                "the root can start either half on its own",
                Boolean(rootPkg.scripts["dev:server"] && rootPkg.scripts["dev:web"]),
            );
            check(
                "the root does not depend on concurrently",
                rootPkg.devDependencies?.concurrently === undefined,
            );
        }

        // pnpm ignores package.json's "workspaces" array, so the workspace
        // file is what actually makes apps/* packages. Asserted for every
        // template because every generated app is a workspace now.
        // build output must not be committed
        run("git", ["init", "-q", "."], app);
        run("git", ["add", "-A"], app);
        const staged = run("git", ["diff", "--cached", "--name-only"], app);
        const leaked = t.outputs.filter((o) => staged.includes(path.join(outDir, o)));
        check("build output is gitignored", leaked.length === 0, leaked.join(", "));

        // with --tailwind the stylesheet stops being a source file, so it has
        // to be ignored too or every user commits build output
        if (t.name === "tailwind") {
            check("generated src/app.css is gitignored", !staged.includes("apps/web/src/app.css"));
        }
    }

    // --- --api ---------------------------------------------------------------
    //
    // Hermetic on purpose: the fixture API is a node:http server started here,
    // on an ephemeral port, so this section needs no network and no external
    // service. That matters more than usual because the whole feature is
    // *about* executing real requests - a test that reached out to the
    // internet would fail for reasons that have nothing to do with the code.
    console.log("\n# api");

    const started = await startFixtureApi(tmp);
    fixture = started.proc;
    const port = started.port;

    const collection = path.join(tmp, "collection");
    const write = (rel, body) => {
        const file = path.join(collection, rel);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, body);
    };

    write("bruno.json", '{ "version": "1", "name": "fixture", "type": "collection" }');
    write(
        "environments/local.bru",
        `vars {\n  baseUrl: http://127.0.0.1:${port}\n}\n\nvars:secret [\n  apiToken\n]\n`,
    );
    // a disabled query param, a disabled header holding an apostrophe (which
    // would break a naive scanner), and a url query string that has to merge
    // with params:query without being sent twice
    write(
        "users/list.bru",
        `meta {\n  name: List users\n  seq: 1\n}\n\nget {\n  url: {{baseUrl}}/users?page=1\n  auth: bearer\n}\n\nparams:query {\n  page: 1\n  ~verbose: true\n}\n\nheaders {\n  Accept: application/json\n  Authorization: Bearer {{apiToken}}\n  ~X-Note: don't send this\n}\n`,
    );
    write(
        "users/get.bru",
        `meta {\n  name: Get user\n  seq: 2\n}\n\nget {\n  url: {{baseUrl}}/users/:id\n}\n\nparams:path {\n  id: 1\n}\n`,
    );
    // a body:json template with a {{var}} in it, followed by a tests block
    // full of braces and quotes - both have to survive the block scanner
    write(
        "users/create.bru",
        `meta {\n  name: Create user\n  seq: 3\n}\n\npost {\n  url: {{baseUrl}}/users\n  body: json\n}\n\nbody:json {\n  {\n    "name": "{{newName}}",\n    "admin": false\n  }\n}\n\ntests {\n  test("created", function() { expect(res.status).to.equal(201); });\n}\n`,
    );

    const app = path.join(tmp, "apiapp");
    scaffold(tmp, ["apiapp", "--api", collection]);

    // the client belongs to the app that consumes it; the collection and the
    // captured responses stay at the workspace root, next to the marker
    for (const f of [
        "apps/web/src/api/types.ts",
        "apps/web/src/api/client.ts",
        "apps/web/src/api/config.ts",
        "apps/web/src/api/keys.ts",
        "apps/web/src/api/queries.ts",
        "apps/web/src/api/mutations.ts",
        "apps/web/src/api/index.ts",
        "api/samples.json",
        "api/bruno.json",
        "api/users/list.bru",
    ]) {
        check(`emits ${f}`, fs.existsSync(path.join(app, f)));
    }

    const types = fs.readFileSync(path.join(app, "apps/web/src/api/types.ts"), "utf8");

    // the inference claims to describe what the server really returned, so
    // assert on the parts a declared-types approach could not have known
    check("infers a field the server returned", /\bname: string;/.test(types));
    check("a key absent from one element is optional", /\bnickname\?: string;/.test(types));
    check("a null observed once becomes a union", /\bemail: string \| null;/.test(types));
    check("an empty array merges with a populated one", /\btags: string\[\];/.test(types));
    check("nested objects are inlined", /\bseen: number;/.test(types));

    // mutations are not executed by default: scaffolding must not POST to a
    // real API. The type is therefore unknown, and says why.
    check(
        "an unsampled mutation is typed unknown",
        /export type CreateUserResponse = unknown;/.test(types),
    );
    check(
        "the request body type comes from the body:json template",
        /export type CreateUserBody = \{[^}]*\bname: string;[^}]*\badmin: boolean;/s.test(types),
    );

    const samples = JSON.parse(fs.readFileSync(path.join(app, "api/samples.json"), "utf8"));
    check("samples.json records the sampled endpoints", samples.endpoints.listUsers.status === 200);
    check(
        "samples.json says why a skip was skipped",
        typeof samples.endpoints.createUser?.skipped === "string",
    );

    // a disabled header must not reach the generated client, and neither may
    // Authorization - that belongs in config.ts, which is not committed-safe
    const queriesSrc = fs.readFileSync(path.join(app, "apps/web/src/api/queries.ts"), "utf8");
    check("a ~disabled header is dropped", !queriesSrc.includes("X-Note"));
    check("Authorization never reaches the client", !/Authorization/i.test(queriesSrc));
    check("a path parameter is url-encoded", queriesSrc.includes("segment(params.id)"));

    // the marker and the regeneration script live in the root manifest, the
    // runtime dependency in the app that imports the client
    const apiPkg = JSON.parse(fs.readFileSync(path.join(app, "package.json"), "utf8"));
    const webPkg = JSON.parse(fs.readFileSync(path.join(app, "apps/web/package.json"), "utf8"));
    check(
        "tanstack query is a dependency of the app",
        Boolean(webPkg.dependencies["@tanstack/react-query"]),
    );
    check("the collection path is recorded", apiPkg.tsreact?.api === "api");

    // every template now has its own client path, so the template is always
    // recorded - see apiRoot() and the legacy check further down
    check("the template is recorded", apiPkg.tsreact?.template === "react");
    check("an api:gen script is emitted", Boolean(apiPkg.scripts["api:gen"]));

    // the real proof: the emitted code has to satisfy tsc --strict against
    // TanStack Query's own types, not merely look plausible
    run("pnpm", ["install"], app);
    check(
        "typecheck passes",
        (() => {
            try {
                run("pnpm", ["run", "typecheck"], app);
                return true;
            } catch (err) {
                console.log(err.stdout || err.message);
                return false;
            }
        })(),
    );
    run("pnpm", ["run", "build"], app);
    check(
        "builds apps/web/public/app.js",
        fs.existsSync(path.join(app, "apps/web/public", "app.js")),
    );

    // MV3 blocks a cross-origin fetch that is not declared, and it fails as an
    // opaque network error rather than a CORS message. File assertions only -
    // a second full install here would double this section's runtime.
    const ext = path.join(tmp, "apiext");
    scaffold(tmp, ["apiext", "--template", "extension", "--api", collection]);
    const extManifest = JSON.parse(
        fs.readFileSync(path.join(ext, "apps/extension/public/manifest.json"), "utf8"),
    );
    check(
        "the extension declares host_permissions for the api",
        (extManifest.host_permissions ?? []).some((h) => h.includes(`:${port}`)),
    );

    // The two-app template is where apiRoot() has an actual choice to make -
    // the client belongs to the web app, not the server. File assertions
    // only, for the same reason as the extension above.
    const mono = path.join(tmp, "apimono");
    scaffold(tmp, ["apimono", "--template", "fastify-react", "--api", collection]);
    for (const f of [
        "apps/web/src/api/types.ts",
        "apps/web/src/api/config.ts",
        "apps/web/src/api/queries.ts",
        "api/samples.json",
    ]) {
        check(`monorepo emits ${f}`, fs.existsSync(path.join(mono, f)));
    }
    check(
        "the client does not land at the repository root",
        !fs.existsSync(path.join(mono, "src")),
    );
    const monoPkg = JSON.parse(fs.readFileSync(path.join(mono, "package.json"), "utf8"));
    check(
        "the template is recorded so regeneration can find the client",
        monoPkg.tsreact?.template === "fastify-react",
    );

    // Everything below runs with the fixture API switched off. This is the
    // check that committing api/samples.json actually bought determinism:
    // regeneration has to work offline and produce the same bytes.
    fixture.kill();
    await new Promise((resolve) => fixture.on("exit", resolve));

    const before = fs.readFileSync(path.join(app, "apps/web/src/api/types.ts"), "utf8");
    const configPath = path.join(app, "apps/web/src/api/config.ts");
    fs.writeFileSync(
        configPath,
        fs.readFileSync(configPath, "utf8").replace("token: undefined", "token: 'kept'"),
    );
    fs.rmSync(path.join(app, "apps/web/src/api/types.ts"));
    fs.rmSync(path.join(app, "apps/web/src/api/queries.ts"));

    const regen = runCli(["api"], app);
    check("api regenerates offline", regen.status === 0, regen.output);
    check(
        "regenerated types are byte-identical",
        fs.readFileSync(path.join(app, "apps/web/src/api/types.ts"), "utf8") === before,
    );
    // config.ts holds the base url and the token the user typed in. It is the
    // one file regeneration must never clobber.
    check(
        "a hand-edited config.ts survives regeneration",
        fs.readFileSync(configPath, "utf8").includes("token: 'kept'"),
    );

    // --refresh is an explicit "go and ask the API again", so with the API
    // gone it has to fail - but as a sentence, not a stack trace
    const refreshed = runCli(["api", "--refresh"], app);
    check("--refresh against a dead api exits non-zero", refreshed.status === 1);
    check(
        "--refresh failure names the cause",
        refreshed.output.includes("Could not sample any endpoint"),
        refreshed.output,
    );
    check(
        "--refresh failure suggests a way forward",
        refreshed.output.includes("--api-sample=none"),
        refreshed.output,
    );

    // --api-sample=none must not touch the network at all, which is the only
    // reason this can run with the server already closed
    const offline = path.join(tmp, "apinone");
    const none = runCli(["apinone", "--api", collection, "--api-sample=none"], tmp);
    check("--api-sample=none scaffolds with no network", none.status === 0, none.output);
    check(
        "every response is unknown without samples",
        !/export type \w+Response = \{/.test(
            fs.readFileSync(path.join(offline, "apps/web/src/api/types.ts"), "utf8"),
        ),
    );

    // An app scaffolded before generated apps became workspaces has a flat
    // src/api/ and a marker with no "template" key. Regeneration must follow
    // that, not the current react layout - otherwise it writes a second
    // client at apps/web/src/api and silently leaves the real one stale.
    const legacy = path.join(tmp, "legacyapp");
    fs.mkdirSync(path.join(legacy, "src/api"), { recursive: true });
    fs.cpSync(path.join(app, "api"), path.join(legacy, "api"), {
        recursive: true,
    });
    fs.writeFileSync(
        path.join(legacy, "package.json"),
        JSON.stringify({ name: "legacyapp", tsreact: { api: "api" } }, null, 4),
    );

    const legacyRegen = runCli(["api"], legacy);
    check("a pre-workspace app still regenerates", legacyRegen.status === 0, legacyRegen.output);
    check(
        "it regenerates into the flat src/api it already had",
        fs.existsSync(path.join(legacy, "src/api/types.ts")),
    );
    check(
        "it does not create a second client under apps/",
        !fs.existsSync(path.join(legacy, "apps")),
    );

    // "api" is a legal app name; only a directory this CLI generated with
    // --api may be regenerated in place
    check(
        "a bad collection path exits 1",
        exitCodeOf(["broken", "--api", path.join(tmp, "no-such-collection")], tmp) === 1,
    );
    check(
        "no directory is left behind when sampling fails",
        !fs.existsSync(path.join(tmp, "broken")),
    );
    check("--refresh without --api exits 1", exitCodeOf(["x", "--refresh"], tmp) === 1);
} finally {
    fixture?.kill();
    fs.rmSync(tmp, { recursive: true, force: true });
}

console.log(failures === 0 ? "\nall checks passed" : `\n${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
