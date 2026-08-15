import {test, describe} from 'node:test';
import assert from 'node:assert/strict';

import {DummyJsonApi, HttpError} from '../../src/dummyjson/index.ts';
import type {DummyError} from '../../src/dummyjson/index.ts';
import {mockFetch} from '../helpers/mock-fetch.ts';

const credentials = {username: 'emilys', password: 'emilyspass'};

const session = {
    id: 1,
    username: 'emilys',
    email: 'emily.johnson@x.dummyjson.com',
    accessToken: 'access-1',
    refreshToken: 'refresh-1'
};


describe('dummyjson auth', () => {

    test('login POSTs the credentials and returns both tokens', async () => {
        const {fetchImpl, only} = mockFetch({'POST /auth/login': {data: session}});
        const api = new DummyJsonApi({fetch: fetchImpl});

        const res = await api.login(credentials);
        const data = await res.json();

        assert.deepEqual(only().body, credentials);
        assert.equal(data.accessToken, 'access-1');
        assert.equal(data.refreshToken, 'refresh-1');
    });


    test('expiresInMins travels in the login body', async () => {
        const {fetchImpl, only} = mockFetch({'POST /auth/login': {data: session}});
        const api = new DummyJsonApi({fetch: fetchImpl});

        await api.login({...credentials, expiresInMins: 5});

        assert.deepEqual(only().body, {...credentials, expiresInMins: 5});
    });


    test('no Authorization header is sent without a token', async () => {
        const {fetchImpl, only} = mockFetch({'GET /products': {data: {products: [], total: 0, skip: 0, limit: 30}}});
        const api = new DummyJsonApi({fetch: fetchImpl});

        await api.getProducts();

        assert.equal(only().headers['authorization'], undefined);
    });


    test('a constructor token becomes a bearer header', async () => {
        const {fetchImpl, only} = mockFetch({'GET /auth/me': {data: {id: 1}}});
        const api = new DummyJsonApi({fetch: fetchImpl, token: 'access-1'});

        await api.me();

        assert.equal(only().headers['authorization'], 'Bearer access-1');
    });


    /*
    The whole point of setToken: the token does not exist until login has
    already returned, so it cannot be a constructor-only option.
    */
    test('setToken authenticates every later call', async () => {
        const {fetchImpl, calls} = mockFetch({
            'POST /auth/login': {data: session},
            'GET /auth/me': {data: {id: 1}}
        });
        const api = new DummyJsonApi({fetch: fetchImpl});

        const login = await api.login(credentials);
        api.setToken((await login.json()).accessToken);
        await api.me();

        assert.equal(calls[0]?.headers['authorization'], undefined);
        assert.equal(calls[1]?.headers['authorization'], 'Bearer access-1');
    });


    test('setToken() with no argument clears the header again', async () => {
        const {fetchImpl, calls} = mockFetch({'GET /auth/me': {data: {id: 1}}});
        const api = new DummyJsonApi({fetch: fetchImpl, token: 'access-1'});

        await api.me();
        api.setToken();
        await api.me();

        assert.equal(calls[0]?.headers['authorization'], 'Bearer access-1');
        assert.equal(calls[1]?.headers['authorization'], undefined);
    });


    test('refresh POSTs the refresh token', async () => {
        const {fetchImpl, only} = mockFetch({
            'POST /auth/refresh': {data: {accessToken: 'access-2', refreshToken: 'refresh-2'}}
        });
        const api = new DummyJsonApi({fetch: fetchImpl});

        const res = await api.refresh('refresh-1', 30);
        const data = await res.json();

        assert.deepEqual(only().body, {refreshToken: 'refresh-1', expiresInMins: 30});
        assert.equal(data.accessToken, 'access-2');
    });


    test('a bad password surfaces the DummyError body on the HttpError', async () => {
        const {fetchImpl} = mockFetch({
            'POST /auth/login': {status: 400, data: {message: 'Invalid credentials'}}
        });
        const api = new DummyJsonApi({fetch: fetchImpl});

        const err = await api.login({username: 'emilys', password: 'wrong'}).then(
            () => assert.fail('expected the request to reject'),
            (e: unknown) => e
        );

        assert.ok(err instanceof HttpError);
        assert.equal(err.status, 400);
        assert.equal((await err.response.json() as DummyError).message, 'Invalid credentials');
    });


    test('an expired token surfaces as a 401', async () => {
        const {fetchImpl} = mockFetch({
            'GET /auth/me': {status: 401, data: {message: 'Token Expired!'}}
        });
        const api = new DummyJsonApi({fetch: fetchImpl, token: 'stale'});

        const err = await api.me().then(
            () => assert.fail('expected the request to reject'),
            (e: unknown) => e
        );

        assert.ok(err instanceof HttpError);
        assert.equal(err.status, 401);
    });
});


describe('dummyjson product writes', () => {

    test('addProduct POSTs to /products/add', async () => {
        const {fetchImpl, only} = mockFetch({'POST /products/add': {status: 201, data: {id: 195, title: 'New'}}});
        const api = new DummyJsonApi({fetch: fetchImpl});

        const res = await api.addProduct({title: 'New'});
        const data = await res.json();

        assert.equal(only().route, 'POST /products/add');
        assert.deepEqual(only().body, {title: 'New'});
        assert.equal(data.id, 195);
    });


    test('update and patch hit the same path with different verbs', async () => {
        const {fetchImpl, calls} = mockFetch({
            'PUT /products/1': {data: {id: 1}},
            'PATCH /products/1': {data: {id: 1}}
        });
        const api = new DummyJsonApi({fetch: fetchImpl});

        await api.updateProduct(1, {title: 'a'});
        await api.patchProduct(1, {price: 2});

        assert.deepEqual(calls.map((c) => c.route), ['PUT /products/1', 'PATCH /products/1']);
        assert.deepEqual(calls[1]?.body, {price: 2});
    });


    test('deleteProduct returns the product with the deletion markers', async () => {
        const body = {id: 1, title: 'Essence Mascara', isDeleted: true, deletedOn: '2026-08-11T00:00:00.000Z'};
        const {fetchImpl, only} = mockFetch({'DELETE /products/1': {data: body}});
        const api = new DummyJsonApi({fetch: fetchImpl});

        const res = await api.deleteProduct(1);
        const data = await res.json();

        assert.equal(only().method, 'DELETE');
        assert.equal(data.isDeleted, true);
    });
});
