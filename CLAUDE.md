# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repo layout

A **pnpm workspace** (`pnpm-workspace.yaml`: `apps/*`, `packages/*`, `examples/*`) with a single root `pnpm-lock.yaml`. Each package under `packages/` is still independently versioned and published, and keeps its own `tsconfig.json` and `tsup.config.ts`. Releases are driven from the root by `scripts/bump.ts` and `scripts/release.ts` — see **Releasing** below.

- `packages/run` → `@aibulat/run`, the substantial package (4 bins: `run`, `logview`, `output`, `shell`).
- `packages/http` → `@aibulat/http`, an HTTPie-style HTTP client, one bin per method (7 registered, plus `head`/`patch` built but opt-in). Zero runtime deps, **Node ≥ 26**.
- `packages/restclients` → `@aibulat/restclients`, typed `fetch` wrappers around nine public REST APIs. A library, not a CLI: no `bin`, subpath exports only, must stay browser-safe.
- `packages/naser` → `@aibulat/naser`, an ANSI→HTML CLI built on `anser`.
- `packages/funtest` → `@aibulat/funtest`, live smoke tests for public REST APIs, published as runnable reference code (`bin`: `funtest` → `bin/run.sh`).
- `apps/docs` → the VitePress documentation site, deployed to GitHub Pages at `https://ngmaibulat.github.io/packages/`. Private, never published to npm.
- `examples/table` — workspace member, `private`, not published.
- `examples/vt` — a Deno scratch experiment (`deno task dev`) using `@sigma/pty-ffi`. No `package.json`, so pnpm skips it; not published.
- `examples/temporal` — loose scratch script, also without a `package.json`.

`dist/` and `apps/docs/.vitepress/{dist,cache}` are untracked build output.

## Commands

From the repo root, across all members:

```bash
pnpm install
pnpm run build       # pnpm -r run build
pnpm run test        # pnpm -r run test      — offline, always
pnpm run test:live   # pnpm -r run test:live — talks to the real internet
pnpm run typecheck   # pnpm -r run typecheck
pnpm run lint        # pnpm -r run lint      — only packages/restclients defines it
```

`pnpm run test` is hermetic and must stay that way: it is what CI gates on. The two
members with live suites (`restclients`, `funtest`) expose them as `test:live`, which
runs nightly in `.github/workflows/live.yml` with `continue-on-error` — an upstream API
being down is not a bug here.

Scope to one package with `--filter`, or `cd` into it:

```bash
pnpm --filter @aibulat/run run test
pnpm --filter @aibulat/run run build   # tsc (typecheck + .d.ts) then tsup (bundle)
pnpm --filter @aibulat/run run dev     # tsup --watch
```

The docs site:

```bash
pnpm --filter docs run dev       # vitepress dev, http://localhost:5173/packages/
pnpm --filter docs run build     # also runs as part of root `pnpm run build`
pnpm --filter docs run preview   # serve the built site, verifies the /packages/ base path
```

Its `base` is `/packages/` because GitHub Pages serves it under the repository name; the deploy is `.github/workflows/deploy-docs.yml`, which builds on push to `main`.

Adding a new CLI or entry point requires editing **both** the `entry[]` array in `tsup.config.ts` and the `bin` map in `package.json`.

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

`scripts/release.ts` (`pnpm release`, `pnpm release:dry`) publishes in topological order. Every check runs against every package before anything reaches the registry: clean worktree, registry state, internal range consistency, credentials, then `typecheck` and `test`. Versions already on npm are **skipped, not failed**, so a half-finished release is safe to re-run.

Publishing happens in CI, not on a laptop. `.github/workflows/publish.yml` fires on a push to `main` touching `packages/*/package.json` and authenticates with **npm trusted publishing** — OIDC, no token, no GitHub Environment. Every published package needs its trusted publisher registered on npmjs.com against repository `ngmaibulat/packages` and workflow `publish.yml`, with the environment field left **empty**; a package whose publisher still points at its old standalone repo fails with a 401 that names no cause. Two things there are load-bearing: the **filename** `publish.yml`, which npm binds each package's trusted publisher to, and the absence of `registry-url:` on `setup-node`, which would otherwise write an `.npmrc` whose empty `NODE_AUTH_TOKEN` shadows the OIDC exchange. `workflow_dispatch` with `dry_run` is the manual path.

Every published package declares `"prepack": "pnpm run build"`. That is what puts `dist/` in the tarball — it is gitignored, and nothing else in CI builds it. Never add `prepublishOnly` to a package: `release.ts` already runs `typecheck` and `test` at the root before anything is published, and a second in-package chain double-runs the suite in the middle of a publish.

## Tests

Native `node:test`, no framework. Tests live in `<package>/test/*.test.ts` (`tests/` in `restclients`, `src/*.test.ts` in `funtest`) and import the real `src/*.ts` — nothing is built first.

```bash
pnpm --filter @aibulat/run run test
cd packages/run && node --import ./test/register.ts --test test/vt.test.ts   # one file
cd packages/run && node --import ./test/register.ts --test --test-name-pattern="Device Status" test/vt.test.ts
```

Node strips the TypeScript types itself; the only missing piece is resolution, which `test/register.ts` supplies via `module.registerHooks`. It teaches Node the two things the sources rely on the bundler for: the `@/*` and `$/*` path aliases, and extensionless relative imports (`from "./librun"`). `run` and `naser` load it with `--import` in their `test` script; a new package written in that style needs a copy of the file.

