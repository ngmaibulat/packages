import {test, describe} from 'node:test';
import assert from 'node:assert/strict';

import {JsonPlaceHolderApi} from '../../src/jsonplaceholder/index.ts';
import {mockFetch} from '../helpers/mock-fetch.ts';

/*
jsonplaceholder is json-server, so the whole `_limit`/`_start`/`_page`/
`_sort`/`_order`/`_embed`/`_expand` family works on every collection. The
list methods accept either a bare number (the pre-3.0.0 form) or an options
object; both must land on the same query.
*/

describe('jsonplaceholder list options', () => {

    test('a bare number is still the limit', async () => {
        const {fetchImpl, only} = mockFetch({'GET /posts': {data: []}});
        const api = new JsonPlaceHolderApi({fetch: fetchImpl});

        await api.getPosts(5);

        assert.deepEqual(only().params, {_limit: '5'});
    });


    test('{limit} is the same request as a bare number', async () => {
        const {fetchImpl, only} = mockFetch({'GET /posts': {data: []}});
        const api = new JsonPlaceHolderApi({fetch: fetchImpl});

        await api.getPosts({limit: 5});

        assert.deepEqual(only().params, {_limit: '5'});
    });


    test('every option maps to its underscore param', async () => {
        const {fetchImpl, only} = mockFetch({'GET /posts': {data: []}});
        const api = new JsonPlaceHolderApi({fetch: fetchImpl});

        await api.getPosts({
            limit: 10,
            start: 20,
            page: 3,
            sort: 'title',
            order: 'desc',
            embed: 'comments',
            expand: 'user'
        });

        assert.deepEqual(only().params, {
            _limit: '10',
            _start: '20',
            _page: '3',
            _sort: 'title',
            _order: 'desc',
            _embed: 'comments',
            _expand: 'user'
        });
    });


    test('unset options produce no params at all', async () => {
        const {fetchImpl, only} = mockFetch({'GET /posts': {data: []}});
        const api = new JsonPlaceHolderApi({fetch: fetchImpl});

        await api.getPosts({sort: 'id'});

        assert.deepEqual(only().params, {_sort: 'id'});
    });


    test('get-one takes embed and expand', async () => {
        const {fetchImpl, only} = mockFetch({'GET /posts/1': {data: {}}});
        const api = new JsonPlaceHolderApi({fetch: fetchImpl});

        await api.getPost(1, {embed: 'comments'});

        assert.deepEqual(only().params, {_embed: 'comments'});
    });


    test('get-one with no options sends no params', async () => {
        const {fetchImpl, only} = mockFetch({'GET /posts/1': {data: {}}});
        const api = new JsonPlaceHolderApi({fetch: fetchImpl});

        await api.getPost(1);

        assert.deepEqual(only().params, {});
    });
});


describe('jsonplaceholder nested routes', () => {

    const nested = [
        {method: 'getPostComments', path: '/posts/1/comments'},
        {method: 'getAlbumPhotos', path: '/albums/1/photos'},
        {method: 'getUserPosts', path: '/users/1/posts'},
        {method: 'getUserAlbums', path: '/users/1/albums'},
        {method: 'getUserTodos', path: '/users/1/todos'}
    ] as const;

    for (const {method, path} of nested) {

        test(`${method}(1) requests ${path}`, async () => {
            const {fetchImpl, only} = mockFetch({[`GET ${path}`]: {data: []}});
            const api = new JsonPlaceHolderApi({fetch: fetchImpl});

            await api[method](1);

            assert.equal(only().path, path);
            assert.deepEqual(only().params, {});
        });

        test(`${method} passes list options through`, async () => {
            const {fetchImpl, only} = mockFetch({[`GET ${path}`]: {data: []}});
            const api = new JsonPlaceHolderApi({fetch: fetchImpl});

            await api[method](1, {limit: 3});

            assert.deepEqual(only().params, {_limit: '3'});
        });
    }


    test('getCommentsByPost is the query-param form of the same relationship', async () => {
        const {fetchImpl, only} = mockFetch({'GET /comments': {data: []}});
        const api = new JsonPlaceHolderApi({fetch: fetchImpl});

        await api.getCommentsByPost(1);

        assert.equal(only().path, '/comments');
        assert.deepEqual(only().params, {postId: '1'});
    });
});


describe('jsonplaceholder patch', () => {

    test('patchPost sends only the given fields', async () => {
        const {fetchImpl, only} = mockFetch({'PATCH /posts/1': {data: {}}});
        const api = new JsonPlaceHolderApi({fetch: fetchImpl});

        await api.patchPost(1, {title: 'new title'});

        assert.equal(only().method, 'PATCH');
        assert.deepEqual(only().body, {title: 'new title'});
    });
});
