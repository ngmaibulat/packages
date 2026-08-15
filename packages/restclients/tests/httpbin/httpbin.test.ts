import {test, describe} from 'node:test';
import assert from 'node:assert/strict';

import {HttpbinApi, HttpError, baseUrl} from '../../src/httpbin/index.ts';
import {mockFetch} from '../helpers/mock-fetch.ts';

const echo = {args: {}, headers: {}, origin: '1.2.3.4', url: 'https://httpbin.org/get'};


describe('httpbin echo verbs', () => {

    test('get() sends no params by default', async () => {
        const {fetchImpl, only} = mockFetch({'GET /get': {data: echo}});
        const api = new HttpbinApi({fetch: fetchImpl});

        await api.get();

        assert.deepEqual(only().params, {});
    });


    test('get(params) forwards them, comma-joining arrays', async () => {
        const {fetchImpl, only} = mockFetch({'GET /get': {data: echo}});
        const api = new HttpbinApi({fetch: fetchImpl});

        await api.get({a: 1, b: ['x', 'y']});

        assert.deepEqual(only().params, {a: '1', b: 'x,y'});
    });


    test('the write verbs send their bodies', async () => {
        const {fetchImpl, calls} = mockFetch({
            'POST /post': {data: echo},
            'PUT /put': {data: echo},
            'PATCH /patch': {data: echo},
            'DELETE /delete': {data: echo}
        });
        const api = new HttpbinApi({fetch: fetchImpl});

        await api.post({a: 1});
        await api.put({b: 2});
        await api.patch({c: 3});
        await api.delete();

        assert.deepEqual(calls.map((c) => c.route), ['POST /post', 'PUT /put', 'PATCH /patch', 'DELETE /delete']);
        assert.deepEqual(calls[0]?.body, {a: 1});
        assert.deepEqual(calls[2]?.body, {c: 3});
    });


    test('requests go to the httpbin base URL', async () => {
        const {fetchImpl, only} = mockFetch({'GET /ip': {data: {origin: '1.2.3.4'}}});
        const api = new HttpbinApi({fetch: fetchImpl});

        await api.ip();

        assert.equal(only().origin, baseUrl);
    });


    /*
    Postman Echo answers most of the same routes, and a self-hosted instance
    answers all of them -- the base URL is the only thing that changes.
    */
    test('the base URL can be pointed at Postman Echo', async () => {
        const {fetchImpl, only} = mockFetch({'GET /get': {data: echo}});
        const api = new HttpbinApi({fetch: fetchImpl, baseUrl: 'https://postman-echo.com'});

        await api.get();

        assert.equal(only().origin, 'https://postman-echo.com');
    });
});


describe('httpbin behaviour endpoints', () => {

    test('status(200) resolves', async () => {
        const {fetchImpl, only} = mockFetch({'GET /status/200': {status: 200}});
        const api = new HttpbinApi({fetch: fetchImpl});

        const res = await api.status(200);

        assert.equal(res.status, 200);
        assert.equal(only().path, '/status/200');
    });


    test('status(503) rejects with an HttpError carrying the status', async () => {
        const {fetchImpl} = mockFetch({'GET /status/503': {status: 503}});
        const api = new HttpbinApi({fetch: fetchImpl});

        const err = await api.status(503).then(
            () => assert.fail('expected the request to reject'),
            (e: unknown) => e
        );

        assert.ok(err instanceof HttpError);
        assert.equal(err.status, 503);
        assert.equal(err.response.status, 503);
    });


    test('delay and redirect put the count in the path', async () => {
        const {fetchImpl, calls} = mockFetch({
            'GET /delay/3': {data: echo},
            'GET /redirect/2': {data: echo}
        });
        const api = new HttpbinApi({fetch: fetchImpl});

        await api.delay(3);
        await api.redirect(2);

        assert.deepEqual(calls.map((c) => c.path), ['/delay/3', '/redirect/2']);
    });


    test('redirectTo sends the target as a param', async () => {
        const {fetchImpl, only} = mockFetch({'GET /redirect-to': {status: 302}});
        const api = new HttpbinApi({fetch: fetchImpl, validateStatus: () => true});

        await api.redirectTo('https://example.com', 307);

        assert.deepEqual(only().params, {url: 'https://example.com', status_code: '307'});
    });


    test('cache() and cache(60) hit different paths', async () => {
        const {fetchImpl, calls} = mockFetch({
            'GET /cache': {data: echo},
            'GET /cache/60': {data: echo}
        });
        const api = new HttpbinApi({fetch: fetchImpl});

        await api.cache();
        await api.cache(60);

        assert.deepEqual(calls.map((c) => c.path), ['/cache', '/cache/60']);
    });
});