`http`, `restclients` and `funtest` need no `register.ts`: they import with explicit `.ts` specifiers (`from './cli.ts'`) and use no path aliases, so bare Node resolves them. That is a deliberate second convention, not an oversight — see **Conventions** below.

`src/tests/*.ts` in `packages/run` are **not** part of this suite — they are manual smoke scripts (`runvt`, `watch`, `sql`) that build to executable `dist/tests/*.js`.

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

These three moved in from standalone repos and share a toolchain that differs from `run`/`naser`. They compile with `tsc --emitDeclarationOnly` (declarations only) and let tsup produce every `.js` — not `run`'s `tsc && tsup`, whose entry list happens to cover every source file. Here it does not, and bare `tsc` would leave orphaned unbundled `.js` in `dist/`.

**`http`** — one bin per HTTP method, all bundled into `dist/bin/`. Two things in `src` resolve paths from `import.meta.url` and are therefore sensitive to bundling depth, because the same module ends up at `src/`, `dist/` and `dist/bin/` in different builds:

- `src/version.ts` walks *up* from its own directory to find `package.json`, rather than hardcoding `../package.json`. Once inlined into `dist/bin/get.js` the hardcoded form pointed at `dist/package.json`, which does not exist.
- `src/link.ts`'s `binSourceDir()` checks whether its own directory is already named `bin`. From source it is `src/` and the bins are in `src/bin`; bundled, the code lives *inside* `dist/bin/` and joining `'bin'` again misses by a level.

`head` and `patch` are built into `dist/bin/` but deliberately kept out of the `bin` map — they would shadow coreutils `head` and GNU `patch` — so `httpc link head patch` symlinks them on demand. **They must stay in the tsup `entry[]` even though they are not in `bin`.** `scripts/postbuild.mjs` runs from tsup's `onSuccess` and is a gate, not a convenience: it hard-fails if a bin lost its `#!/usr/bin/env node` and sets mode 0755, which neither tsc nor esbuild does. It is invoked with `execFileSync`, not `exec` — a gate whose exit code nothing waits for is not a gate.

**`restclients`** — a library with nine subpath entries and no root import (`exports` maps `"."` to `null` on purpose). Two settings in its `tsup.config.ts` are load-bearing:

- **`splitting: true`.** Every subpath barrel re-exports `HttpError` from `core` so consumers can `instanceof`-check without a second import. Without splitting, each of the nine bundles gets a private copy of the class and that check silently returns `false` across subpaths. The shared `dist/chunk-*.js` is what keeps class identity intact; `ci.yml`'s `consumer` job asserts it.
- **`platform: "neutral"`, not `"node"`.** The library must run in the browser — its tsconfig sets `types: []` and pulls in `lib.DOM` for `fetch` deliberately.

Its emitted `.d.ts` keep `.ts` specifiers (a TypeScript 7 quirk). Do not "fix" that. `oxlint` (`.oxlintrc.json`) is the only linter in the repo and the only `lint` script.

**`funtest`** — not a library. The published artifact is compiled test files; `bin/run.sh` prefers `dist/*.test.js` and falls back to `src/*.test.ts`, resolving `$0` through symlinks and passing explicit paths because Node's test runner skips `node_modules` during discovery. It declares **no `test` script** — its whole suite is live — which is what keeps root `pnpm run test` hermetic.

## Conventions and constraints

- **Two source-resolution styles coexist, and mixing them breaks things.** `run` and `naser` use tsconfig path aliases and extensionless relative imports, resolved by tsup at build time and `test/register.ts` under `node --test`. `http`, `restclients` and `funtest` instead import with explicit `.ts` specifiers and rely on `allowImportingTsExtensions` + `rewriteRelativeImportExtensions`; rewriting one of those specifiers to `.js` breaks running the sources directly.
- **The PTY is prebuilt, never compiled.** `@lydell/node-pty` ships per-platform N-API binaries as optional dependencies and declares no install scripts, so there is no node-gyp and no gcc/python requirement. Do not switch back to upstream `node-pty`: its NAN binary is tied to a `NODE_MODULE_VERSION` and breaks on every Node major upgrade.
- **`removeNodeProtocol: false` in the Node-targeting `tsup.config.ts` files is load-bearing.** tsup strips the `node:` prefix by default, which rewrites `node:sqlite` to `sqlite` — a package that does not exist — and the built CLI dies at startup with `ERR_MODULE_NOT_FOUND`. Always smoke-test a built bin (`node dist/cli/run.js --version`) after touching the build config.
- **Path aliases** (tsconfig `paths`, resolved by tsup at bundle time and by `test/register.ts` under `node --test`): `@/*` → `src/*`, `$/*` → package root. The `$/package.json` JSON import is how `run --version` gets its number.
- **Bin shebangs** are `#!/bin/env -S node --no-warnings` — the flag suppresses the `node:sqlite` experimental warning; keep it on new bins.
- **`engines.node` varies per package and CI runs the highest floor.** `run`/`naser` say `>=22.5` (`node:sqlite`), `restclients` `>=20`, `funtest` `>=22.18`, `http` `>=26`. CI is pinned to **26** because that is the only version that satisfies all of them. Linux is the tested platform.
- **TypeScript and `@types/node` versions differ per package** — `^5.7.3`/`^22.x` in `run`/`naser`, `^7.x`/`^26.x` in the three newer ones. pnpm's isolated layout gives each its own copy; do not try to unify them.
- **Never use `workspace:*`.** `release.ts` refuses it outright; internal ranges must be plain semver so `bump.ts` can keep them in step.
- ESM throughout (`"type": "module"`), strict TypeScript, 4-space indent, Prettier configured to defer to `.editorconfig`.
