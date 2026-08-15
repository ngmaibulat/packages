# `@aibulat/restclients/jsonplaceholder`

[jsonplaceholder.typicode.com](https://jsonplaceholder.typicode.com) — fake
blog data with full CRUD. No key, no limits.

```js
import {JsonPlaceHolderApi} from '@aibulat/restclients/jsonplaceholder';

const api = new JsonPlaceHolderApi();
const res = await api.getPosts({limit: 5});
```

jsonplaceholder is a testing service: **nothing is persisted**. Created and
updated items are echoed back with a plausible id, but you cannot read one
back. Point the client at a local `json-server` if you need real writes:

```js
const local = new JsonPlaceHolderApi({baseUrl: 'http://localhost:3000'});
```

---

## Methods

Every method takes an optional trailing `RequestOptions` — a `RequestInit`
plus `timeout`, `params` and `validateStatus`.

### Collections

```ts
getPosts(options?, config?)
getComments(options?, config?)
getAlbums(options?, config?)
getPhotos(options?, config?)
getTodos(options?, config?)
getUsers(options?, config?)
```

`options` is either a bare number (a limit, which is what these took before
3.0.0) or a `ListOptions` object:

```ts
interface ListOptions {
    limit?: number,     // _limit
    start?: number,     // _start
    page?: number,      // _page
    sort?: string,      // _sort
    order?: 'asc' | 'desc',
    embed?: string,     // _embed
    expand?: string     // _expand
}

await api.getPosts(5);
await api.getPosts({limit: 5, sort: 'id', order: 'desc'});
```

### Single items

```ts
getPost(id, options?, config?)
getComment(id, options?, config?)
getAlbum(id, options?, config?)
getPhoto(id, options?, config?)
getTodo(id, options?, config?)
getUser(id, options?, config?)
```

`options` here is `ItemOptions` — just `embed` and `expand`.

### Nested routes

```ts
getPostComments(postId, options?, config?)
getAlbumPhotos(albumId, options?, config?)
getUserPosts(userId, options?, config?)
getUserAlbums(userId, options?, config?)
getUserTodos(userId, options?, config?)

getCommentsByPost(postId, config?)   // the ?postId= form of the same thing
```

### Writes

```ts
createPost(item, config?)      // and createComment, createAlbum, createPhoto, createTodo, createUser
updatePost(id, item, config?)  // PUT, replaces the whole item
patchPost(id, item, config?)   // PATCH, partial
deletePost(id, config?)
```

…and the same five siblings for each verb.

---

## Types

Entities carry the server-assigned `id`: `Post`, `Comment`, `Album`, `Photo`,
`Todo`, `User` (plus `Geo`, `Address`, `Company` nested inside `User`). Full
definitions are in the shipped `.d.ts` — your editor has them.

Create and update take the entity **without** its `id`, because the server
assigns it and on update it travels in the URL:

```ts
import type {NewPost} from '@aibulat/restclients/jsonplaceholder';

const draft: NewPost = {
    userId: 1,
    title: 'Comparing Floating-Point Numbers Is Tricky',
    body: 'https://bitbashing.io/comparing-floats.html'
};

const res = await api.createPost(draft);
console.log((await res.json()).id);   // assigned by the server
```

`NewComment`, `NewAlbum`, `NewPhoto`, `NewTodo` and `NewUser` follow the same
`Omit<T, 'id'>` pattern. Patch methods take a `Partial` of these.

---

## Notes

- **`_embed` and `_expand` are single strings.** json-server reads a repeated
  `?_embed=a&_embed=b`, and the shared params helper comma-joins arrays
  instead. Pass a per-request config if you need more than one.
- **Embedded fields are not typed.** `getPost(1, {embed: 'comments'})` still
  resolves to `Post`; the extra `comments` array is there at runtime but the
  type does not know about it.
- **Changed in 3.0.0:** `getPosts(0)` now sends `_limit=0` rather than
  dropping the param. Only `undefined` means "absent" now — see
  [core](./core.md).
