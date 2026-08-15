# `@aibulat/restclients/dummyjson`

[dummyjson.com](https://dummyjson.com) — the closest thing to a modern
jsonplaceholder: same "nothing is persisted" contract, but with richer
entities, real list and search params, and a working JWT flow. No key needed.

```js
import {DummyJsonApi} from '@aibulat/restclients/dummyjson';

const api = new DummyJsonApi();
const res = await api.getProducts({limit: 10, select: ['title', 'price']});

const page = await res.json();
console.log(page.products, page.total);
```

---

## The list envelope

Every collection response names its array after the resource:

```json
{"products": [...], "total": 194, "skip": 0, "limit": 10}
```

which is what `DummyPage<K, T>` encodes — `getProducts()` resolves to
something with a `products` key, `getUsers()` to one with `users`. A products
envelope will not typecheck as a users one.

```ts
type DummyPage<K extends string, T> =
    {total: number, skip: number, limit: number} & {[P in K]: Array<T>};
```

All eight collections take the same options:

```ts
interface DummyListOptions {
    limit?: number,
    skip?: number,
    select?: string | Array<string>,   // arrays are comma-joined
    sortBy?: string,
    order?: 'asc' | 'desc'
}
```

---

## Methods

### Products

```ts
getProducts(options?, config?)
getProduct(id, config?)
searchProducts(q, options?, config?)
getProductCategories(config?)      // full objects
getProductCategoryList(config?)    // bare slugs
getProductsByCategory(slug, options?, config?)

addProduct(item, config?)          // POST /products/add
updateProduct(id, item, config?)   // PUT
patchProduct(id, item, config?)    // PATCH
deleteProduct(id, config?)
```

Writes are simulated: the response echoes what you sent with an id attached,
and `deleteProduct` returns the product plus `{isDeleted, deletedOn}`.

### Users, posts, comments

```ts
getUsers(options?, config?)      getUser(id, config?)      searchUsers(q, options?, config?)
getUserCarts(userId, config?)    getUserPosts(userId, options?, config?)    getUserTodos(userId, options?, config?)

getPosts(options?, config?)      getPost(id, config?)      searchPosts(q, options?, config?)
getPostsByTag(tag, options?, config?)                      getPostComments(postId, options?, config?)

getComments(options?, config?)   getComment(id, config?)
```

### Todos, carts, quotes, recipes

```ts
getTodos(options?, config?)      getTodo(id, config?)      getRandomTodo(config?)
getCarts(options?, config?)      getCart(id, config?)
getQuotes(options?, config?)     getQuote(id, config?)     getRandomQuote(config?)
getRecipes(options?, config?)    getRecipe(id, config?)    searchRecipes(q, options?, config?)
getRecipesByTag(tag, options?, config?)                    getRecipesByMealType(type, options?, config?)
```

---

## Auth

`login` mints a short-lived access token; `me()` is the only call that
requires one. Credentials are any user's `username` and `password` from
`/users` — the documented demo pair is `emilys` / `emilyspass`.

```js
const api = new DummyJsonApi();

const login = await api.login({username: 'emilys', password: 'emilyspass'});
api.setToken((await login.json()).accessToken);

const me = await api.me();
```

`setToken()` exists because the token does not exist until login has already
returned, so it cannot be a constructor-only option. Calling it with no
argument clears the header again. If you already have a token, pass it
straight in:

```js
new DummyJsonApi({token: 'access-token'});
```

```ts
login(credentials, config?)              // -> AuthUser (the user plus both tokens)
me(config?)                              // -> DummyUser; needs a bearer token
refresh(refreshToken, expiresInMins?, config?)   // -> AuthTokens
setToken(token?)                         // sync, not a request
```

`expiresInMins` (default 60) is accepted by both login and refresh.

---

## Types

`Product`, `DummyUser`, `DummyPost`, `DummyComment`, `DummyTodo`, `Cart`,
`Quote`, `Recipe`, `Category`, plus the nested `Dimensions`, `Review`,
`ProductMeta`, `DummyAddress`, `DummyCompany`, `Reactions`, `CartProduct`.

Auth: `LoginRequest`, `AuthTokens`, `AuthUser`. Writes: `NewProduct` (a
partial product that must have a `title`), `ProductUpdate`, `Deleted`. Errors:
`DummyError`, which is `{message: string}`.

Only documented fields are typed. Several endpoints return extra keys that
upstream adds and removes without notice, so the entities describe what you
can rely on rather than a full snapshot.
