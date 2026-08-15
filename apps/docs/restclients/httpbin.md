# `@aibulat/restclients/httpbin`

[httpbin.org](https://httpbin.org) — not a data API but a *behaviour* API.
Status codes, delays, redirects, compression and auth, on demand. It is the
cheapest way to exercise timeout handling, retry logic and whatever you wrapped `fetch` with
against something real.

```js
import {HttpbinApi} from '@aibulat/restclients/httpbin';

const api = new HttpbinApi();
const res = await api.get({a: 1, b: 'two'});

console.log((await res.json()).args);   // {a: '1', b: 'two'}
```

---

## When httpbin.org is down

It happens. Postman Echo answers most of the same routes, and a self-hosted
instance answers all of them — the only thing that changes is the base URL:

```js
new HttpbinApi({baseUrl: 'https://postman-echo.com'});
```

```sh
docker run -p 8080:80 kennethreitz/httpbin
```

```js
new HttpbinApi({baseUrl: 'http://localhost:8080'});
```

The self-hosted option is the reliable one for CI.

This repo's own live smoke tests take the same detour through an environment
variable, and skip themselves when the host they point at is not answering:

```sh
HTTPBIN_BASE_URL=https://postman-echo.com pnpm run test:live
```

---

## Methods

### Echo verbs

Each returns an `HttpbinEcho` describing the request it just received:

```ts
get(params?, config?)
post(body?, config?)
put(body?, config?)
patch(body?, config?)
delete(config?)
```

```ts
interface HttpbinEcho {
    args: Record<string, string>,
    headers: Record<string, string>,
    origin: string,
    url: string,
    data?: string,          // write verbs only
    json?: unknown,
    form?: Record<string, string>,
    files?: Record<string, string>
}
```

### Behaviour

```ts
status(code, config?)                  // answers with exactly that status
delay(seconds, config?)                // holds the response; httpbin caps it at 10
redirect(times, config?)               // fetch follows them for you
redirectTo(target, statusCode?, config?)
cache(seconds?, config?)               // Cache-Control; no argument means 304 on a conditional request
gzip(config?)
bytes(count, config?)                  // N random bytes
```

`status` is the useful one — anything outside 2xx rejects with an
`HttpError`, so error paths become testable in one line:

```js
await api.status(503);   // rejects; err.status === 503
```

And `delay` makes timeout handling testable:

```js
const impatient = new HttpbinApi({timeout: 1000});
await impatient.delay(5);   // rejects with a TimeoutError DOMException
```

### Inspection and payloads

```ts
headers(config?)      // what the server saw -- useful for verifying what your `fetch` wrapper added
ip(config?)
userAgent(config?)
uuid(config?)
json(config?)         // a fixed sample document
basicAuth(user, password, config?)
bearer(token, config?)
```

Both auth methods reject with a 401 when the credentials do not match. Note
that `basicAuth` puts the credentials in the path *and* sends them as real
basic auth — httpbin wants both, so it knows what to accept.

---

## Types

`HttpbinEcho`, `HttpbinHeaders`, `HttpbinOrigin`, `HttpbinUserAgent`,
`HttpbinUuid`, `HttpbinAuth`, `HttpbinSlideshow`.

`status`, `bytes` and `redirectTo` are typed as `unknown` — what comes back
depends entirely on the code or size you asked for.
