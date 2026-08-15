import {test, describe} from 'node:test';
import assert from 'node:assert/strict';

import {JsonPlaceHolderApi} from '../../src/jsonplaceholder/index.ts';
import {mockFetch} from '../helpers/mock-fetch.ts';

/*
Every list method maps to one path and funnels `limit` through the same
`_limit` query param. The interesting branch is the absent one: no limit
must mean no params at all, not `_limit=undefined`.
*/

const endpoints = [
    {method: 'getPosts', path: '/posts'},
    {method: 'getComments', path: '/comments'},
    {method: 'getAlbums', path: '/albums'},
    {method: 'getPhotos', path: '/photos'},
    {method: 'getTodos', path: '/todos'},
    {method: 'getUsers', path: '/users'}
] as const;


describe('jsonplaceholder list endpoints', () => {

    for (const {method, path} of endpoints) {

        test(`${method}() requests ${path} with no params`, async () => {
            const {fetchImpl, only} = mockFetch({[`GET ${path}`]: {data: []}});
            const api = new JsonPlaceHolderApi({fetch: fetchImpl});

            const res = await api[method]();

            assert.equal(res.status, 200);
            assert.deepEqual(only().params, {});
        });

        test(`${method}(2) sends _limit=2`, async () => {
            const {fetchImpl, only} = mockFetch({[`GET ${path}`]: {data: []}});
            const api = new JsonPlaceHolderApi({fetch: fetchImpl});

            await api[method](2);

            assert.deepEqual(only().params, {_limit: '2'});
        });
    }


    /*
    Params used to be built with a truthiness check, so a limit of 0 silently
    vanished. The shared `cleanQuery` helper drops only `undefined`, so an
    explicit 0 is an explicit `_limit=0` -- which is what the caller asked
    for, and what json-server answers with an empty array.
    */
    test('an explicit limit of 0 is sent as _limit=0', async () => {
        const {fetchImpl, only} = mockFetch({'GET /posts': {data: []}});
        const api = new JsonPlaceHolderApi({fetch: fetchImpl});

        await api.getPosts(0);

        assert.deepEqual(only().params, {_limit: '0'});
    });


    test('response body is passed through untouched', async () => {
        const posts = [{userId: 1, id: 1, title: 't', body: 'b'}];
        const {fetchImpl} = mockFetch({'GET /posts': {data: posts}});
        const api = new JsonPlaceHolderApi({fetch: fetchImpl});

        const res = await api.getPosts();

        assert.deepEqual(await res.json(), posts);
    });


    test('requests are sent against the jsonplaceholder base URL', async () => {
        const {fetchImpl, only} = mockFetch({'GET /posts': {data: []}});
        const api = new JsonPlaceHolderApi({fetch: fetchImpl});

        await api.getPosts();

        assert.equal(only().url.href, 'https://jsonplaceholder.typicode.com/posts');
    });
});
