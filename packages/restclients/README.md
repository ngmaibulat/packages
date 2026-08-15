Full documentation: https://ngmaibulat.github.io/packages/restclients/

## A set of REST API clients using Typescript and fetch

Thin, typed wrappers around publicly available APIs. Each one is a small class
over `fetch`: no client-side caching, no retry policy, no opinions — you get
the native `Response` and the types that describe what is in it.

---

### Install

```sh
npm install @aibulat/restclients
```

**Zero dependencies** as of 4.0.0, which dropped axios for the platform's own
`fetch`. Nothing to install alongside it, and nothing to keep in sync.

Requires Node 20+, or any bundler that understands ESM.

---

### The clients

| Import | API | Needs a key? |
| --- | --- | --- |
| [`/jsonplaceholder`](https://github.com/ngmaibulat/restclients/blob/main/docs/jsonplaceholder.md) | [jsonplaceholder.typicode.com](https://jsonplaceholder.typicode.com) — fake blog data, full CRUD | no |
| [`/dummyjson`](https://github.com/ngmaibulat/restclients/blob/main/docs/dummyjson.md) | [dummyjson.com](https://dummyjson.com) — products, users, carts, recipes, JWT auth | no |
| [`/reqres`](https://github.com/ngmaibulat/restclients/blob/main/docs/reqres.md) | [reqres.in](https://reqres.in) — paginated users, register/login | yes |
| [`/github`](https://github.com/ngmaibulat/restclients/blob/main/docs/github.md) | [api.github.com](https://docs.github.com/rest) — users, repos, issues, search | optional |
| [`/httpbin`](https://github.com/ngmaibulat/restclients/blob/main/docs/httpbin.md) | [httpbin.org](https://httpbin.org) — status codes, delays, redirects | no |
| [`/worldbank`](https://github.com/ngmaibulat/restclients/blob/main/docs/worldbank.md) | [api.worldbank.org](https://datahelpdesk.worldbank.org/knowledgebase/topics/125589) — countries and indicators | no |
| [`/openmeteo`](https://github.com/ngmaibulat/restclients/blob/main/docs/openmeteo.md) | [open-meteo.com](https://open-meteo.com) — weather forecasts and geocoding | no |
| [`/ipinfo`](https://github.com/ngmaibulat/restclients/blob/main/docs/ipinfo.md) | [ipinfo.io](https://ipinfo.io) — IP geolocation | optional |
| [`/core`](https://github.com/ngmaibulat/restclients/blob/main/docs/core.md) | the shared base class, for writing your own | — |

---

### Usage

**ESM only**, and there is no root export — import from a subpath:

```js
import {JsonPlaceHolderApi} from '@aibulat/restclients/jsonplaceholder';

const api = new JsonPlaceHolderApi();
const res = await api.getPosts({limit: 5});

console.log(await res.json());
```

Every method resolves to the native `Response`, so `res.ok`, `res.status`,
`res.headers` and `res.text()` are all the standard ones. `res.json()` is the
part this package types: it resolves to `Post[]` above, not to `any`.

Returning the whole response matters more than it sounds — GitHub puts
pagination and your rate-limit budget in headers, and nothing else would
reach them.

`require()` does not work — 2.0.0 dropped the CommonJS build, so 1.x was the
last version with one. If you need CJS, bundle the ESM output with esbuild,
Vite, Rollup or webpack.

Full TypeScript declarations ship with the package, and source maps point at
the bundled `src/`, so go-to-definition lands on real code.

---

### Configuration

The constructor takes a `RequestInit` plus a few additions of this package's
own — `baseUrl`, `timeout`, `params`, `validateStatus` and `fetch`:

```ts
const api = new JsonPlaceHolderApi({
    timeout: 5000,
    headers: {'X-Custom-Header': 'foobar'}
});

// A local json-server instead of the public API
const local = new JsonPlaceHolderApi({baseUrl: 'http://localhost:3000'});
```

There is no interceptor mechanism, because `fetch` is one already. Wrap it and
pass the wrapper — that is also the seam the offline test suite uses:

```ts
const traced = new JsonPlaceHolderApi({
    fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        headers.set('X-Trace', crypto.randomUUID());
        return fetch(input, {...init, headers});
    }
});
```

Clients that need credentials take them as a named option alongside the rest —
`apiKey` for reqres, `token` for github, dummyjson and ipinfo.

#### Per-request config

Every method takes an optional trailing options object — a `RequestInit` minus
`method` and `body`, which belong to the method, plus `timeout`, `params` and
`validateStatus` — so a single call can carry an `AbortSignal`, its own
timeout, or a one-off header without touching the client-wide defaults:

```ts
const controller = new AbortController();

const res = await api.getPosts({limit: 5}, {
    signal: controller.signal,
    timeout: 2000
});
```

Where a method also takes options, the config is always last:
`getPost(id, options?, config?)`.

---

### Error handling

`fetch` resolves a 404 — it only rejects when the request never got an answer.
These clients throw instead, so a failed call is a rejected promise. `HttpError`
is re-exported from every client for the `instanceof` check:

```js
import {JsonPlaceHolderApi, HttpError} from '@aibulat/restclients/jsonplaceholder';

const api = new JsonPlaceHolderApi();

try {
    const res = await api.getPost(1);
    console.log(await res.json());
}
catch (err) {
    if (err instanceof HttpError) {
        console.error('API said', err.status, await err.response.json());
    }
    else if (err instanceof TypeError) {
        console.error('DNS or Internet Connection Error');
    }
    else {
        throw err;
    }
}
```

`err.response` is the untouched `Response`, body included — nothing reads it on
the way out. A transport failure never produced one, so it stays the `TypeError`
fetch itself threw; an abort or an elapsed `timeout` stays a `DOMException`.

Each client's docs name the error body type for that API — `ReqresError`,
`GithubError`, `DummyError`, and so on — so `await err.response.json()` can be
cast to something meaningful.

Pass `validateStatus` if you would rather handle a status yourself:

```ts
const res = await api.getPost(999, undefined, {validateStatus: () => true});
if (!res.ok) { /* ... */ }
```

One exception worth knowing about: the World Bank API reports failure with
**HTTP 200** and an error body, so nothing rejects. See its docs for the
helper that makes that case loud.

---

### Upgrading to 5.0.0

Three changes are visible from the outside. All three fix cases that were
already broken; none of them changes a call that was working.

- **`RequestOptions` no longer accepts `method` or `body`.** Both belong to
  the method rather than to its config. `method` was always overwritten and
  silently ignored, and a `body` reached `fetch` untouched — which on a GET is
  a `TypeError` thrown by `fetch` itself. Passing either is now a compile
  error, and both are dropped at runtime for JavaScript callers.
- **String path segments are percent-encoded.** A `#`, `?` or `/` in a
  username, slug or address used to reshape the request rather than fail.
  Ordinary identifiers are unchanged byte for byte; worldbank's semicolon-
  joined code lists (`'PER;CHL'`) keep their separators.
- **A trailing slash on `baseUrl` is stripped.** `'https://host/'` used to
  produce `https://host//path`, which 404s everywhere.

Also fixed, with no action needed: dummyjson no longer leaks its bearer token
into the `RequestInit` handed to a custom `fetch`; httpbin's `basicAuth` and
`bearer` no longer discard caller headers passed as a `Headers` instance or an
array of pairs; and github's `parseLink` no longer drops a page whose URL
contains a comma.

New: `mergeHeaders` and `encodeSegment` from `/core`, `archiveURL` from
`/openmeteo`, `WorldBankError` from `/worldbank`, and `HttpError.statusText`.

---

### Development

```sh
pnpm run lint        # oxlint over src and tests
pnpm run typecheck   # tsc over src and tests, including the compile-time assertions
pnpm test            # fully offline, no network, ~0.6s
pnpm run build
pnpm run test:live   # opt-in: hits the real APIs
```

The repo is managed with **pnpm** (`pnpm-lock.yaml` is committed); consumers can
install the published package with any package manager.

Developing the package needs Node 22.18+ — the tests run the TypeScript
sources directly via native type stripping. Consumers only need Node 20, since
what ships in `dist` is plain JavaScript.

The offline suite proves each client sends what it means to send. It cannot
notice when an upstream API renames a field, so `pnpm run test:live` exists and
runs nightly in CI, where it is allowed to fail without blocking anything.

---

### Where is the code?

Repository: https://github.com/ngmaibulat/restclients

Bugs and feature requests: https://github.com/ngmaibulat/restclients/issues

MIT licensed.