describe('httpbin auth', () => {

    test('bearer() sets the Authorization header', async () => {
        const {fetchImpl, only} = mockFetch({'GET /bearer': {data: {authenticated: true, token: 't'}}});
        const api = new HttpbinApi({fetch: fetchImpl});

        const res = await api.bearer('t');
        const data = await res.json();

        assert.equal(only().headers['authorization'], 'Bearer t');
        assert.equal(data.authenticated, true);
    });


    test('basicAuth() puts the credentials in the path and in an Authorization header', async () => {
        const {fetchImpl, only} = mockFetch({
            'GET /basic-auth/user/pass': {data: {authenticated: true, user: 'user'}}
        });
        const api = new HttpbinApi({fetch: fetchImpl});

        await api.basicAuth('user', 'pass');

        assert.equal(only().path, '/basic-auth/user/pass');
        /*
        httpbin wants the same credentials twice: in the path, so it knows
        what to accept, and as real basic auth. `fetch` has no `auth` option,
        so the client base64-encodes them into the header itself.
        */
        assert.equal(only().headers['authorization'], `Basic ${btoa('user:pass')}`);
    });


    /*
    httpbin wants the credentials in the path as well as in the header, and
    the two need different treatment: the path segment is percent-encoded so a
    `/` cannot split it, while the header carries the credential verbatim.
    Encoding the wrong one of those breaks the authentication itself.
    */
    test('a password containing a slash stays in one path segment', async () => {
        const {fetchImpl, only} = mockFetch({
            'GET /basic-auth/u/p%2Fw': {data: {authenticated: true, user: 'u'}}
        });
        const api = new HttpbinApi({fetch: fetchImpl});

        await api.basicAuth('u', 'p/w');

        assert.equal(only().url.pathname, '/basic-auth/u/p%2Fw');
        assert.equal(only().headers['authorization'], `Basic ${btoa('u:p/w')}`);
    });


    /*
    `basicAuth` and `bearer` build an Authorization header of their own and
    merge the caller's over it. That merge used to be an object spread, which
    only works for the record form of `HeadersInit` -- a `Headers` instance
    and an array of pairs both spread to nothing, so the caller's headers
    disappeared without a word.
    */
    test('bearer() keeps a caller Headers object', async () => {
        const {fetchImpl, only} = mockFetch({'GET /bearer': {data: {authenticated: true, token: 't'}}});
        const api = new HttpbinApi({fetch: fetchImpl});

        await api.bearer('t', {headers: new Headers({'X-Trace': 'abc'})});

        assert.equal(only().headers['authorization'], 'Bearer t');
        assert.equal(only().headers['x-trace'], 'abc');
    });


    test('basicAuth() keeps caller headers given as pairs', async () => {
        const {fetchImpl, only} = mockFetch({
            'GET /basic-auth/user/pass': {data: {authenticated: true, user: 'user'}}
        });
        const api = new HttpbinApi({fetch: fetchImpl});

        await api.basicAuth('user', 'pass', {headers: [['x-trace', 'abc']]});

        assert.equal(only().headers['authorization'], `Basic ${btoa('user:pass')}`);
        assert.equal(only().headers['x-trace'], 'abc');
    });


    /* The caller is applied last, so an explicit header still wins. */
    test('a caller Authorization wins over the one bearer() built', async () => {
        const {fetchImpl, only} = mockFetch({'GET /bearer': {data: {authenticated: true, token: 't'}}});
        const api = new HttpbinApi({fetch: fetchImpl});

        await api.bearer('t', {headers: {Authorization: 'Bearer mine'}});

        assert.equal(only().headers['authorization'], 'Bearer mine');
    });


    test('a rejected credential is a 401', async () => {
        const {fetchImpl} = mockFetch({'GET /bearer': {status: 401}});
        const api = new HttpbinApi({fetch: fetchImpl});

        const err = await api.bearer('bad').then(
            () => assert.fail('expected the request to reject'),
            (e: unknown) => e
        );

        assert.ok(err instanceof HttpError);
        assert.equal(err.status, 401);
    });
});
