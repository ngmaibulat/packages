# create-tsreact

Scaffold a TypeScript/React app — on a single esbuild command, or on Vite, Next,
Rsbuild, Expo or Fastify.

::: tip Unscoped on purpose
This is the one member of the workspace published without the `@aibulat/` scope.
The `create-*` name is what makes `npm create tsreact` work; scoping it would
change the invocation to `npm create @aibulat/tsreact` and orphan every existing
install.
:::

## Use it

No install step — the `create-*` convention runs it straight from the registry:

```bash
npm create tsreact myapp
pnpm create tsreact myapp
```

It tells you which package manager you used and prints the follow-up commands
for that one, rather than assuming npm.

## Templates

```bash
create-tsreact myapp --template vite-spa
create-tsreact --list-templates          # add --json for a machine-readable list
```

| Template | What you get |
| --- | --- |
| `react` | browser app, esbuild dev server with live reload |
| `extension` | Chrome MV3 extension: popup + content script + background |
| `pwa` | installable offline app: manifest + service worker |
| `expo` | React Native app on Expo SDK 57 (metro, not esbuild) |
| `vite-spa` | React SPA on Vite 8, Tailwind 4, oxlint + oxfmt |
| `rsbuild-spa` | React SPA on Rsbuild 2 (Rspack), Tailwind 4 |
| `next-drizzle` | Next.js with Drizzle ORM |
| `fastify-react` | Fastify server plus a React front end |

## Options

| Flag | Effect |
| --- | --- |
| `-t, --template <name>` | pick a template (default `react`) |
| `--tailwind` | add Tailwind CSS v4 |
| `--daisyui` | add DaisyUI components (implies `--tailwind`) |
| `--husky` | add a pre-commit hook that formats staged files and lints |
| `--api <dir>` | generate a typed client from a [Bruno](https://www.usebruno.com/) collection |
| `--api-env <name>` | which `environments/<name>.bru` to resolve variables from |
| `--api-sample <how>` | `safe` (default), `all` or `none` |
| `--refresh` | re-run the requests instead of replaying recorded samples |

## Typed API clients from a Bruno collection

Point `--api` at a Bruno collection and it parses the `.bru` files, samples the
responses, infers TypeScript types from what came back, and emits a typed client
with query and mutation hooks:

```bash
create-tsreact myapp --api ./collection --api-env local
```

`--api-sample safe` — the default — only replays requests that are safe to
issue. Inside an already-generated app, `create-tsreact api` regenerates
`src/api/` from the collection recorded in its `package.json`.

## Notes

Every scaffolded file is produced by a function returning a template string;
there is no template directory on disk, and the PWA icons are generated in
process. That is what keeps the published tarball to a single bundle.
