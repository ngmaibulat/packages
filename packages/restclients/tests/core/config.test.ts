import {test, describe} from 'node:test';
import assert from 'node:assert/strict';

import {JsonPlaceHolderApi} from '../../src/jsonplaceholder/index.ts';
import {ReqresApi} from '../../src/reqres/index.ts';
import {DummyJsonApi} from '../../src/dummyjson/index.ts';
import {GithubApi} from '../../src/github/index.ts';
import {IpInfoApi} from '../../src/ipinfo/index.ts';
import {HttpbinApi} from '../../src/httpbin/index.ts';
import {WorldBankApi} from '../../src/worldbank/index.ts';
import {HttpError} from '../../src/core/index.ts';
import type {RequestOptions} from '../../src/core/index.ts';
import {mockFetch} from '../helpers/mock-fetch.ts';
import type {RecordedCall} from '../helpers/mock-fetch.ts';

/*
Every method takes a trailing options object, so a single call can carry an
AbortSignal, its own timeout, or a one-off header without touching the
client-wide defaults.
*/

describe('per-request config', () => {

    test('a per-call timeout reaches the transport', async () => {
        const {fetchImpl, calls} = mockFetch({'GET /posts/1': {data: {}}});
        const api = new JsonPlaceHolderApi({fetch: fetchImpl, timeout: 5000});

        await api.getPost(1, undefined, {timeout: 100});

        assert.equal(calls[0]?.route, 'GET /posts/1');
    });


    test('a per-call header is merged with the client defaults', async () => {
        const {fetchImpl, only} = mockFetch({'GET /posts': {data: []}});
        const api = new JsonPlaceHolderApi({fetch: fetchImpl, headers: {'X-Client': 'default'}});

        await api.getPosts(undefined, {headers: {'X-Trace': 'abc'}});

        /* Header names arrive lowercased: `Headers` normalises them. */
        assert.equal(only().headers['x-client'], 'default');
        assert.equal(only().headers['x-trace'], 'abc');
    });


    test('a per-call header overrides a client default of the same name', async () => {
        const {fetchImpl, only} = mockFetch({'GET /api/users': {data: {page: 1, per_page: 6, total: 12, total_pages: 2, data: []}}});
        const api = new ReqresApi({fetch: fetchImpl, apiKey: 'client-key'});

        await api.getUsers(undefined, undefined, {headers: {'x-api-key': 'call-key'}});

        assert.equal(only().headers['x-api-key'], 'call-key');
    });


    test('an already-aborted signal rejects the request', async () => {
        const {fetchImpl, calls} = mockFetch({'GET /posts': {data: []}});
        const api = new JsonPlaceHolderApi({fetch: fetchImpl});

        const controller = new AbortController();
        controller.abort();

        const err = await api.getPosts(undefined, {signal: controller.signal}).then(
            () => assert.fail('expected the request to reject'),
            (e: unknown) => e
        );

        assert.ok(err instanceof Error);
        /* The request is cut short before fetch ever runs. */
        assert.equal(calls.length, 0);
    });


    test('a timeout aborts with a TimeoutError', async () => {
        const api = new JsonPlaceHolderApi({
            timeout: 5,
            fetch: (_input, init) => new Promise((_resolve, reject) => {
                init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
            })
        });

        const err = await api.getPosts().then(
            () => assert.fail('expected the request to reject'),
            (e: unknown) => e
        );

        assert.equal((err as DOMException).name, 'TimeoutError');
    });


    test('writes take a config too', async () => {
        const {fetchImpl, only} = mockFetch({'POST /posts': {status: 201, data: {}}});
        const api = new JsonPlaceHolderApi({fetch: fetchImpl});

        await api.createPost({userId: 1, title: 't', body: 'b'}, {headers: {'X-Trace': 'abc'}});

        assert.deepEqual(only().body, {userId: 1, title: 't', body: 'b'});
        assert.equal(only().headers['x-trace'], 'abc');
    });


    test('a config passed to a list method does not lose the params', async () => {
        const {fetchImpl, only} = mockFetch({'GET /posts': {data: []}});
        const api = new JsonPlaceHolderApi({fetch: fetchImpl});

        await api.getPosts({limit: 2}, {headers: {'X-Trace': 'abc'}});

        assert.deepEqual(only().params, {_limit: '2'});
        assert.equal(only().headers['x-trace'], 'abc');
    });


    test('caller params win over the ones the method built', async () => {
        const {fetchImpl, only} = mockFetch({'GET /posts': {data: []}});
        const api = new JsonPlaceHolderApi({fetch: fetchImpl});

        await api.getPosts({limit: 2}, {params: {_limit: 9, extra: 'x'}});

        assert.deepEqual(only().params, {_limit: '9', extra: 'x'});
    });


    test('all three param layers merge, the caller last', async () => {
        const {fetchImpl, only} = mockFetch({'GET /posts': {data: []}});
        const api = new JsonPlaceHolderApi({fetch: fetchImpl, params: {api_key: 'k', _limit: 1}});

        await api.getPosts({limit: 2}, {params: {_limit: 3}});

        assert.deepEqual(only().params, {api_key: 'k', _limit: '3'});
    });


    test('a client-wide param survives a method that sends none', async () => {
        const {fetchImpl, only} = mockFetch({'GET /posts/1': {data: {}}});
        const api = new JsonPlaceHolderApi({fetch: fetchImpl, params: {api_key: 'k'}});

        await api.getPost(1);

        assert.deepEqual(only().params, {api_key: 'k'});
    });


    test('a per-call validateStatus overrides the client-wide one', async () => {
        const {fetchImpl} = mockFetch({'GET /posts/1': {data: {}}});
        const api = new JsonPlaceHolderApi({fetch: fetchImpl, validateStatus: () => false});

        const res = await api.getPost(1, undefined, {validateStatus: () => true});

        assert.equal(res.status, 200);
    });


    test('a per-call validateStatus can tighten a permissive client one', async () => {
        const {fetchImpl} = mockFetch({'GET /posts/1': {status: 404, data: {}}});
        const api = new JsonPlaceHolderApi({fetch: fetchImpl, validateStatus: () => true});

        const err = await api.getPost(1, undefined, {validateStatus: (s) => s < 400}).then(
            () => assert.fail('expected the request to reject'),
            (e: unknown) => e
        );

        assert.ok(err instanceof HttpError);
        assert.equal(err.status, 404);
    });
});


