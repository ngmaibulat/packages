# @aibulat/restclients

Thin, typed wrappers around publicly available REST APIs. Each one is a small class over
`fetch`: no client-side caching, no retry policy, no opinions — you get the native
`Response` and the types that describe what is in it. Zero runtime dependencies.

## Install

```bash
npm install @aibulat/restclients
```

ESM only. Runs on **Node ≥ 20** and in the browser — nothing in `src` assumes a Node
global.

## Subpath imports only

There is no root import. `exports` maps `"."` to `null` on purpose, so you take exactly
the client you need and nothing else:

```ts
import { JsonPlaceHolderApi } from '@aibulat/restclients/jsonplaceholder';
import { HttpError } from '@aibulat/restclients/core';

const api = new JsonPlaceHolderApi();

try {
    const users = await api.users();
} catch (err) {
    if (err instanceof HttpError) console.error(err.status);
}
```

Every client barrel re-exports `HttpError` and the core option types, so that
`instanceof` check works whether you imported it from `/core` or from the client's own
subpath.

## The clients

| Subpath | API |
| --- | --- |
| [`/core`](./core) | the shared `BaseApi`, `HttpError`, query and header helpers |
| [`/jsonplaceholder`](./jsonplaceholder) | jsonplaceholder.typicode.com |
| [`/reqres`](./reqres) | reqres.in |
| [`/dummyjson`](./dummyjson) | dummyjson.com |
| [`/httpbin`](./httpbin) | httpbingo.org |
| [`/github`](./github) | api.github.com, with link-header pagination |
| [`/ipinfo`](./ipinfo) | ipinfo.io |
| [`/openmeteo`](./openmeteo) | open-meteo.com, incl. geocoding and archive |
| [`/worldbank`](./worldbank) | api.worldbank.org |

Start with [core](./core) if you want to write a client of your own — everything else on
this list is a few dozen lines on top of it.
