### Supported stacks

Every template scaffolds a **pnpm workspace**: a private root that holds the
lockfile and the fan-out scripts, and one directory per app under `apps/`. The
app inside it is bundled by one of six different tools depending on the
template. Everything else is shared — TypeScript, React 19, and `oxlint` +
`oxfmt` installed once at the root.

This file is the per-template answer to "what am I actually running". The
`README.md` covers what each template *is*; `CLAUDE.md` covers how the
generators are built.

### Package manager

**pnpm**, for every template. Concretely:

- The generated root is a pnpm workspace — `pnpm-workspace.yaml` listing
  `packages: apps/*`. There is no `packageManager` field and no corepack pin.
- The root scripts spell pnpm out: `pnpm -r --parallel run dev`,
  `pnpm -r run build`, `pnpm -r run typecheck`, and
  `pnpm --filter <scope>/server run dev` for the two-app template.
- The CLI reads `npm_config_user_agent` and prints the install and run commands
  for whichever tool you launched it with, so `npm create tsreact myapp` tells
  you `npm install` and `npm run dev`. That affects **printed text only** —
  including the `dlx` spelling inside the generated `api:gen` script. The
  workspace itself still assumes pnpm's semantics either way, and the default
  when nothing is detected is pnpm.

Three pnpm settings are generated, each for a reason worth knowing:

| Setting | Where | Why |
| --- | --- | --- |
| `allowBuilds: esbuild` | `pnpm-workspace.yaml`, every template | pnpm 10+ will not run a dependency's postinstall unless it is named. esbuild also arrives transitively, through `drizzle-kit` and `tsx`. `@parcel/watcher` is added alongside it under the standalone Tailwind toolchain. |
| `nodeLinker: hoisted` | `pnpm-workspace.yaml`, expo only | Metro resolves by walking `node_modules` upward and cannot follow pnpm's symlinked layout. It must live here — pnpm 11 ignores `node-linker` in `.npmrc` entirely, and the failure is silent. |
| `enable-pre-post-scripts=true` | `.npmrc`, standalone-Tailwind templates only | The Tailwind templates use a `predev` hook to compile the stylesheet once before the dev server starts. pnpm 11 runs `pre<name>` hooks by default; pnpm 10 skips them without this. |

### Bundlers, per template

| Template | Bundler | Dev | Build output |
| --- | --- | --- | --- |
| `react` | esbuild 0.28, `--format=esm --platform=browser` | `esbuild --watch --serve=localhost:3000` | `apps/web/public/` |
| `extension` | esbuild, `--format=iife`, three entry points in one command | `esbuild --watch`, no server — Chrome loads from disk | `apps/extension/public/` |
| `pwa` | esbuild — react's esm run, plus a second `--format=iife` run for `sw.js` | as `react` | `apps/web/public/` |
| `vite-spa` | Vite 8 (rolldown is its own dependency) with `@vitejs/plugin-react` | `vite`, port 3000 | `apps/web/dist/` |
| `rsbuild-spa` | Rspack, via Rsbuild 2 with `@rsbuild/plugin-react` | `rsbuild dev`, port 3000 | `apps/web/dist/` |
| `next-drizzle` | Turbopack — the Next 16 default, so there is no flag to pass | `next dev` | `apps/web/.next/` |
| `fastify-react` | web: Vite 8 · server: rolldown for `build`, `tsx watch` for `dev` | `pnpm -r --parallel run dev` — web on 3000, API on 3001, `/api` proxied | `apps/web/dist/`, `apps/server/dist/` |
| `expo` | Metro, via the Expo CLI | `expo start` | — (Metro serves; EAS builds) |

The `react`, `extension` and `pwa` templates are the **esbuild lane**: the whole
build is one command you can read in a line, with no config file. The rest use
their ecosystem's own bundler.

### Styling

Tailwind 4 arrives four different ways, depending on what compiles it:

