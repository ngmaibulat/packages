import {test, describe} from 'node:test';
import assert from 'node:assert/strict';

import {JsonPlaceHolderApi, HttpError} from '../../src/jsonplaceholder/index.ts';
import {mockFetch} from '../helpers/mock-fetch.ts';

/*
The re-exported HttpError is a public contract: it is what lets consumers
`instanceof`-check failures. If the re-export ever stopped pointing at the
same class the checks below break.

`fetch` on its own resolves a 404 -- the client is what turns a non-2xx back
into a rejection.
*/

describe('jsonplaceholder error handling', () => {

    test('a 404 rejects with an HttpError carrying the response', async () => {
        const {fetchImpl} = mockFetch({
            'GET /posts/999': {status: 404, data: {}}
        });
        const api = new JsonPlaceHolderApi({fetch: fetchImpl});

        const err = await api.getPost(999).then(
            () => assert.fail('expected the request to reject'),
            (e: unknown) => e
        );

        assert.ok(err instanceof HttpError);
        assert.equal(err.status, 404);
        assert.equal(err.response.status, 404);
    });


    test('the error body is still readable off the response', async () => {
        const {fetchImpl} = mockFetch({
            'GET /posts/999': {status: 404, data: {message: 'not found'}}
        });
        const api = new JsonPlaceHolderApi({fetch: fetchImpl});

        const err = await api.getPost(999).then(
            () => assert.fail('expected the request to reject'),
            (e: unknown) => e
        );

        assert.ok(err instanceof HttpError);
        /* Nothing consumed the body on the way out. */
        assert.deepEqual(await err.response.json(), {message: 'not found'});
    });


    test('a 500 rejects too', async () => {
        const {fetchImpl} = mockFetch({
            'PUT /posts/999': {status: 500, data: {}}
        });
        const api = new JsonPlaceHolderApi({fetch: fetchImpl});

        const err = await api
            .updatePost(999, {userId: 1, title: 't', body: 'b'})
            .then(
                () => assert.fail('expected the request to reject'),
                (e: unknown) => e
            );

        assert.ok(err instanceof HttpError);
        assert.equal(err.status, 500);
    });


    /*
    A transport failure never produced a response, so there is nothing for an
    HttpError to carry. It is left as the TypeError fetch itself throws.
    */
    test('a transport failure rejects with something other than an HttpError', async () => {
        const {fetchImpl} = mockFetch({
            'GET /posts': {networkError: 'ENOTFOUND'}
        });
        const api = new JsonPlaceHolderApi({fetch: fetchImpl});

        const err = await api.getPosts().then(
            () => assert.fail('expected the request to reject'),
            (e: unknown) => e
        );

        assert.ok(err instanceof TypeError);
        assert.ok(!(err instanceof HttpError));
    });


    test('validateStatus from the constructor is honoured', async () => {
        const {fetchImpl} = mockFetch({
            'GET /posts/999': {status: 404, data: {}}
        });
        const api = new JsonPlaceHolderApi({
            fetch: fetchImpl,
            validateStatus: (status) => status < 500
        });

        const res = await api.getPost(999);

        assert.equal(res.status, 404);
    });


    test('validateStatus can be given per call', async () => {
        const {fetchImpl} = mockFetch({
            'GET /posts/999': {status: 404, data: {}}
        });
        const api = new JsonPlaceHolderApi({fetch: fetchImpl});

        const res = await api.getPost(999, undefined, {validateStatus: () => true});

        assert.equal(res.status, 404);
        assert.equal(res.ok, false);
    });
});


/*
What the error carries beyond its status.

`response.url` is the redirect-resolved url and is the right thing to prefer,
but a `Response` built by its constructor -- which is every mock, and some
non-native fetch implementations -- reports it as an empty string. The url the
request was sent to is the fallback, so `err.url` is never blank in practice.
*/
describe('HttpError fields', () => {

    test('an HttpError carries the url it was sent to', async () => {
        const {fetchImpl} = mockFetch({'GET /posts/1': {status: 404, data: {}}});
        const api = new JsonPlaceHolderApi({fetch: fetchImpl});

        const err = await api.getPost(1).then(
            () => assert.fail('expected the request to reject'),
            (e: unknown) => e
        );

        assert.ok(err instanceof HttpError);
        assert.equal(err.url, 'https://jsonplaceholder.typicode.com/posts/1');
    });


    test('an HttpError carries the statusText', async () => {
        const {fetchImpl} = mockFetch({'GET /posts/1': {status: 503, data: {}}});
        const api = new JsonPlaceHolderApi({fetch: fetchImpl});

        const err = await api.getPost(1).then(
            () => assert.fail('expected the request to reject'),
            (e: unknown) => e
        );

        assert.ok(err instanceof HttpError);
        assert.equal(err.statusText, '503');
    });


    /* A response that does report a url keeps it -- the fallback is only that. */
    test('a url reported by the response wins over the requested one', async () => {
        const resolved = 'https://jsonplaceholder.typicode.com/posts/2';

        const api = new JsonPlaceHolderApi({
            fetch: async () => {
                const res = new Response('{}', {status: 404});
                Object.defineProperty(res, 'url', {value: resolved});
                return res;
            }
        });

        const err = await api.getPost(1).then(
            () => assert.fail('expected the request to reject'),
            (e: unknown) => e
        );

        assert.ok(err instanceof HttpError);
        assert.equal(err.url, resolved);
    });
});