/*
The options that carry a credential are pulled out by each client's
constructor and turned into a header. None of them is a `ClientOptions` key,
so any that is passed through by mistake lands in the base class's rest
parameter and from there into the init of every `fetch` call -- which is the
object a consumer's own `fetch` wrapper is handed. dummyjson did exactly that
with its bearer token.
*/
describe('credential options', () => {

    /* The init the transport was handed, with the option keys it must not carry. */
    function leakedKeys(call: RecordedCall, keys: Array<string>): Array<string>
    {
        const init = (call.init ?? {}) as Record<string, unknown>;

        return keys.filter((key) => init[key] !== undefined);
    }


    test('dummyjson keeps its token out of the fetch init', async () => {
        const {fetchImpl, only} = mockFetch({
            'GET /products': {data: {products: [], total: 0, skip: 0, limit: 0}}
        });

        await new DummyJsonApi({fetch: fetchImpl, token: 'tok'}).getProducts();

        assert.deepEqual(leakedKeys(only(), ['token']), []);
        assert.equal(only().headers['authorization'], 'Bearer tok');
    });


    test('github keeps its token and version out of the fetch init', async () => {
        const {fetchImpl, only} = mockFetch({'GET /users/octocat': {data: {}}});

        await new GithubApi({fetch: fetchImpl, token: 'tok', version: '2022-11-28'}).getUser('octocat');

        assert.deepEqual(leakedKeys(only(), ['token', 'version']), []);
        assert.equal(only().headers['authorization'], 'Bearer tok');
    });


    test('ipinfo keeps its token out of the fetch init', async () => {
        const {fetchImpl, only} = mockFetch({'GET /json': {data: {ip: '1.1.1.1'}}});

        await new IpInfoApi({fetch: fetchImpl, token: 'tok'}).lookup();

        assert.deepEqual(leakedKeys(only(), ['token']), []);
        assert.equal(only().headers['authorization'], 'Bearer tok');
    });


    test('reqres keeps its apiKey out of the fetch init', async () => {
        const {fetchImpl, only} = mockFetch({'GET /api/users/1': {data: {data: {}, support: {}}}});

        await new ReqresApi({fetch: fetchImpl, apiKey: 'tok'}).getUser(1);

        assert.deepEqual(leakedKeys(only(), ['apiKey']), []);
        assert.equal(only().headers['x-api-key'], 'tok');
    });
});


describe('caller init keys the method owns', () => {

    test('a caller body is not forwarded on a GET', async () => {
        const {fetchImpl, only} = mockFetch({'GET /posts/1': {data: {}}});
        const api = new JsonPlaceHolderApi({fetch: fetchImpl});

        await api.getPost(1, undefined, {body: 'x'} as unknown as RequestOptions);

        assert.equal(only().body, undefined);
        assert.equal(only().init?.body, undefined);
    });


    test('a caller body does not displace a write body', async () => {
        const {fetchImpl, only} = mockFetch({'POST /posts': {status: 201, data: {}}});
        const api = new JsonPlaceHolderApi({fetch: fetchImpl});

        await api.createPost({userId: 1, title: 't', body: 'b'}, {body: 'x'} as unknown as RequestOptions);

        assert.deepEqual(only().body, {userId: 1, title: 't', body: 'b'});
    });


    test('a caller method is ignored', async () => {
        const {fetchImpl, only} = mockFetch({'GET /posts/1': {data: {}}});
        const api = new JsonPlaceHolderApi({fetch: fetchImpl});

        await api.getPost(1, undefined, {method: 'DELETE'} as unknown as RequestOptions);

        assert.equal(only().method, 'GET');
    });
});


describe('baseUrl normalisation', () => {

    /*
    Paths are joined by concatenation -- `new URL(path, base)` would drop
    worldbank's `/v2` -- so a trailing slash on the base used to survive into
    the url as `https://postman-echo.com//ip`.
    */
    test('a trailing slash on baseUrl does not double up', async () => {
        const {fetchImpl, only} = mockFetch({'GET https://postman-echo.com/ip': {data: {origin: '1.1.1.1'}}});
        const api = new HttpbinApi({fetch: fetchImpl, baseUrl: 'https://postman-echo.com/'});

        await api.ip();

        assert.equal(only().path, '/ip');
    });


    test('baseUrl is normalised on the instance', () => {
        const api = new HttpbinApi({baseUrl: 'https://postman-echo.com//'});

        assert.equal(api.baseUrl, 'https://postman-echo.com');
    });


    test('a base URL with its own path keeps it', async () => {
        const {fetchImpl, only} = mockFetch({'GET https://mirror.example/v2/country': {data: [{}, []]}});
        const api = new WorldBankApi({fetch: fetchImpl, baseUrl: 'https://mirror.example/v2/'});

        await api.getCountries();

        assert.equal(only().path, '/v2/country');
    });
});
