import {test, describe} from 'node:test';
import assert from 'node:assert/strict';

import {DummyJsonApi} from '../../src/dummyjson/index.ts';
import {mockFetch} from '../helpers/mock-fetch.ts';

/*
Every collection funnels the same option object through the same query params,
and every list response is `{<resource>: [...], total, skip, limit}` -- the
array key is the resource name, which is what `DummyPage<K, T>` encodes.
*/

const page = (key: string) => ({[key]: [], total: 0, skip: 0, limit: 30});

const collections = [
    {method: 'getProducts', path: '/products', key: 'products'},
    {method: 'getUsers', path: '/users', key: 'users'},
    {method: 'getPosts', path: '/posts', key: 'posts'},
    {method: 'getComments', path: '/comments', key: 'comments'},
    {method: 'getTodos', path: '/todos', key: 'todos'},
    {method: 'getCarts', path: '/carts', key: 'carts'},
    {method: 'getQuotes', path: '/quotes', key: 'quotes'},
    {method: 'getRecipes', path: '/recipes', key: 'recipes'}
] as const;


describe('dummyjson collections', () => {

    for (const {method, path, key} of collections) {

        test(`${method}() requests ${path} with no params`, async () => {
            const {fetchImpl, only} = mockFetch({[`GET ${path}`]: {data: page(key)}});
            const api = new DummyJsonApi({fetch: fetchImpl});

            const res = await api[method]();

            assert.equal(res.status, 200);
            assert.equal(only().path, path);
            assert.deepEqual(only().params, {});
        });

        test(`${method} passes limit and skip through`, async () => {
            const {fetchImpl, only} = mockFetch({[`GET ${path}`]: {data: page(key)}});
            const api = new DummyJsonApi({fetch: fetchImpl});

            await api[method]({limit: 10, skip: 20});

            assert.deepEqual(only().params, {limit: '10', skip: '20'});
        });
    }


    test('select is comma-joined when given as an array', async () => {
        const {fetchImpl, only} = mockFetch({'GET /products': {data: page('products')}});
        const api = new DummyJsonApi({fetch: fetchImpl});

        await api.getProducts({select: ['title', 'price']});

        assert.deepEqual(only().params, {select: 'title,price'});
    });


    test('select is passed straight through when given as a string', async () => {
        const {fetchImpl, only} = mockFetch({'GET /products': {data: page('products')}});
        const api = new DummyJsonApi({fetch: fetchImpl});

        await api.getProducts({select: 'title,price'});

        assert.deepEqual(only().params, {select: 'title,price'});
    });


    test('sortBy and order are sent together', async () => {
        const {fetchImpl, only} = mockFetch({'GET /products': {data: page('products')}});
        const api = new DummyJsonApi({fetch: fetchImpl});

        await api.getProducts({sortBy: 'title', order: 'desc'});

        assert.deepEqual(only().params, {sortBy: 'title', order: 'desc'});
    });


    test('the envelope is passed through untouched', async () => {
        const body = {products: [{id: 1, title: 'Essence Mascara'}], total: 194, skip: 0, limit: 1};
        const {fetchImpl} = mockFetch({'GET /products': {data: body}});
        const api = new DummyJsonApi({fetch: fetchImpl});

        const res = await api.getProducts({limit: 1});
        const data = await res.json();

        assert.equal(data.total, 194);
        assert.equal(data.products[0]?.title, 'Essence Mascara');
    });


    test('requests go to the dummyjson base URL', async () => {
        const {fetchImpl, only} = mockFetch({'GET /products': {data: page('products')}});
        const api = new DummyJsonApi({fetch: fetchImpl});

        await api.getProducts();

        assert.equal(only().origin, 'https://dummyjson.com');
    });
});


describe('dummyjson search and filters', () => {

    const searches = [
        {method: 'searchProducts', path: '/products/search', key: 'products'},
        {method: 'searchUsers', path: '/users/search', key: 'users'},
        {method: 'searchPosts', path: '/posts/search', key: 'posts'},
        {method: 'searchRecipes', path: '/recipes/search', key: 'recipes'}
    ] as const;

    for (const {method, path, key} of searches) {

        test(`${method} sends q alongside the list options`, async () => {
            const {fetchImpl, only} = mockFetch({[`GET ${path}`]: {data: page(key)}});
            const api = new DummyJsonApi({fetch: fetchImpl});

            await api[method]('phone', {limit: 5});

            assert.deepEqual(only().params, {q: 'phone', limit: '5'});
        });
    }


    test('getProductsByCategory puts the slug in the path', async () => {
        const {fetchImpl, only} = mockFetch({'GET /products/category/smartphones': {data: page('products')}});
        const api = new DummyJsonApi({fetch: fetchImpl});

        await api.getProductsByCategory('smartphones');

        assert.equal(only().path, '/products/category/smartphones');
    });


    test('categories come back as a bare array, not an envelope', async () => {
        const categories = [{slug: 'beauty', name: 'Beauty', url: 'https://dummyjson.com/products/category/beauty'}];
        const {fetchImpl} = mockFetch({'GET /products/categories': {data: categories}});
        const api = new DummyJsonApi({fetch: fetchImpl});

        const res = await api.getProductCategories();
        const data = await res.json();

        assert.equal(data[0]?.slug, 'beauty');
    });


    test('the category list is bare slugs', async () => {
        const {fetchImpl} = mockFetch({'GET /products/category-list': {data: ['beauty', 'fragrances']}});
        const api = new DummyJsonApi({fetch: fetchImpl});

        const res = await api.getProductCategoryList();
        const data = await res.json();

        assert.deepEqual(data, ['beauty', 'fragrances']);
    });


    test('nested user routes hit the right paths', async () => {
        const {fetchImpl, calls} = mockFetch({
            'GET /users/1/carts': {data: page('carts')},
            'GET /users/1/posts': {data: page('posts')},
            'GET /users/1/todos': {data: page('todos')}
        });
        const api = new DummyJsonApi({fetch: fetchImpl});

        await api.getUserCarts(1);
        await api.getUserPosts(1);
        await api.getUserTodos(1);

        assert.deepEqual(calls.map((c) => c.path), ['/users/1/carts', '/users/1/posts', '/users/1/todos']);
    });


    test('getPostComments and getPostsByTag use their nested paths', async () => {
        const {fetchImpl, calls} = mockFetch({
            'GET /posts/1/comments': {data: page('comments')},
            'GET /posts/tag/history': {data: page('posts')}
        });
        const api = new DummyJsonApi({fetch: fetchImpl});

        await api.getPostComments(1);
        await api.getPostsByTag('history');

        assert.deepEqual(calls.map((c) => c.path), ['/posts/1/comments', '/posts/tag/history']);
    });


    test('random endpoints return a single item', async () => {
        const {fetchImpl} = mockFetch({'GET /quotes/random': {data: {id: 1, quote: 'q', author: 'a'}}});
        const api = new DummyJsonApi({fetch: fetchImpl});

        const res = await api.getRandomQuote();
        const data = await res.json();

        assert.equal(data.author, 'a');
    });
});
