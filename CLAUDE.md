# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repo layout

A **pnpm workspace** (`pnpm-workspace.yaml`: `apps/*`, `packages/*`, `examples/*`) with a single root `pnpm-lock.yaml`. Each package under `packages/` is still independently versioned and published, and keeps its own `tsconfig.json` and `tsdown.config.ts`. Releases are driven from the root by `scripts/bump.ts` and `scripts/release.ts` — see **Releasing** below.

- `packages/run` → `@aibulat/run`, the substantial package (4 bins: `run`, `logview`, `output`, `shell`).
- `packages/http` → `@aibulat/http`, an HTTPie-style HTTP client, one bin per method (7 registered, plus `head`/`patch` built but opt-in). Zero runtime deps, **Node ≥ 26**.
- `packages/restclients` → `@aibulat/restclients`, typed `fetch` wrappers around nine public REST APIs. A library, not a CLI: no `bin`, subpath exports only, must stay browser-safe.
- `packages/naser` → `@aibulat/naser`, an ANSI→HTML CLI built on `anser`.
- `packages/funtest` → `@aibulat/funtest`, live smoke tests for public REST APIs, published as runnable reference code (`bin`: `funtest` → `bin/run.sh`).
- `packages/isfile` → `@aibulat/isfile`, a one-function file-existence check. The leaf of the internal dependency graph.
- `packages/json` → `@aibulat/json`, `readJson<T>()` over `isfile`.
- `packages/indexeddb` → `@aibulat/indexeddb`, a promise wrapper over IndexedDB. **Its tests run against the sibling `@aibulat/indexeddb-impl`, which must be built first** — the exports map resolves into that package's gitignored `dist/`, so on a fresh checkout `pnpm --filter @aibulat/indexeddb run test` fails until a build has run. That is the same `linkWorkspacePackages` trap as **Build order** below, extended from `typecheck` to `test`; CI and `release.ts` already build first, so only local runs are affected. Forked from [`idb`](https://github.com/jakearchibald/idb) at v8.0.3 and maintained as an **API-compatible superset** — everything idb does behaves identically, plus fixes and additions upstream never shipped (see its CHANGELOG for the list and the upstream issue numbers). A browser library with no `bin`; like `restclients` it builds `platform: "neutral"` and must stay browser-safe. **The only package whose tests need an IndexedDB implementation** — they run on `fake-indexeddb` under `node:test`, not in a browser. Its tsconfig `lib` includes `ESNext.Disposable` for `Symbol.dispose`; consumers do **not** need it, because `entry.ts` keys that member off a type that collapses to `never` when the lib is absent. Do not "simplify" that to a plain `[Symbol.dispose]()` — it would break consumers on a narrower `lib`, which is upstream's `WeakKey` bug (#331). **It has a second entry, `./nexie`** — see **Nexie** below.
- `packages/fs` → `@aibulat/fs`, filesystem helpers plus an `fs` bin. The only package with a native compile (`posix`) and a WASM dep (`@npcz/magic`).
- `packages/indexeddb-impl` → `@aibulat/indexeddb-impl`, a pure-JS in-memory implementation of IndexedDB. Forked from [`fake-indexeddb`](https://github.com/dumbmatter/fakeIndexedDB) at v6.2.5 (no history grafted), API unchanged apart from an added `installGlobals()`. **Apache-2.0, not MIT** — it is the one package with a `NOTICE`, which the licence requires; keep both in the published `files`. Like `restclients` and `indexeddb` it builds `platform: "neutral"` and must stay browser-safe. Its four test suites (WPT conformance, the QUnit corpus, unit, smoke — 1,774 tests) all run headless, and **the same suites must pass under both `node --test` and `bun test`** with identical totals; `test:bun` is what proves the second half. See **The two runtimes** below.
- `packages/mark` → `@aibulat/mark`, a terminal Markdown renderer (`bin`: `mark`).
- `packages/mk-swagger-ui` → **`mk-swagger-ui`**, a static OpenAPI reference generator, rendering with **Scalar** despite the name (`bin`: `mk-swagger-ui`). One of the two members published without the `@aibulat` scope — see **The unscoped members** below.
- `packages/sendeml` → `@aibulat/sendeml`, sends raw `.eml` files to SMTP, including Haraka queue dirs (`bin`: `sendeml`). Mid-restructure — see below.
- `packages/watch-dir-count` → `@aibulat/watch-dir-count`, polls a directory's file count and fires a command plus an email over a threshold (`bin`: `wdc`). Ships `templates/`.
- `packages/auth` → `@aibulat/auth`, bcrypt credentials in a knex-backed table (`bin`: `auth`, `bcrypt`, `bcrypt-compare`).
- `packages/installer` → `@aibulat/installer`, Ubuntu provisioning scripts (`bin`: `i-ubuntu-mysql`, `i-ubuntu-vim`, `c-vim`, `gen-pw`).
- `packages/ctl-ufw` → `@aibulat/ctl-ufw`, configures ufw from a JSON port list (`bin`: `ctl-ufw`). **Directory name is `ctl-ufw`, not `ufw`** — the release tag is derived from the basename.
- `packages/create-tsreact` → **`create-tsreact`**, a TypeScript/React scaffolder (`bin`: `create-tsreact`). The other unscoped member, and the only one whose name *must* stay unscoped. Moved in from its own repo, which was itself a four-package workspace — see **The unscoped members** below.
- `packages/svelte-admin-kit` → `@aibulat/svelte-admin-kit`, a Svelte 5 admin-UI component library (29 components, 15 subpath exports). **The one member that does not build with tsdown** — see **The `svelte-package` exception** below. Moved in from the `siem-tracker` repo; never published from there.
- `apps/docs` → the VitePress documentation site, deployed to GitHub Pages at `https://ngmaibulat.github.io/packages/`. Private, never published to npm.
- `examples/table` — workspace member, `private`, not published.
- `examples/vt` — a Deno scratch experiment (`deno task dev`) using `@sigma/pty-ffi`. No `package.json`, so pnpm skips it; not published.
- `examples/temporal` — loose scratch script, also without a `package.json`.

`dist/`, `.svelte-kit/` (svelte-package's staging dir) and `apps/docs/.vitepress/{dist,cache}` are untracked build output.

## Commands

From the repo root, across all members:

```bash
pnpm install
pnpm run build       # pnpm -r run build      — RUN THIS FIRST, see below
pnpm run test        # pnpm -r run test      — offline, always
pnpm run test:live   # pnpm -r run test:live — talks to the real internet
pnpm run typecheck   # pnpm -r run typecheck
pnpm run lint        # pnpm -r run lint      — only restclients and svelte-admin-kit define it
```

**`build` must run before `typecheck` on a fresh checkout.** This is not a preference;
it is a hard ordering constraint, and getting it wrong produces an error that names
neither the cause nor the culprit. See **Build order** under Conventions.

`pnpm run test` is hermetic and must stay that way: it is what CI gates on. The two
members with live suites (`restclients`, `funtest`) expose them as `test:live`, which
runs nightly in `.github/workflows/live.yml` with `continue-on-error` — an upstream API
being down is not a bug here.

Scope to one package with `--filter`, or `cd` into it:

```bash
pnpm --filter @aibulat/run run test
pnpm --filter @aibulat/run run build   # tsdown: bundle, .d.ts, publint and attw
pnpm --filter @aibulat/run run dev     # tsdown --watch

pnpm --filter @aibulat/svelte-admin-kit run build   # svelte-package && publint
pnpm --filter @aibulat/svelte-admin-kit run dev     # svelte-package --watch
```

`svelte-admin-kit`'s `exports` map resolves into `dist/`, so nothing can consume it until
`build` has run at least once — a fresh `pnpm install` alone leaves it unresolvable. Use the
watcher while developing against it; without one, edits under `src/` silently have no effect.

The docs site:

```bash
pnpm --filter docs run dev       # vitepress dev, http://localhost:5173/packages/
pnpm --filter docs run build     # also runs as part of root `pnpm run build`
pnpm --filter docs run preview   # serve the built site, verifies the /packages/ base path
```

Its `base` is `/packages/` because GitHub Pages serves it under the repository name; the deploy is `.github/workflows/deploy-docs.yml`, which builds on push to `main`.

Adding a new CLI or entry point requires editing **both** the `entry[]` array in `tsdown.config.ts` and the `bin` map in `package.json`.

## Releasing

Two root scripts in `scripts/`, run directly by Node's type stripping — they are `.ts` with no build step, which needs **Node ≥ 22.18** (stricter than the `engines.node` the packages declare). Never run either unless explicitly asked.

```bash
pnpm bump                 # patch every publishable package
pnpm bump minor           # minor, all of them
pnpm bump patch naser     # one package, and whatever depends on it
pnpm bump --dry-run       # print the plan, write nothing
pnpm bump --no-git        # write the manifests, skip the commit and tags
```

`scripts/bump.ts` rewrites versions **and** internal dependency ranges, cascading to any package whose range moved (a package whose dependency changed is a package whose contents changed). It refuses on a dirty worktree, an existing tag, a non-`x.y.z` version, or a manifest that does not round-trip through `JSON.stringify` with its own indent — the round-trip check is what lets it rewrite whole manifests and still promise a diff of only the changed lines. It then runs `pnpm install --lockfile-only`, commits (`release: @aibulat/run@0.2.22`) and annotated-tags with the **short** name (`run@0.2.22`, no scope).

Then `git push --follow-tags` — a bare push leaves the tags behind.

`scripts/release.ts` (`pnpm release`, `pnpm release:dry`) publishes in topological order. Every check runs against every package before anything reaches the registry: clean worktree, registry state, internal range consistency, credentials, then `build`, `typecheck` and `test`. Versions already on npm are **skipped, not failed**, so a half-finished release is safe to re-run.

`build` leads that trio and cannot be dropped from it — see **Build order** under Conventions. It runs on a fresh CI checkout with no `dist/` anywhere, and every package with an internal dependency fails `typecheck` until one exists.

Publishing happens in CI, not on a laptop. `.github/workflows/publish.yml` fires on a push to `main` touching `packages/*/package.json` and authenticates with **npm trusted publishing** — OIDC, no token, no GitHub Environment. Every published package needs its trusted publisher registered on npmjs.com against repository `ngmaibulat/packages` and workflow `publish.yml`, with the environment field left **empty**; a package whose publisher still points at its old standalone repo fails with a 401 that names no cause. Two things there are load-bearing: the **filename** `publish.yml`, which npm binds each package's trusted publisher to, and the absence of `registry-url:` on `setup-node`, which would otherwise write an `.npmrc` whose empty `NODE_AUTH_TOKEN` shadows the OIDC exchange. `workflow_dispatch` with `dry_run` is the manual path.

A **brand-new package cannot bootstrap through this workflow.** npm only exposes trusted-publisher settings for a package that already exists, so the first version has to go up by hand (`npm publish` from the package directory, granular token or 2FA) *before* the manifest lands on `main`; only then can the publisher be registered and CI take over. Pushing first is not destructive — `release.ts` skips versions already on the registry, so the next run is a no-op — but the `publish` job goes red with the same causeless 401 until the registration exists. `@aibulat/svelte-admin-kit@0.2.0` is in exactly this state: added to the repo, never published, no trusted publisher registered.

Every published package declares `"prepack": "pnpm run build"`. That is what puts `dist/` in the tarball — it is gitignored, and nothing else in CI builds it. (For `svelte-admin-kit` that `build` is `svelte-package`, not tsdown, but the contract is identical.) Never add `prepublishOnly` to a package: `release.ts` already runs `build`, `typecheck` and `test` at the root before anything is published, and a second in-package chain double-runs the suite in the middle of a publish.

## Tests

Native `node:test`, no framework, everywhere except `svelte-admin-kit` — which uses **vitest**, because a Svelte toolchain needs a Svelte-aware transform. Tests live in `<package>/test/*.test.ts` (`tests/` in `restclients`, `src/*.test.ts` in `funtest`, `src/tests/*.test.ts` in `svelte-admin-kit`) and import the real `src/*.ts` — nothing is built first.

```bash
pnpm --filter @aibulat/run run test
cd packages/run && node --import ./test/register.ts --test test/vt.test.ts   # one file
cd packages/run && node --import ./test/register.ts --test --test-name-pattern="Device Status" test/vt.test.ts
```

Node strips the TypeScript types itself; the only missing piece is resolution, which `test/register.ts` supplies via `module.registerHooks`. It teaches Node the two things the sources rely on the bundler for: the `@/*` and `$/*` path aliases, and extensionless relative imports (`from "./librun"`). `run`, `naser`, `isfile`, `fs` and `sendeml` load it with `--import` in their `test` script; a new package written in that style needs a copy of the file. The copy in the three migrated packages carries one extra branch — a `.js` → `.ts` candidate — because their sources name the emitted sibling (`from './dir.js'`) rather than importing extensionless.

`http`, `restclients` and `funtest` need no `register.ts`: they import with explicit `.ts` specifiers (`from './cli.ts'`) and use no path aliases, so bare Node resolves them. That is a deliberate second convention, not an oversight — see **Conventions** below.

`src/tests/*.ts` in `packages/run` are **not** part of this suite — they are manual smoke scripts (`runvt`, `watch`, `sql`) that build to executable `dist/tests/*.js`. The identically named `src/tests/` in `svelte-admin-kit` **is** its real suite; the collision is unfortunate but the two are unrelated.

Notes for writing tests here:
- `DBLog` takes a directory, so point it at an `fs.mkdtemp` dir rather than the real log store.
- PTY tests spawn `process.execPath`. A child that reads the DSR reply must call `process.stdin.setRawMode(true)` — in canonical mode the tty holds the reply until a newline that never arrives, and the test hangs.
- `FSMonitor.watch()` returns the chokidar watcher; close it in `t.after` or the test process will not exit.

## `@aibulat/run` architecture

Everything funnels through one function: `run()` in `src/lib.ts`. The CLI, the fs-monitor handlers and the experimental shell all call it, and it performs the whole pipeline — mint a UUID → load the env file with `dotenv` (with optional `cleanVars()`, which wipes every env var except `PATH`/`HOME`/`SHELL`) → execute → write the log file → insert a SQLite row → optionally POST to the web logger.

**Execution** goes through a PTY, not `child_process`. `runVT()` in `src/librun.ts` drives the `VT` class in `src/vt.ts`, a `@lydell/node-pty` wrapper that buffers all output in memory (output is printed only after the process exits). `VT` intercepts DSR cursor-position queries (`\x1B[6n`) and answers them itself — without this, TUI programs like `glow` hang until they time out, and the escape sequence is deliberately kept out of the captured output. A missing executable does not reject: the fork succeeds, `execvp` fails inside the child, and the run is logged normally with `rc=1`.

**CLI dispatch** — `src/cli/run.ts` uses commander with `allowUnknownOption(true)`, which is why a `--` separator is needed when the wrapped command has flags that collide with `run`'s own. It branches into:
- `runStandard` — `-r <count>` repeats (`-r 0` = forever, via `runForever`), `-p <seconds>` pauses between runs.
- `runMonitoring` — `--monpath/--monext/--monevents`; `-r`/`-p` are ignored in this mode.

Pure argument parsing lives in `src/cli/args.ts` (`getExtensions`, `getEvents`, `replaceArgs`, which substitutes `%path`/`%size`/`%mtime`) so it can be unit tested. `getEvents` **throws** on an unknown event; `run.ts` catches it, prints, and exits 1.

**Logging fans out three ways** from a single run:
- `src/logging/logging.ts` owns the log dir `~/.local/state/ngm/logs` (printed by `run --logs`) and the `run-<timestamp>-<cmd>.log` filename convention.
- `src/logging/dblog.ts` — `node:sqlite` `DatabaseSync` over `run.db` in that dir, table `runlog`. Note the `output` column stores the log **filename**, not the output itself.
- `src/logging/weblog.ts` — active only when `NGM_LOG_URL` is set; POSTs metadata to `$NGM_LOG_URL/api/log` and the raw output to `/api/output`, correlated by the run's UUID. Transport failures are logged to stderr and swallowed.

Readers of that data: `logview` renders the `runlog` table with `cli-table3`; `output <id>` looks up the row, resolves its filename against the log dir, and prints the file.

`src/fsmonitor.ts` is a thin chokidar wrapper (`add`/`change`/`unlink` handlers plus a catch-all `all` handler; extension filtering is implemented through chokidar's `ignored` predicate).

`src/cli/shell.ts` + `src/shell/` is an experimental REPL: built-ins live in a `Map<string, Handler>` in `shell/commands.ts`, and anything else is resolved against `PATH` and then routed through the same `run()`.

## `@aibulat/http`, `@aibulat/restclients`, `@aibulat/funtest`

These three moved in from standalone repos. They still differ from `run`/`naser` in how they import (explicit `.ts` specifiers, no path aliases — see **Conventions**), but the build is now identical everywhere: `tsdown` alone, producing the bundles and the `.d.ts` in one pass.

**`http`** — one bin per HTTP method, all bundled into `dist/bin/`. Two things in `src` resolve paths from `import.meta.url`, and neither may assume a bundling depth, because the same module ends up at `src/`, `dist/` and `dist/chunks/` in different builds:

- `src/version.ts` walks *up* from its own directory to find `package.json`, rather than hardcoding `../package.json`. Once inlined into `dist/bin/get.js` the hardcoded form pointed at `dist/package.json`, which does not exist.
- `src/link.ts`'s `binSourceDir()` walks up until a `bin` directory turns up. Under tsup this module was inlined into every `dist/bin/*.js` and a single `basename(here) === 'bin'` check sufficed; tsdown hoists it into `dist/chunks/` instead, where that check silently produced `dist/chunks/bin`. The e2e suite links for real into a temp dir precisely to catch that.

`head` and `patch` are built into `dist/bin/` but deliberately kept out of the `bin` map — they would shadow coreutils `head` and GNU `patch` — so `httpc link head patch` symlinks them on demand. **They must stay in the tsdown `entry[]` even though they are not in `bin`.** `scripts/postbuild.mjs` runs from `onSuccess` and is a gate, not a convenience: it hard-fails if a bin lost its `#!/usr/bin/env node`. It is invoked with `execFileSync`, not `exec` — a gate whose exit code nothing waits for is not a gate. Its config also pins `outputOptions.chunkFileNames` to `chunks/`, because that gate treats every `.js` under `dist/bin/` as a bin.

**`restclients`** — a library with nine subpath entries and no root import (`exports` maps `"."` to `null` on purpose). One setting in its `tsdown.config.ts` is load-bearing:

- **`platform: "neutral"`, not `"node"`.** The library must run in the browser — its tsconfig sets `types: []` and pulls in `lib.DOM` for `fetch` deliberately.

Every subpath barrel re-exports `HttpError` from `core` so consumers can `instanceof`-check without a second import, and that only works while the nine bundles share one copy of the class through a split chunk. Under tsup this needed `splitting: true`; in tsdown splitting cannot be turned off, so it is structural rather than configurable. `ci.yml`'s `consumer` job asserts the identity either way.

`oxlint` (`.oxlintrc.json`) lints this package. It is not the repo's only linter — `svelte-admin-kit` brings ESLint, because oxlint cannot parse `.svelte`.

**`funtest`** — not a library. The published artifact is compiled test files; `bin/run.sh` prefers `dist/*.test.js` and falls back to `src/*.test.ts`, resolving `$0` through symlinks and passing explicit paths because Node's test runner skips `node_modules` during discovery. It declares **no `test` script** — its whole suite is live — which is what keeps root `pnpm run test` hermetic.

## The unscoped members: `mk-swagger-ui` and `create-tsreact`

Two members publish without the `@aibulat/` scope. The reasons differ: `mk-swagger-ui` *may* stay unscoped because renaming would forfeit an existing trusted-publisher path, while `create-tsreact` *must*, because the name is load-bearing at the call site.

### `mk-swagger-ui`

Restored from its **published tarball**, not from a repo — `mk-swagger-ui` had been on npm since 2022 (last release 1.0.6) with no GitHub repository and no local checkout. Nothing in it was compiled, so the 14 published `.mjs` and `.sh` files were the source; 1.0.0 through 1.0.6 were diffed and 1.0.6 is a strict superset. It follows the `run`/`naser` **alias style** (tsconfig `paths`, extensionless relative imports, `test/register.ts` under `node --test`) and builds with tsdown like everything else.

**The npm name has no scope, and that is deliberate.** Renaming to `@aibulat/swagger-ui` would have meant a brand-new package, which cannot bootstrap through `publish.yml` — npm only exposes trusted-publisher settings for a package that already exists (the trap `@aibulat/svelte-admin-kit` is still in). `mk-swagger-ui` already exists, so its trusted publisher can be registered against `ngmaibulat/packages` + `publish.yml` immediately and CI takes over from there. **That registration must exist before a bumped manifest lands on `main`**, or the `publish` job fails with the same causeless 401. The directory basename is `mk-swagger-ui`, so `bump.ts` tags it `mk-swagger-ui@x.y.z`.

Three things about the published 1.0.6 were fixed rather than restored, and they are the reason the port is not byte-faithful:

- **It wrote into the caller's working directory.** `bin/mk-swagger-ui.sh` copied a `sample-package.json` into `$PWD` as `package.json`, ran `npm install js-yaml swagger-ui-dist serve` there, and copied the assets out of the *user's* `node_modules`. The renderer is a real dependency now and `src/assets.ts` resolves it from our own tree. Nothing outside the output directory is touched, and there is no depth assumption for tsdown's splitting to break.
- **It registered six bins**, four of them squatting `list`, `clean`, `get-ui`, `get-editor` and `get-codegen` in the global `PATH` — the same hazard `@aibulat/http` avoids by keeping `head`/`patch` out of its `bin` map. They are commander subcommands of the single `mk-swagger-ui` bin now. `bin/fname.mjs` (a one-line `path.parse().name`) and `bin/help.mjs` have no successor by design.
- **It ended with `npx serve dist` and blocked.** Preview is opt-in behind `--serve [port]`, served by `src/serve.ts` (~40 lines of `node:http`), so the package needs neither the network nor a dependency to preview.

The `types` subcommand keeps the old `utils.mjs` generator's behaviour with two corrections: an array of `$ref` now renders as `Array<Pet>` rather than `Array<any>` (the original ran the referenced *name* through the primitive mapping), and `number`/`boolean` map to themselves instead of falling back to `any`. Everything unrecognised still answers `any`.

**The renderer is Scalar, not Swagger UI** — the name is now historical. `swagger-ui-dist` is gone; the output is four files (`index.html`, `scalar.js`, `scalar-initializer.js`, `<name>.json`) instead of ten. Three things about that are load-bearing:

- **It copies `dist/browser/standalone.js`, never `standalone.esm.js`.** Only the former is a self-contained IIFE; the ESM sibling lazy-loads ~90 files out of `chunks/`, so a folder built from it 404s the moment anything is clicked. A test asserts the copied bundle names no chunks.
- **`@scalar/api-reference` publishes an `exports` map that lists neither `./package.json` nor anything under `dist/browser`.** `require.resolve("@scalar/api-reference/package.json")` therefore throws `ERR_PACKAGE_PATH_NOT_EXPORTED` — the trick that works for an ungated package does not work here. `src/assets.ts` resolves the one exported entry and **walks up to the manifest that names the package**, rather than assuming how deep that entry sits.
- **The generated page is offline by default.** Scalar's theme pulls webfonts from `fonts.scalar.com` and its client can proxy "Test Request" traffic through `proxy.scalar.com`; the initializer is written with `withDefaultFonts: false` and no `proxyUrl`, and tests assert the output references no external host. `--fonts` opts back in. Verified for real: the generated site renders fully in headless Chromium with `--host-resolver-rules="MAP * 0.0.0.0, EXCLUDE 127.0.0.1"`.

The range is `^1.64.1`, not the newest `1.65.1`, because the latter is younger than the workspace's `minimumReleaseAge` policy — widening the range is the right answer there rather than a `minimumReleaseAgeExclude` entry. Scalar's Vue chain also drags in `vue-demi`, whose postinstall retargets it at the installed Vue major; that only matters to code importing the Vue library at run time, which this package never does, so it is denied in `allowBuilds`.

`get` gained a `scalar` target alongside the three swagger-api repos. `REPOS` carries each clone's **directory name** rather than deriving it, because `clean` used to assume every entry was `swagger-<key>` — true for the original three, false for `scalar`.

### `create-tsreact`

**The name cannot be scoped.** `npm create tsreact` resolves to the package literally named `create-tsreact`; scoping it would change the invocation to `npm create @aibulat/tsreact` and orphan every existing install. It was already on npm at `0.0.29`, so — like `mk-swagger-ui` and unlike `@aibulat/svelte-admin-kit` — its trusted publisher can be registered against `ngmaibulat/packages` + `publish.yml` right away. **Register it before a bumped manifest lands on `main`.** `bump.ts` tags it `create-tsreact@x.y.z` from the directory basename.

**It arrived as a four-package pnpm workspace and was flattened into one.** `packages/cli` was the only published member; `@tsreact/bruno`, `@tsreact/pm` and `@tsreact/png` were private, versioned `0.0.0`, exported raw `.ts`, and were consumed as `workspace:*` devDependencies. They are now `src/bruno/`, `src/pm/` and `src/png/` inside the single package, reached through the `@/*` alias. Keeping them as members would have meant `workspace:*` ranges, which **`bump.ts` and `release.ts` both refuse**, and a fourth source-resolution style on top of the three that already coexist. Relative imports name the emitted sibling (`from "../apiFiles.js"`), so this follows the **migrated-nine alias style** and needs their `register.ts` with the `.js` → `.ts` probe branch.

**The build moved from a bare esbuild CLI to tsdown**, and the committed 120 kB `bin/index.js` is gone — `dist/` is gitignored and `prepack` produces it like everywhere else. Two knock-on effects: `chalk` was previously inlined by `--bundle` and is now a genuine external runtime dependency (tsdown externalises `dependencies`), and the old `prepublishOnly` was dropped per the repo rule. The old husky pre-commit hook existed only to rebuild and re-stage that bundle; it, `lint-staged` and `oxfmt` were all dropped. `oxlint` stayed, pinned to `1.78.0` to match `restclients`.

**`readVersion()` is gone.** It read `../package.json` off `import.meta.url`, which only held while the bundle sat at `bin/index.js`. It is now `import packageJson from "$/package.json" with { type: "json" }` — the same idiom as `run --version`, inlined at build time, with no depth assumption for splitting to break.

**`smoke.mjs` is `test:live`, not `test`.** It scaffolds all eight templates into a temp dir and then installs, type-checks and builds each one — minutes, and networked. Following the `funtest` precedent it runs in `live.yml` and never gates CI. The hermetic `test` script is a separate `node:test` suite over the pure functions (`parseArgs`, `validateName`, the template tables, `detectPm`, `infer`, `encodePng`/`icon`); it is what root `pnpm run test` picks up. Run `test:live` by hand before releasing — nothing else exercises the presets.

**There are no template files on disk.** Every scaffolded file is a template literal returned from one of the 58 `gen*.ts` modules, and the PWA icons are generated in-process by `src/png/`. The usual `create-*` packaging hazards — `_gitignore` renames, nested fixture manifests, assets caught by the root `.gitignore` — do not apply. The `createRequire(...)("./package.json")` in `genRolldownConfig.ts` is **generated output** for the scaffolded app, not code that runs here; leave it alone.

The original repo still exists at `~/projects/npm/create-tsreact/`, including a much longer `CLAUDE.md` covering the generators in detail.

## The nine packages moved in from standalone repos

`isfile`, `json`, `fs`, `mark`, `sendeml`, `watch-dir-count`, `auth`, `installer` and `ctl-ufw` were nine separate one-package repos, each with its own lockfile, its own `tsc`/`esbuild`/`rollup` build and its own `publish.sh`. They were copied in (no history graft; the originals still exist under `~/projects/npm/`) and converted to the repo's conventions in one pass. They follow the `run`/`naser` **alias style** — tsconfig `paths`, `test/register.ts` under `node --test`.

**The internal dependency graph now lives here.** `isfile` is the leaf; `json`, `fs`, `mark`, `naser` and `sendeml` depend on it, and `watch-dir-count` depends on `fs` and `json`. `scripts/release.ts` publishes in that topological order and `scripts/bump.ts` cascades bumps through it. The ranges are **plain semver, never `workspace:*`** — pnpm still links them locally because the local version satisfies the range, but only because `linkWorkspacePackages: true` is set in `pnpm-workspace.yaml`. pnpm 10 flipped that default to `false`; leaving it off makes internal ranges resolve from the **registry**, which breaks any release that bumps a package and its dependents together. Turning it on is what makes that work, and is also the direct cause of the build-order constraint below. Two ranges were unsatisfiable on arrival and had to be corrected: `json` asked for `isfile@^0.0.3` (caret does not cross the patch on `0.0.x`) and `watch-dir-count` asked for `json@^0.0.8`, a version that does not exist.

**Their `register.ts` has an extra resolution branch.** These sources came from `tsc`-built repos, so sibling imports name the emitted file (`from './fileType.js'`). `run`/`naser` import extensionless and never needed that, so the copy in these packages adds a `.js` → `.ts` candidate to `probe()`. Do not "simplify" it back.

**Type-only imports had to be marked as such.** Written for `tsc`, these sources imported types as values (`import { PathLike } from 'node:fs'`, `import { FileStat } from './types.js'`). That erases silently under `tsc` but breaks twice here: rolldown fails the build with `MISSING_EXPORT`, and Node's type-stripping emits a real named import that does not exist at runtime. Every such import now carries the `type` modifier. New code in these packages must too.

**`fs` is the install risk.** `posix` is a genuine native compile — no prebuilt binaries, node-gyp on install — so it is allow-listed in `pnpm-workspace.yaml` and needs make, a C++ compiler and python on every machine that installs the workspace, CI included. It builds clean on Node 26 (warnings only). `@npcz/magic` carries libmagic as WASM and `getFileType` initialises it at module load, so importing `@aibulat/fs` is not free. libmagic's wording is version-dependent — the filetype test matches `/JSON/` rather than an exact phrase, because the same file reports `JSON data` on older releases and `JSON text data` on newer ones.

**`installer` and `ctl-ufw` no longer shebang to `zx`.** Their bins used `#!/usr/bin/env zx` while declaring `zx` only as a devDependency, so the published commands depended on something consumers would not have. They now use the repo-standard node shebang, `import "zx/globals"` at the top of each entry, and `zx` as a real dependency. `installer`'s old `build.sh` is gone — it shelled out to an undeclared global `rollup` and ran `git add .`.

**They are on `zx@8`, and every entry that runs a command sets `$.verbose = true` explicitly.** zx 8 vendors all its dependencies and declares none, which is what got `node-domexception` (via `node-fetch` → `fetch-blob`) out of the workspace along with `fs-extra`, `globby`, `ps-tree`, `webpod`, `yaml` and `minimist`. The catch is that v8 flipped `$.verbose` from `true` to `false`, and these are provisioning scripts whose whole point is showing what `apt`/`systemctl`/`ufw` printed — without the explicit assignment they run silently and look hung. `gen-pw.ts` is the one entry that does not set it, because it runs no commands. The other v8 breaks are no-ops here: the removed SSH API is unused, the PowerShell default is Windows-only, and `syncProcessCwd` being off matters only to code calling `cd()`.

**Only three of the nine have a `test` script.** `isfile`, `fs` and `sendeml` ship real tests; the other six declared a `test` script with no test files, and following `funtest`'s precedent they now declare none rather than passing vacuously. `sendeml`'s suite asserted on a `./queue` directory that only exists after `getsamples.sh` downloads a corpus — it uses `fs.mkdtemp` instead, so root `pnpm run test` stays hermetic. Nothing in these packages talks to MySQL or SMTP under `test`.

**`watch-dir-count` ships `templates/`** (listed in `files`) and resolves the default template by walking up from `import.meta.dirname` to find the directory. The old `./templates/default.eml` only worked when the process happened to start in the package root, which an installed global never does. The walk rather than a fixed `../templates` is the same lesson as `http`'s `link.ts`: splitting is unconditional, so the module's depth is not fixed. Its `log.cfg.json` is read from the *working* directory.

**`watch-dir-count` logs through `pino`, not `bunyan`.** bunyan pulled four deprecated packages into the workspace through its *optional* `mv` dependency (`mv` → `rimraf@2.4.5` → `glob@6.0.4` → `inflight`), plus `moment`, `ncp`, `mkdirp@0.5` and the `dtrace-provider` native binding that `allowBuilds` then had to suppress. `src/logger.ts` keeps the bunyan-shaped `log.cfg.json` schema on purpose — this is a published CLI whose users already have those files — and translates it into a `pino.multistream()`. Three things there are load-bearing: bunyan's level *numbers* are pino's too (`trace` 10 … `fatal` 60), so config values carry over untouched; the logger's own `level` must sit at the **most verbose** of the configured streams, because pino filters before multistream is consulted and otherwise the quietest stream decides what every other one gets; and `@types/nodemailer` declares `Logger.level` as a **method** while pino exposes it as a string property, so `logger.ts` exports a `mailLogger` adapter rather than passing the pino logger straight through the way bunyan could be. `pino.destination({ mkdir: true })` also fixed the old ENOENT — the log dirs no longer have to exist first.

**`sendeml` is mid-restructure and was moved as-is.** `src/mailsend/smtp.ts` duplicates `src/smtp.ts` line for line, `src/server/deliver.smtp.ts` is empty, thirteen files under `filter/`, `filterattach/`, `sign/` and `encrypt/` are one-line placeholders, and `emailjs` is declared but never imported. That is upstream state, not migration damage; leave it alone unless asked to finish the restructure.

Three latent bugs surfaced when these packages met a `typecheck` script for the first time, and were fixed rather than suppressed: `fs` set `FileMagic.defaulFlags` (a typo — the flag never applied), `auth` called `knexpkg.knex(...)` where knex 2.x wants the named export, and `watch-dir-count`'s `render-hbs.ts` demo called `renderEmail` with two of its four arguments. `mark` carries one deliberate cast: `@types/marked-terminal` is stuck at 3.x with no 4.x/5.x on npm and `marked-terminal` ships no types, so its renderer does not structurally match what `@types/marked@4` wants. The two are compatible at runtime; only the stubs disagree.

## `@aibulat/svelte-admin-kit` and the `svelte-package` exception

This is the only member that does not build with tsdown, and the reason is structural rather than a preference. A Svelte component library ships **uncompiled `.svelte` source** alongside generated `.d.ts`: the consuming app's own Svelte compiler is what turns it into JS, which is what lets each app pick its own compiler options, hydration mode, dev warnings and preprocessors. Precompiling here — which is all tsdown could do — takes that away and breaks HMR downstream. `svelte-package` (`@sveltejs/package`) exists to do exactly this, so `build` is `svelte-package && publint`.

Consequences of that, all of which differ from every other package here:

- **`svelte-package` reads `src/lib`, not `src`.** It copies `src/lib` → `dist` (`.svelte` files pass through untouched, `.ts` gets transpiled, `.d.ts` gets generated per file). `src/tests/` sits outside `src/lib` on purpose and never ships.
- **The `exports` map is hand-written and points into `dist/`.** There is no `entry[]` to keep in sync, but adding a subpath still means editing **both** the `exports` map and the barrel it names — the analogue of the `entry[]`/`bin` rule for the tsdown packages. `pnpm --filter @aibulat/svelte-admin-kit run build` is what proves the two agree; publint fails the build on a target that does not exist.
- **Each entry carries a `"svelte"` export condition** next to `types`/`default`. That is how a bundler knows to hand the file to the Svelte compiler. Dropping it makes consumers try to execute `.svelte` files as JS.
- **No `attw`.** The repo runs `publint` + `attw` in `build` everywhere except `funtest`; this package is the second carve-out. attw has no meaningful verdict on a public surface made of `.svelte` files. `publint` still runs.
- **The build is not hermetic against the rest of the workspace.** `@sveltejs/package` reaches TypeScript through a bare `await import('typescript')` that it declares nowhere, so under pnpm's isolated layout it resolves out of the hidden store (`node_modules/.pnpm/node_modules`). This workspace has three TypeScript majors in it — 5.7 (`run`, `naser`), 6.0 (`svelte-admin-kit`), 7.0 (`http`, `restclients`, `funtest`) — and pnpm hoisted 7.0, whose entry point exports no `ts.sys`. `svelte-package` then died in `load_tsconfig` with `Cannot read properties of undefined (reading 'readFile')`, a build failure caused entirely by an unrelated package's devDependency. The fix is a `packageExtensions` entry in `pnpm-workspace.yaml` declaring `typescript` as a peer of `@sveltejs/package`, which makes pnpm link the importer's copy (6.0.3) into its own `node_modules`, where it beats the hidden store. **Removing that entry re-breaks the build**, and the error names neither TypeScript nor the package that pulled the wrong one in.

- **The eleven `@tiptap/*` ranges are exact, and `pnpm-workspace.yaml` pins twenty more.** tiptap's extensions register against one copy of `@tiptap/core` and its peer ranges are exact, so the tree has to be uniform. But `@tiptap/starter-kit` depends on the leaf extensions by *caret*, so a lockfile resolved today floats twenty of them past the pinned core — the mismatch `pnpm peers check` reports. An `overrides:` block pins them back to 3.27.3. Bump the overrides and the eleven manifest ranges **together**; nothing in the suite renders the editor, so a split tree would not surface until runtime.

Tests here are **vitest**, not `node:test` — the only member that is. All three suites are pure-function or CSS-source-text assertions and render no components, so root `pnpm run test` stays hermetic. `vite.config.ts` exists only to configure vitest; it builds nothing. It sets `css: true` because vitest otherwise stubs CSS modules to an empty string, which would also empty the `?raw` imports `themeTokens.test.ts` reads the stylesheets through.

## Nexie: the second entry in `@aibulat/indexeddb`

`packages/indexeddb` builds **two roots**, `src/index.ts` and `src/nexie.ts`, and
publishes the second as the `./nexie` subpath. Nexie is a **clean-room
re-implementation of the Dexie 4 API** — Dexie is Apache-2.0, this package is MIT,
and no Dexie code was copied, so there is no `NOTICE` here. It is deliberately not a
drop-in: `Dexie` → `Nexie` and migration is a rename. Dexie-branded *identifiers*
are renamed; API-visible *strings* are not (error `name` values, the schema DSL, the
`'rw!'`/`'r?'` modes, `':id'`), because consuming code matches on those.

Four things are load-bearing:

- **The two graphs must stay disjoint.** Nothing under `src/nexie/` may import
  `src/entry.ts`, `src/wrap-idb-value.ts`, `src/database-extras.ts`,
  `src/async-iterators.ts` or `src/util.ts`. The decisive reason is not tidiness:
  `promisifyRequest` in `wrap-idb-value.ts` returns a **native** promise, and
  `await` on one of those never reads `.then`, so the transaction zone would die on
  every request. The bonus is that tsdown's unconditional splitting emits no shared
  chunk, which keeps `dist/index.js` byte-identical. **Verify it, do not assume it:**
  after any change, `md5sum dist/index.js` against the previous build and check that
  `dist/chunks/` does not exist. `src/nexie/dbcore/request.ts` duplicates ~30 lines
  of request promisification on purpose.
- **The zone is the crux.** `src/nexie/zone/` carries "which transaction am I in"
  across `await` using two complementary mechanisms — an echo FIFO and `then` as a
  **getter** that captures the zone synchronously at the await point. Neither works
  alone; the Phase 0 spike falsified the echo on its own. There is no patching of
  `globalThis.Promise` and no `ZONE_ECHO_LIMIT`, unlike Dexie. `AsyncLocalStorage`
  is not an option — `platform: "neutral"`. Every public API must return an
  `NexiePromise`; a helper handing back a bare `async` function's promise is a bug.
- **Every read and every write goes through DBCore**, cursor walks included. That is
  what lets one hooks middleware see all writes and one observability middleware see
  all reads. A read that bypasses it is a `liveQuery` that silently never re-fires —
  a failure with no symptom where it is caused. `Collection`'s walk drives a
  `DBCoreCursor` rather than an `IDBCursor` for exactly this reason.
- **Invalidation over-approximates on purpose.** `liveQuery` is exact on primary
  keys and on secondary indexes for `add`; `put`/`delete`/`deleteRange` widen to the
  whole index, because narrowing them means reading the old record first (the
  `cacheExistingValues` middleware, not yet written). Keep the direction: a superset
  costs a wasted re-run, a subset costs a view that silently stops updating.

**All six phases are done.** The API surface is complete apart from the query result
cache (`cache: 'immutable' | 'cloned'`), which is deliberately absent — it is a
performance layer, `liveQuery` is exact without it, and it is the highest bug density
per line in Dexie. The README's **Differences from Dexie** section is the canonical
statement of what is not there; keep it true.

Two more things that are load-bearing, both found by tests rather than reasoning:

- **`NexiePromise.follow` must compose the zone's finalizer, never replace it.**
  `newZone` installs one that decrements the parent zone's counter, and a `follow`
  nested inside another `follow` — an `on('populate')` subscriber opening a
  transaction scope — strands the parent above zero forever if it is dropped. The
  symptom is a database that opens and never resolves.
- **Nothing may add a stray promise listener in a non-global zone.** Every listener
  job arms one echo, and the FIFO is only correct while echoes pair 1:1 with native
  resume jobs. A listener whose job enqueues no resume job hands its zone to whatever
  runs next — a nested scope's zone leaked into the caller's continuation exactly
  this way. `Transaction._zoneLost` is computed on demand for that reason.
- **A derived promise belongs to the zone `then` was read in, not the ambient one.**
  `_thenIn` is called a microtask later from `PromiseResolveThenableJob`, where the
  ambient zone is the echo front — some unrelated scope. Creating the derived promise
  there attributes the caller's work to that scope and `follow()` then waits on it: a
  fire-and-forget `db.transaction()` on an already-open database hung outright.
  **Test both open paths.** Bugs of this family reproduce only when
  `db.transaction()` reaches the scope synchronously; opening lazily inserts a
  microtask that hides them, and a suite that always opens lazily sees nothing.

`erasableSyntaxOnly` is set: no parameter properties, no enums. `Symbol.observable`
is read off `Symbol` at runtime with an `'@@observable'` fallback rather than
declared via `declare global`, which would pollute every consumer's types.
`Nexie.semVer` is substituted by tsdown's `define` from package.json, so it cannot
drift; running the sources directly it reads `0.0.0-src`.

## The two runtimes: `@aibulat/indexeddb-impl` and `@aibulat/indexeddb`

Every other package targets Node. These two must also pass under **Bun**, and
that is not a formality — four real defects in the implementation surfaced only
there, all of them latent bugs rather than Bun quirks, and Nexie's zone rests on the
normative ordering of `Await` and promise-resolve-thenable jobs, which is precisely
the kind of claim that deserves a second engine (Bun is JSC, Node is V8). Keep both
`test:bun` scripts green alongside `test`; each pair reports identical totals, and a
divergence is the signal. CI's `bun` job runs both.

The rest of this section is about `indexeddb-impl`, whose suites are the ones that
had to change. Two differences drive almost everything:

- **Bun shares one process across test files; `node --test` forks one per file.**
  A side-effect import therefore runs *once* under Bun, so anything that relies
  on re-importing a module to re-run it silently no-ops. That is why
  `installGlobals()` exists next to `src/auto.ts`, and why tests must call it
  rather than re-importing `auto`. The same trap applies to any global-mutating
  fixture added later.
- **Bun does not support `test()` inside `test()`** ([oven-sh/bun#5090](https://github.com/oven-sh/bun/issues/5090)),
  which `node:test` does. `test/wpt/run-all.js` therefore awaits each file's
  child process *before* registering its assertions, so they are siblings inside
  a `describe()`. `describe` nesting is fine on both. Do not "simplify" that back
  into a nested `await t.test(...)`.

Also load-bearing there: verdicts are computed synchronously during that loop,
not inside the test callbacks, because `GENERATE_MANIFESTS=1` writes the
manifests at the end of each iteration and callbacks have not run by then.

The vendored corpora under `test/wpt/` and `test/qunit/suite/` are third-party
and kept byte-close to upstream so they can be re-synced; they are in
`.prettierignore` and excluded from `tsconfig.test.json`. Local edits to them
(there are three, all runtime-compatibility fixes) carry a comment saying so.

**There are no per-runtime manifest overrides, deliberately.** Upstream keyed
them on `node${major}` from `process.version`, which under Bun reports a *Node*
version that says nothing about Bun — so that key would have silently applied
Node's expectations to Bun. The lookup is keyed on the actual runtime now
(`node26`, `bun1`), but the directory is empty and should stay that way: the two
runtimes agree exactly, and that agreement is the signal. Fix a divergence
rather than recording it.

The `bun` job in `ci.yml` is what enforces the second runtime. It must report
the same pass/skip/fail totals as the Node job.

## Conventions and constraints

- **Three source-resolution styles coexist, and mixing them breaks things.** `run`, `naser` and the nine migrated packages use tsconfig path aliases, resolved by tsdown at build time and `test/register.ts` under `node --test`; `run`/`naser` import relatives extensionless, the migrated nine name the emitted `.js` sibling, and their `register.ts` handles both. `http`, `restclients` and `funtest` instead import with explicit `.ts` specifiers and rely on `allowImportingTsExtensions` + `rewriteRelativeImportExtensions`; rewriting one of those specifiers to `.js` breaks running the sources directly. `svelte-admin-kit` is the third: plain extensionless relative imports with no path aliases, resolved by `svelte-package` at build time and by vite under vitest. It needs no `register.ts` and must not grow one.
- **The PTY is prebuilt, never compiled.** `@lydell/node-pty` ships per-platform N-API binaries as optional dependencies and declares no install scripts, so there is no node-gyp and no gcc/python requirement. Do not switch back to upstream `node-pty`: its NAN binary is tied to a `NODE_MODULE_VERSION` and breaks on every Node major upgrade.
- **Leave `nodeProtocol` alone.** tsdown keeps `node:` specifiers as written, which is what these packages need — stripping the prefix turns `node:sqlite` into `sqlite`, a package that does not exist, and the built CLI dies at startup with `ERR_MODULE_NOT_FOUND`. (tsup did strip it by default, hence the `removeNodeProtocol: false` that used to be in every config.) Always smoke-test a built bin (`node dist/cli/run.js --version`) after touching the build config.
- **Code splitting is unconditional.** tsdown has no `splitting: false`, so any module reachable from two entries lands in a shared chunk instead of being inlined into both. Nothing may assume "this file is the entry that imported me" — see `http`'s `link.ts` above for what that costs when violated.
- **`outExtensions` is pinned to `.js`/`.d.ts` in every config.** tsdown defaults to `.mjs`/`.d.mts`; every `bin`, `main`, `types` and `exports` entry in this repo names the plain extensions.
- **Path aliases** (tsconfig `paths`, resolved by tsdown at bundle time and by `test/register.ts` under `node --test`): `@/*` → `src/*`, `$/*` → package root. The `$/package.json` JSON import is how `run --version` gets its number.
- **Bin shebangs** are `#!/usr/bin/env -S node --no-warnings` — the flag suppresses the `node:sqlite` experimental warning; keep it on new bins. It must be `/usr/bin/env`, not `/bin/env`: the latter does not exist on macOS or on distros without the `/usr` merge, and `publint` fails the build over it.
- **`publint` and `attw` run as part of `build`,** so a packaging mistake fails before `prepack` can publish it. `attw` uses `profile: "esm-only"` because nothing here ships CJS. Two packages run `publint` only: `funtest`, whose sole `attw` finding is "package has no types" (the design), and `svelte-admin-kit`, whose public surface is `.svelte` files that attw has no verdict on.
- **`engines.node` varies per package and CI runs the highest floor.** `run`/`naser` and the nine migrated packages say `>=22.5`, `restclients` `>=20`, `funtest` `>=22.18`, `svelte-admin-kit` `>=22.12` (vite 8), `http`, `indexeddb` and `indexeddb-impl` `>=26`. The last two also declare `engines.bun: ">=1.3"`, the only packages that do — npm ignores that field, but Bun reads it, and it is the machine-readable half of the two-runtime policy. CI is pinned to **26** because that is the only version that satisfies all of them; nothing in the migration raised that floor. Linux is the tested platform, and `packages/fs` makes that stricter than a preference — `posix` compiles at install time and `@npcz/magic`, `passwd-user` and `posix` are all POSIX-only. Those floors are for consumers; *building* additionally needs what tsdown itself requires, `^22.18 || >=24.11`.
- **TypeScript versions differ per package, and three majors are live** — `^5.7.3` in `run`/`naser`, `^6.0.3` in `svelte-admin-kit`, `^7.x` in `http`/`restclients`/`funtest`; `@types/node` follows at `^22.x`/`^26.x`. pnpm's isolated layout gives each its own copy; do not try to unify them. The one place this leaks is a dependency that imports `typescript` without declaring it — see the `packageExtensions` note in the `svelte-admin-kit` section.
- **Never use `workspace:*`.** `release.ts` refuses it outright; internal ranges must be plain semver so `bump.ts` can keep them in step. `saveWorkspaceProtocol: false` in `pnpm-workspace.yaml` stops `pnpm add` from rewriting an internal dependency to `workspace:^` behind your back.
- **Build order: `build` before `typecheck`, always, on any tree without `dist/`.** Two settings interact to make this mandatory, and neither is visible from the error you get.

  `linkWorkspacePackages: true` resolves an internal dependency to the sibling **package directory** rather than to its published tarball. The tarball ships `dist/` and the `.d.ts` beside it; the sibling directory does not, because `dist/` is gitignored. So on a fresh checkout `packages/json`'s `tsc --noEmit` looks for `@aibulat/isfile`'s types in `packages/isfile/dist`, finds nothing, and reports:

  ```
  src/readJson.ts(2,20): error TS2307:
    Cannot find module '@aibulat/isfile' or its corresponding type declarations.
  ```

  That message names a module, not the missing build, and not the setting that redirected the lookup. It reads like a broken dependency.

  `pnpm -r run build` is topological, so one root build fixes the whole graph: `isfile` before `json`/`fs`/`mark`/`naser`/`sendeml`, `fs` and `json` before `watch-dir-count`. Both places that gate on `typecheck` build first — `ci.yml`'s step order and `release.ts`'s verify loop (`['build', 'typecheck', 'test']`). **Do not reorder either one**, and do not "optimise" the build away because a previous step already produced `dist/`; CI starts from nothing every run.

  It passes locally with stale `dist/` directories left over from an earlier build, so a local green typecheck proves nothing here. Reproduce CI with `rm -rf packages/*/dist packages/*/.svelte-kit` first.

  The alternative — turning `linkWorkspacePackages` back off — is worse: it makes `pnpm bump` unable to update the lockfile whenever a package and its dependent move together, because the new range names a version that this release has not published yet.
- ESM throughout (`"type": "module"`), strict TypeScript, 4-space indent, Prettier configured to defer to `.editorconfig`. **`svelte-admin-kit` is exempt**: it keeps the upstream Svelte house style (tabs, single quotes, `printWidth: 100`, `prettier-plugin-svelte`) in its own `.prettierrc`, and deliberately has no `.editorconfig`. Reformatting 6.3k lines of ported components to match would produce a diff nobody can review; leave it alone and let `pnpm --filter @aibulat/svelte-admin-kit run lint` be the arbiter.
