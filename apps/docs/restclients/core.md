# `@aibulat/restclients/core`

The shared base every client is built on. Import it if you want to write a
client of your own in the same shape; you do not need it to use the others.

```js
import {BaseApi, cleanQuery, encodeSegment, mergeHeaders, HttpError} from '@aibulat/restclients/core';
```

---

## `BaseApi`

One `fetch` call, built from the client's own defaults with the caller's
options layered on top.

```ts
class BaseApi {
    readonly baseUrl: string;
    constructor(defaults: ClientDefaults, options?: ClientOptions);

    protected httpGet<T>(path: string, params?: Query, options?: RequestOptions): Promise<TypedResponse<T>>;
    protected httpSend<T>(method: string, path: string, body?: unknown, options?: RequestOptions): Promise<TypedResponse<T>>;
}

interface ClientDefaults {
    baseUrl: string,
    headers?: Record<string, string>
}
```

The two helpers are named `httpGet`/`httpSend` rather than `get`/`send`
because httpbin exposes its own public `get`, `post`, `put`, `patch` and
`delete` — the echo verbs are the whole point of that API — and a subclass
cannot redeclare a base member with a different signature.

Caller headers are merged **after** the client's own, so an explicit header
always wins — that is what lets `new ReqresApi({headers: {'x-api-key': 'mine'}})`
override the default key. `defaultHeaders` is a `protected Headers`, mutable so
a client can set credentials that only exist after a call has returned; that is
what dummyjson's `setToken()` does.

```ts
import {BaseApi} from '@aibulat/restclients/core';
import type {ClientOptions, RequestOptions} from '@aibulat/restclients/core';

class MyApi extends BaseApi
{
    constructor(options: ClientOptions = {})
    {
        super({baseUrl: 'https://api.example.com'}, options);
    }

    async getThings(limit?: number, config?: RequestOptions)
    {
        return this.httpGet<Array<Thing>>('/things', {limit}, config);
    }
}
```

---

## `ClientOptions` and `RequestOptions`

`ClientOptions` is a `RequestInit` — minus `method`, `body` and `signal`, which
belong to a single call — plus:

| Option | Meaning |
| --- | --- |
| `baseUrl` | Point the client somewhere else: a mock server, a self-hosted instance |
| `headers` | Sent on every request, overridable per call |
| `params` | Query params sent on every request. worldbank's `format=json` is one |
| `timeout` | Milliseconds. Aborts with a `TimeoutError` `DOMException` |
| `validateStatus` | Which statuses resolve. Defaults to `res.ok`; everything else throws |
| `fetch` | The injection point — a wrapper, a stub, a different implementation |

`RequestOptions` is the per-call form: a `RequestInit` minus `method` and
`body` — both belong to the method, not to its config — plus `timeout`,
`params` and `validateStatus`. Per-call values win over the client-wide ones.

`signal` is kept, because a per-call abort is exactly what it is for. Passing
`method` or `body` is a compile error as of 5.0.0: `method` was always
overwritten and silently ignored, and a `body` reached `fetch` untouched,
which on a GET is a `TypeError` thrown by `fetch` itself.

A `timeout` and a caller `signal` are composed into one signal, so whichever
fires first aborts the request. An already-aborted signal rejects before
`fetch` is called at all.

Both cover the request up to the response, not the reading of the body — the
timer is cleared once the response arrives. For these APIs that is a JSON
payload which has already landed; bounding a stalled `res.json()` is the
caller's to do.

---

## `TypedResponse<T>`

```ts
interface TypedResponse<T> extends Response {
    json(): Promise<T>
}
```

The native `Response`, with `json()` narrowed to what the endpoint returns.
There is no wrapper object at runtime — this is the same `Response` `fetch`
handed back, so `res.ok`, `res.status`, `res.headers` and `res.text()` are all
the standard ones.

---

## `cleanQuery(params)`

Flattens optional query params into a record ready for a `URLSearchParams`.

```ts
function cleanQuery(
    params: Record<string, string | number | boolean | Array<string | number> | undefined>
): Record<string, string>
```

Two rules, each of which existed as duplicated logic in the clients before:

- **`undefined` is dropped.** An argument nobody passed produces no param at
  all, never `?limit=undefined`.
- **Arrays are comma-joined.** `{hourly: ['a', 'b']}` becomes `?hourly=a,b`,
  which is the only form Open-Meteo and dummyjson's `select` accept.

Note that *only* `undefined` is dropped. `0`, `false` and `''` are all sent,
because they are things a caller can mean — latitude 0 is the Gulf of Guinea,
not a missing coordinate.

Three layers contribute params, merged in this order: the client's own
defaults, then the ones the method built, then the caller's. The caller always
wins, because anyone passing `{params: {...}}` explicitly is overriding on
purpose.

---

## `encodeSegment(value)`

```ts
function encodeSegment(value: string): string
```

One path segment, safe to interpolate. `new URL()` already percent-encodes
spaces and non-ASCII, so those were never the problem — `#`, `?` and `/` are.
Each is structural, so a segment holding one silently reshapes the request
rather than failing: `getUser('a/b')` used to ask for `/users/a/b`.

Every client puts its string path segments through this as of 5.0.0. Numeric
segments are left alone, since a number cannot contain any of those.

---

## `mergeHeaders(...sources)`

```ts
function mergeHeaders(...sources: Array<HeadersInit | undefined>): Headers
```

Later sources win, names compared case-insensitively, `undefined` skipped.

Worth having as a function because `{...defaults, ...callerHeaders}` looks
like it does this and does not: `HeadersInit` is a `Headers`, an array of
pairs *or* a record, and only the record form has spreadable own keys. The
other two spread to nothing, and the caller's headers vanish without a word.

---

## `HttpError`

```ts
class HttpError extends Error {
    readonly response: Response;
    readonly status: number;
    readonly statusText: string;
    readonly url: string;
}
```

Thrown when `validateStatus` rejects the status — by default, anything that is
not `res.ok`. `fetch` on its own resolves a 404; this is what turns it back
into a rejection.

The body is not consumed on the way out, so `await err.response.json()` is how
you reach the error payload.

`url` prefers `response.url`, which is the redirect-resolved address. That is
empty on a `Response` built by its constructor rather than fetched — every
mock, and some non-native `fetch` implementations — so the url the request was
sent to is the fallback, and `url` is never blank in practice.

Nothing else is wrapped: a transport failure stays the `TypeError` `fetch`
threw, and an abort or elapsed timeout stays a `DOMException`. Every client
re-exports `HttpError`, so you never have to import from `/core` to narrow one.
