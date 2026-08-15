Full documentation: https://ngmaibulat.github.io/packages/funtest/

### Zero-dependency smoke tests for some publicly available REST APIs

### Notes

-   This package is not intended to be used as a library.
-   Rather published reference code, which can be easily run.
-   No runtime dependencies: it uses Node's built-in test runner and `fetch`.

### Why

-   Test that reference public APIs are actually usable from your location
-   Can be used as sample code on how to write basic tests for a REST API
-   You can use it as a sort of traffic generator ))

### Stack

-   TypeScript, run directly by Node via type stripping — no build step while developing
-   `node:test` and `node:assert` for the runner and assertions
-   `fetch` for the requests
-   ESM modules

Requires Node 22.18 or newer, which is where running `.ts` files directly became
available by default. The published package ships compiled JS, because Node does
not strip types for files under `node_modules`.

### Use

```sh
npx @aibulat/funtest@latest
```

### Develop

```sh
pnpm install          # dev only: TypeScript and its type definitions
pnpm test             # run every suite
pnpm test src/github.test.ts   # run one file
pnpm run typecheck    # tsc; emits nothing
pnpm run build        # publish-only; prepack runs it for you
```

### APIs covered

`api.github.com`, `hacker-news.firebaseio.com`, `httpbingo.org`, `ipinfo.io`,
`jsonplaceholder.typicode.com`, `randomuser.me`.

Because these are live third-party services, a failure here often means the API
changed rather than the test broke. Two examples already found their way into the
code: `ipinfo.io` serves HTML unless you ask for JSON by name, and `httpbin.org`
went permanently 503, so the tests now point at `httpbingo.org` instead.
