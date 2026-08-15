/*
Compile-time assertions. Never executed -- `npm run typecheck` is the test.

A wrong generic (`get<Post>` on getUser, say) is invisible to any runtime
assertion: it changes nothing about the bytes on the wire, only what
consumers are told they received. These files are the only thing that catches it.

Every `@ts-expect-error` below is itself an assertion: if the code stops
being an error, the build fails.
*/

import type {TypedResponse} from '../../src/core/index.ts';

import {JsonPlaceHolderApi} from '../../src/jsonplaceholder/index.ts';
import type {Post, Comment, Album, Photo, Todo, User, NewPost} from '../../src/jsonplaceholder/index.ts';

const jp = new JsonPlaceHolderApi();


//Lists resolve to arrays of the matching entity

const _posts: Promise<TypedResponse<Array<Post>>> = jp.getPosts();
const _comments: Promise<TypedResponse<Array<Comment>>> = jp.getComments(5);
const _albums: Promise<TypedResponse<Array<Album>>> = jp.getAlbums();
const _photos: Promise<TypedResponse<Array<Photo>>> = jp.getPhotos();
const _todos: Promise<TypedResponse<Array<Todo>>> = jp.getTodos();
const _users: Promise<TypedResponse<Array<User>>> = jp.getUsers();


//Get-one resolves to the entity -- getUser must be a User, not a Post

const _post: Promise<TypedResponse<Post>> = jp.getPost(1);
const _user: Promise<TypedResponse<User>> = jp.getUser(1);
const _todo: Promise<TypedResponse<Todo>> = jp.getTodo(1);
const _byPost: Promise<TypedResponse<Array<Comment>>> = jp.getCommentsByPost(1);

// @ts-expect-error -- getUser is a User; assigning it to a Post must not compile
const _notAPost: Promise<TypedResponse<Post>> = jp.getUser(1);


//List options: a bare number and an options object are both accepted

const _byNumber: Promise<TypedResponse<Array<Post>>> = jp.getPosts(5);
const _byOptions: Promise<TypedResponse<Array<Post>>> = jp.getPosts({limit: 5, sort: 'id', order: 'desc'});

// @ts-expect-error -- order is a two-value union, not any string
jp.getPosts({order: 'sideways'});

// @ts-expect-error -- a typo'd option is not silently ignored
jp.getPosts({limt: 5});

// @ts-expect-error -- list options are not accepted by a get-one call
jp.getPost(1, {limit: 5});


//Nested routes resolve to the child entity, not the parent

const _postComments: Promise<TypedResponse<Array<Comment>>> = jp.getPostComments(1);
const _albumPhotos: Promise<TypedResponse<Array<Photo>>> = jp.getAlbumPhotos(1);
const _userPosts: Promise<TypedResponse<Array<Post>>> = jp.getUserPosts(1);
const _userAlbums: Promise<TypedResponse<Array<Album>>> = jp.getUserAlbums(1);
const _userTodos: Promise<TypedResponse<Array<Todo>>> = jp.getUserTodos(1);

// @ts-expect-error -- a user's todos are Todos, not Posts
const _wrongNesting: Promise<TypedResponse<Array<Post>>> = jp.getUserTodos(1);


//Create takes the entity minus its server-assigned id, and returns the entity

const draft: NewPost = {userId: 1, title: 't', body: 'b'};
const _created: Promise<TypedResponse<Post>> = jp.createPost(draft);
const _updated: Promise<TypedResponse<Post>> = jp.updatePost(1, draft);

// @ts-expect-error -- callers must not have to invent an id
jp.createPost({userId: 1, id: 101, title: 't', body: 'b'});

// @ts-expect-error -- required fields are still required
jp.createPost({userId: 1});


//Patch takes a partial, put does not

const _patched: Promise<TypedResponse<Post>> = jp.patchPost(1, {title: 't'});

// @ts-expect-error -- put replaces the whole item, so every field is required
jp.updatePost(1, {title: 't'});


//Deletes resolve to the entity type as well

const _deleted: Promise<TypedResponse<Post>> = jp.deletePost(1);


//The base url is readable but not reassignable

const _baseUrl: string = jp.baseUrl;

// @ts-expect-error -- `baseUrl` is readonly
jp.baseUrl = 'http://localhost:3000';

// @ts-expect-error -- the transport is not part of the public surface
jp.httpGet('/posts');


//Constructor options are RequestInit plus this package's own additions

const _configured = new JsonPlaceHolderApi({timeout: 1000, baseUrl: 'http://localhost:3000'});
const _wrapped = new JsonPlaceHolderApi({fetch: (input, init) => fetch(input, init)});

// @ts-expect-error -- a typo'd option is rejected
new JsonPlaceHolderApi({timoeut: 1000});


//Per-call config is a RequestInit minus the two keys the method owns

// @ts-expect-error -- a body belongs to the method, not to its config
jp.getPost(1, undefined, {body: '{"a":1}'});

// @ts-expect-error -- the method is the client's to choose
jp.getPost(1, undefined, {method: 'POST'});

/*
`signal` is deliberately not excluded: a per-call abort is the whole point of
it, and it is composed with `timeout` rather than replaced by it.
*/
declare const controller: AbortController;

const _aborting = jp.getPost(1, undefined, {signal: controller.signal, timeout: 500});

/* The rest of RequestInit still passes through untouched. */
const _forwarded = jp.getPost(1, undefined, {credentials: 'omit', redirect: 'manual'});


export type {};
