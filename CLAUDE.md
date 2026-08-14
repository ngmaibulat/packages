# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repo layout

A **pnpm workspace** (`pnpm-workspace.yaml`: `apps/*`, `packages/*`, `examples/*`) with a single root `pnpm-lock.yaml`. Each package under `packages/` is still independently versioned and published, and keeps its own `tsconfig.json` and `tsup.config.ts`. Releases are driven from the root by `scripts/bump.ts` and `scripts/release.ts` — see **Releasing** below.

- `packages/run` → `@aibulat/run`, the substantial package (4 bins: `run`, `logview`, `output`, `shell`).
- `packages/naser` → `@aibulat/naser`, an ANSI→HTML CLI built on `anser`.
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
pnpm run test        # pnpm -r run test
pnpm run typecheck   # pnpm -r run typecheck
```

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

Publishing happens in CI, not on a laptop. `.github/workflows/publish.yml` fires on a push to `main` touching `packages/*/package.json` and authenticates with **npm trusted publishing** — OIDC, no token, no GitHub Environment. Two things there are load-bearing: the **filename** `publish.yml`, which npm binds each package's trusted publisher to, and the absence of `registry-url:` on `setup-node`, which would otherwise write an `.npmrc` whose empty `NODE_AUTH_TOKEN` shadows the OIDC exchange. `workflow_dispatch` with `dry_run` is the manual path.

Both packages declare `"prepack": "pnpm run build"`. That is what puts `dist/` in the tarball — it is gitignored, and nothing else in CI builds it.

## Tests

Native `node:test`, no framework. Tests live in `<package>/test/*.test.ts` and import the real `src/*.ts` — nothing is built first.

```bash
pnpm --filter @aibulat/run run test
cd packages/run && node --import ./test/register.ts --test test/vt.test.ts   # one file
cd packages/run && node --import ./test/register.ts --test --test-name-pattern="Device Status" test/vt.test.ts
```

Node strips the TypeScript types itself; the only missing piece is resolution, which `test/register.ts` supplies via `module.registerHooks`. It teaches Node the two things the sources rely on the bundler for: the `@/*` and `$/*` path aliases, and extensionless relative imports (`from "./librun"`). Every package's `test` script loads it with `--import`. Adding a package means copying that file.

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

## Conventions and constraints

- **The PTY is prebuilt, never compiled.** `@lydell/node-pty` ships per-platform N-API binaries as optional dependencies and declares no install scripts, so there is no node-gyp and no gcc/python requirement. Do not switch back to upstream `node-pty`: its NAN binary is tied to a `NODE_MODULE_VERSION` and breaks on every Node major upgrade.
- **`removeNodeProtocol: false` in both `tsup.config.ts` files is load-bearing.** tsup strips the `node:` prefix by default, which rewrites `node:sqlite` to `sqlite` — a package that does not exist — and the built CLI dies at startup with `ERR_MODULE_NOT_FOUND`. Always smoke-test a built bin (`node dist/cli/run.js --version`) after touching the build config.
- **Path aliases** (tsconfig `paths`, resolved by tsup at bundle time and by `test/register.ts` under `node --test`): `@/*` → `src/*`, `$/*` → package root. The `$/package.json` JSON import is how `run --version` gets its number.
- **Bin shebangs** are `#!/bin/env -S node --no-warnings` — the flag suppresses the `node:sqlite` experimental warning; keep it on new bins.
- **Node ≥ 22.5** (`node:sqlite`), declared in `engines`. Linux is the tested platform.
- ESM throughout (`"type": "module"`), strict TypeScript, 4-space indent, Prettier configured to defer to `.editorconfig`.