| Delivery | Templates | Notes |
| --- | --- | --- |
| `@tailwindcss/cli` as its own watcher | `react`, `pwa`, `extension` (with `--tailwind`) | Compiles `src/styles.css` → `src/app.css`, which the app imports so esbuild picks it up. Adds a `tw` script and a `predev` hook. The compiled file is gitignored — it stops being a source file. |
| `@tailwindcss/vite` | `vite-spa`, `fastify-react` (web) | Plugin runs inside Vite, after `react()`. No separate watcher, no postcss config. |
| `@rsbuild/plugin-tailwindcss` | `rsbuild-spa` | The official Rsbuild plugin. It does *not* route Tailwind through PostCSS, so there is no `postcss.config.*` here — the same trade as the Vite plugin. |
| `@tailwindcss/postcss` | `next-drizzle` | There is no Turbopack equivalent of the Vite plugin; this is the setup Tailwind documents for Next. |

Every template below the first row has Tailwind on by default — it is part of
what the template is, so `--tailwind` is accepted there as a no-op. `expo`
styles with React Native `StyleSheet` objects and rejects `--tailwind` outright
(that would be nativewind, a different project). DaisyUI 5 layers on top of any
of the four deliveries.

### Shared by every template

- **TypeScript 7**, and `tsc` only ever runs `--noEmit` — no template compiles
  with it. `expo` is the deliberate exception at TypeScript 6, matching the
  version its own `tsconfig.base` is built against.
- **React 19** (`react-native` 0.86 on expo).
- **oxlint + oxfmt**, installed once at the workspace root rather than per app —
  one config, one pass. No ESLint and no Prettier anywhere. A freshly scaffolded
  app passes its own `lint` and `format:check` before you touch it.
- **`@tanstack/react-query`** in the primary app, but only under `--api`.
- **Node `^20.19.0 || >=22.12.0`**, declared in the root `engines`.

### Why these choices

Each of these is load-bearing — the failure mode is in the second half of the
sentence.

- **esbuild builds pass full `--minify`.** With `platform=browser`, esbuild
  defines `process.env.NODE_ENV` as `"production"` only when *all* minify
  options are on. Dropping it silently ships React's development build.
- **The extension is `iife`, not `esm`.** MV3 content scripts cannot be ES
  modules at all. Keeping all three entries classic is also what lets one
  command build them.
- **Vite, Rsbuild and Turbopack never type-check.** That is why `vite-spa`'s
  build is `tsc --noEmit && vite build` and `rsbuild-spa`'s is
  `tsc --noEmit && rsbuild build` — without it the only thing between a type
  error and production is your editor. Rsbuild does ship an
  `@rsbuild/plugin-type-check`, but that is a fourth `@rsbuild/*` package to
  hold on the same major for something `tsc` already does.
- **`rsbuild-spa` sets `source.entry` explicitly.** Rsbuild's default entry is
  `./src/index.tsx`; this template names `./src/main.tsx` so its tree matches
  `vite-spa`'s and the two share a generator. Deleting those four lines does not
  fall back to a working default — it builds an empty entry, because the file
  Rsbuild looks for does not exist.
- **`rsbuild-spa` has no `index.html` to edit.** Rsbuild generates the document,
  so the app name gets there through `html.title` and the mount point comes from
  Rsbuild's built-in template. Adding a hand-written `index.html` does nothing
  unless `html.template` is pointed at it.
- **rolldown externalises everything in `dependencies`.** Fastify resolves
  plugin metadata by identity at registration time, so inlining it fails at
  runtime rather than at build. The bundle exists to collapse `src/` into one
  file, not to vendor `node_modules`.
- **Vite 8 depends on rolldown directly.** So the `rolldown-vite` alias (a Vite 7
  recipe) would *downgrade* the bundler, and `@vitejs/plugin-react-oxc` — which
  peers on Vite 6/7 only — is the backport, not the upgrade. oxc is already
  Vite 8's transform.
- **No caret floor is ever the newest published patch.** pnpm 11 defaults
  `minimumReleaseAge` to about a week and refuses anything newer, so
  `"vite": "^8.2.1"` on the day 8.2.1 ships makes `pnpm install` fail outright.
  `"^8.0.0"` still resolves to the newest allowed version and degrades instead.
  Exact versions live in the `gen*PackageJson.ts` generators.

### Adding a template

This file is hand-maintained — nothing checks it against the generators. A new
template needs a row in the bundler matrix, an entry in the styling table if it
compiles CSS at all, and a bullet under "Why these choices" if its toolchain has
a constraint that will bite someone. `CLAUDE.md` carries the rest of the
checklist.
