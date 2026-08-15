# `@aibulat/restclients/reqres`

[reqres.in](https://reqres.in) — paginated users, a `/unknown` resource
collection, and register/login endpoints.

```js
import {ReqresApi} from '@aibulat/restclients/reqres';

const api = new ReqresApi({apiKey: 'your-key'});
const res = await api.getUsers(2);
const page = await res.json();

console.log(page.page, page.data);
```

---

## You will need your own API key

reqres requires an `x-api-key` header. This client defaults to reqres's
published demo key (`reqres-free-v1`), but **treat that default as
best-effort**: reqres rotates and throttles it, and it has been observed
returning `401 missing_api_key` for the very URLs it served minutes earlier.

Get a key at https://app.reqres.in/api-keys and pass it as `apiKey`. A missing
or rejected key surfaces as an `HttpError` with `status === 401` and a
`ReqresError` body.

An explicit header always beats the option, if you would rather set it that way:

```js
new ReqresApi({headers: {'x-api-key': 'your-key'}});
```

---

## Methods

```ts
getUsers(page?, delay?, config?)
getUser(id, config?)
createUser(item, config?)
updateUser(id, item, config?)      // PUT
patchUser(id, item, config?)       // PATCH
deleteUser(id, config?)

getResources(page?, delay?, config?)   // reqres calls this collection "unknown"
getResource(id, config?)

register(credentials, config?)
login(credentials, config?)
```

`delay` is a reqres feature that holds the response for N seconds — handy for
exercising timeout handling:

```js
const slow = new ReqresApi({timeout: 1000});
await slow.getUsers(1, 5);   // rejects with ECONNABORTED
```

---

## Types

reqres wraps every payload in an envelope:

```ts
interface Single<T> {
    data: T,
    support?: Support,
    _meta?: Record<string, unknown>
}

interface Paginated<T> {
    page: number,
    per_page: number,
    total: number,
    total_pages: number,
    data: Array<T>,
    support?: Support,
    _meta?: Record<string, unknown>
}
```

So `getUsers()` resolves to `Paginated<ReqresUser>` and `getUser(2)` to
`Single<ReqresUser>` — note the `data` key inside the envelope for the single
form, so it reads `(await res.json()).data`.

Entities are `ReqresUser` and `ReqresResource`, both keeping upstream's
`snake_case` field names. Write and auth payloads are `NewReqresUser`,
`CreatedReqresUser`, `UpdatedReqresUser`, `Credentials`, `RegisterResponse`,
`LoginResponse` and `ReqresError`.

---

## Notes

- **Nothing is persisted.** Like jsonplaceholder, write responses are
  synthesised per request.
- **The write and auth response shapes come from reqres's documentation
  rather than from observation**, because the demo key is too unreliable to
  verify them against. If you have a real key and something does not match,
  that is a bug worth reporting.
- reqres is the one client with **no live smoke test**, for the same reason: a
  live 401 there would say nothing about this code.
