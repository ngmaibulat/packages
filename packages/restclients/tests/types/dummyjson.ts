/*
Compile-time assertions for the dummyjson client. See ./jsonplaceholder.ts
for why these files exist.
*/

import type {TypedResponse} from '../../src/core/index.ts';

import {DummyJsonApi} from '../../src/dummyjson/index.ts';
import type {DummyPage, Product, DummyUser, DummyPost, DummyTodo} from '../../src/dummyjson/index.ts';
import type {Cart, Quote, Recipe, Category, AuthUser, AuthTokens} from '../../src/dummyjson/index.ts';

const dj = new DummyJsonApi();


/*
The list envelope names its array after the resource. This is the whole point
of DummyPage<K, T> -- a `products` response must not typecheck as a `users` one.
*/

const _products: Promise<TypedResponse<DummyPage<'products', Product>>> = dj.getProducts();
const _users: Promise<TypedResponse<DummyPage<'users', DummyUser>>> = dj.getUsers();
const _posts: Promise<TypedResponse<DummyPage<'posts', DummyPost>>> = dj.getPosts();
const _todos: Promise<TypedResponse<DummyPage<'todos', DummyTodo>>> = dj.getTodos();
const _carts: Promise<TypedResponse<DummyPage<'carts', Cart>>> = dj.getCarts();
const _quotes: Promise<TypedResponse<DummyPage<'quotes', Quote>>> = dj.getQuotes();
const _recipes: Promise<TypedResponse<DummyPage<'recipes', Recipe>>> = dj.getRecipes();

// @ts-expect-error -- the products envelope has no `users` key
const _wrongKey: Promise<TypedResponse<DummyPage<'users', Product>>> = dj.getProducts();

// @ts-expect-error -- a list response is an envelope, not a bare array
const _bare: Promise<TypedResponse<Array<Product>>> = dj.getProducts();


//Get-one resolves to the entity itself, with no envelope

const _product: Promise<TypedResponse<Product>> = dj.getProduct(1);
const _user: Promise<TypedResponse<DummyUser>> = dj.getUser(1);
const _randomTodo: Promise<TypedResponse<DummyTodo>> = dj.getRandomTodo();
const _randomQuote: Promise<TypedResponse<Quote>> = dj.getRandomQuote();

// @ts-expect-error -- a product is not a user
const _crossed: Promise<TypedResponse<DummyUser>> = dj.getProduct(1);


//Categories are the one collection that is a bare array

const _categories: Promise<TypedResponse<Array<Category>>> = dj.getProductCategories();
const _categoryList: Promise<TypedResponse<Array<string>>> = dj.getProductCategoryList();

// @ts-expect-error -- category-list is slugs, not objects
const _slugsAreStrings: Promise<TypedResponse<Array<Category>>> = dj.getProductCategoryList();


//Nested routes resolve to the child resource's envelope

const _userCarts: Promise<TypedResponse<DummyPage<'carts', Cart>>> = dj.getUserCarts(1);
const _userPosts: Promise<TypedResponse<DummyPage<'posts', DummyPost>>> = dj.getUserPosts(1);


//List options

dj.getProducts({limit: 10, skip: 20, select: ['title', 'price'], sortBy: 'title', order: 'asc'});
dj.getProducts({select: 'title'});

// @ts-expect-error -- order is a two-value union
dj.getProducts({order: 'sideways'});

// @ts-expect-error -- a typo'd option is not silently ignored
dj.getProducts({limitt: 10});


//Auth: login returns the user with both tokens; refresh returns only tokens

const _session: Promise<TypedResponse<AuthUser>> = dj.login({username: 'emilys', password: 'emilyspass'});
const _refreshed: Promise<TypedResponse<AuthTokens>> = dj.refresh('refresh-token');
const _me: Promise<TypedResponse<DummyUser>> = dj.me();

// @ts-expect-error -- refresh does not return a user
const _refreshIsNotAUser: Promise<TypedResponse<AuthUser>> = dj.refresh('refresh-token');

// @ts-expect-error -- login needs both fields
dj.login({username: 'emilys'});


//Writes: a title is the only thing addProduct insists on

dj.addProduct({title: 'New product'});
dj.updateProduct(1, {price: 9.99});

// @ts-expect-error -- addProduct still needs a title
dj.addProduct({price: 9.99});

// @ts-expect-error -- the id travels in the path, not the body
dj.updateProduct(1, {id: 2});


//The token is a constructor option alongside the request defaults

const _tokened = new DummyJsonApi({token: 'access-1', timeout: 1000});

// @ts-expect-error -- unknown options are rejected
new DummyJsonApi({tokens: 'access-1'});


export type {};
