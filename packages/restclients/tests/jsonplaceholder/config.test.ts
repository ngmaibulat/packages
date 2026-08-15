import {test, describe} from 'node:test';
import assert from 'node:assert/strict';

import {JsonPlaceHolderApi} from '../../src/jsonplaceholder/index.ts';
import {mockFetch} from '../helpers/mock-fetch.ts';

/*
The constructor accepts a `RequestInit` plus this package's own additions, so
consumers can set a timeout, add headers, point at a local json-server, or
wrap `fetch` itself. That last one is also what makes the mocked suite possible.
*/

describe('JsonPlaceHolderApi constructor config', () => {

    test('defaults to the public base URL when given nothing', () => {
        const api = new JsonPlaceHolderApi();

        assert.equal(api.baseUrl, 'https://jsonplaceholder.typicode.com');
    });


    test('baseUrl can be overridden, e.g. for a local json-server', async () => {
        const {fetchImpl, only} = mockFetch({'GET /posts': {data: []}});
        const api = new JsonPlaceHolderApi({fetch: fetchImpl, baseUrl: 'http://localhost:3000'});

        await api.getPosts();

        assert.equal(only().origin, 'http://localhost:3000');
    });


    test('a client-wide timeout is applied to every call', async () => {
        const seen: Array<AbortSignal | null | undefined> = [];

        const api = new JsonPlaceHolderApi({
            timeout: 2500,
            fetch: async (_input, init) => {
                seen.push(init?.signal);
                return new Response('[]', {headers: {'content-type': 'application/json'}});
            }
        });

        await api.getPosts();

        /* A timeout is a composed signal; without one there would be none at all. */
        assert.ok(seen[0] instanceof AbortSignal);
    });


    test('custom headers reach the request', async () => {
        const {fetchImpl, only} = mockFetch({'GET /posts': {data: []}});
        const api = new JsonPlaceHolderApi({
            fetch: fetchImpl,
            headers: {'X-Custom-Header': 'foobar'}
        });

        await api.getPosts();

        assert.equal(only().headers['x-custom-header'], 'foobar');
    });


    /*
    There is no interceptor mechanism: `fetch` is the extension point. A
    wrapper sees the fully-built request and can add to it, log it, retry it
    or replace the response outright.
    */
    test('fetch can be wrapped to add to every request', async () => {
        const {fetchImpl, only} = mockFetch({'GET /posts': {data: []}});

        const api = new JsonPlaceHolderApi({
            fetch: (input, init) => {
                const headers = new Headers(init?.headers);
                headers.set('X-Trace', 'abc123');
                return fetchImpl(input, {...init, headers});
            }
        });

        await api.getPosts();

        assert.equal(only().headers['x-trace'], 'abc123');
    });
});
