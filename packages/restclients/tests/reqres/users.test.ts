import {test, describe} from 'node:test';
import assert from 'node:assert/strict';

import {ReqresApi, freeApiKey} from '../../src/reqres/index.ts';
import {mockFetch} from '../helpers/mock-fetch.ts';

const janet = {
    id: 2,
    email: 'janet.weaver@reqres.in',
    first_name: 'Janet',
    last_name: 'Weaver',
    avatar: 'https://reqres.in/img/faces/2-image.jpg'
};


describe('reqres users', () => {

    test('getUsers() requests /users with no params', async () => {
        const {fetchImpl, only} = mockFetch({
            'GET /api/users': {data: {page: 1, per_page: 6, total: 12, total_pages: 2, data: []}}
        });
        const api = new ReqresApi({fetch: fetchImpl});

        await api.getUsers();

        assert.deepEqual(only().params, {});
    });


    test('getUsers(2) sends page=2 and unwraps the envelope', async () => {
        const body = {
            page: 2,
            per_page: 6,
            total: 12,
            total_pages: 2,
            data: [janet],
            support: {url: 'https://reqres.in/', text: 'ad'}
        };
        const {fetchImpl, only} = mockFetch({'GET /api/users': {data: body}});
        const api = new ReqresApi({fetch: fetchImpl});

        const res = await api.getUsers(2);
        const data = await res.json();

        assert.deepEqual(only().params, {page: '2'});
        assert.equal(data.total_pages, 2);
        assert.equal(data.data[0]?.first_name, 'Janet');
    });


    test('getUsers(1, 3) sends both page and delay', async () => {
        const {fetchImpl, only} = mockFetch({
            'GET /api/users': {data: {page: 1, per_page: 6, total: 12, total_pages: 2, data: []}}
        });
        const api = new ReqresApi({fetch: fetchImpl});

        await api.getUsers(1, 3);

        assert.deepEqual(only().params, {page: '1', delay: '3'});
    });


    test('getUser(2) unwraps the single-item envelope', async () => {
        const {fetchImpl, only} = mockFetch({'GET /api/users/2': {data: {data: janet}}});
        const api = new ReqresApi({fetch: fetchImpl});

        const res = await api.getUser(2);
        const data = await res.json();

        assert.equal(only().path, '/api/users/2');
        assert.equal(data.data.email, 'janet.weaver@reqres.in');
    });


    test('createUser POSTs {name, job}', async () => {
        const {fetchImpl, only} = mockFetch({
            'POST /api/users': {
                status: 201,
                data: {name: 'morpheus', job: 'leader', id: '123', createdAt: '2026-08-11T00:00:00.000Z'}
            }
        });
        const api = new ReqresApi({fetch: fetchImpl});

        const res = await api.createUser({name: 'morpheus', job: 'leader'});
        const data = await res.json();

        assert.deepEqual(only().body, {name: 'morpheus', job: 'leader'});
        assert.equal(data.id, '123');
    });


    test('updateUser PUTs and patchUser PATCHes the same path', async () => {
        const {fetchImpl, calls} = mockFetch({
            'PUT /api/users/2': {data: {name: 'a', job: 'b', updatedAt: 'x'}},
            'PATCH /api/users/2': {data: {name: 'a', job: 'b', updatedAt: 'x'}}
        });
        const api = new ReqresApi({fetch: fetchImpl});

        await api.updateUser(2, {name: 'a', job: 'b'});
        await api.patchUser(2, {job: 'b'});

        assert.deepEqual(calls.map((c) => c.route), ['PUT /api/users/2', 'PATCH /api/users/2']);
        assert.deepEqual(calls[1]?.body, {job: 'b'});
    });


    test('deleteUser accepts a 204 with no body', async () => {
        const {fetchImpl, only} = mockFetch({'DELETE /api/users/2': {status: 204}});
        const api = new ReqresApi({fetch: fetchImpl});

        const res = await api.deleteUser(2);

        assert.equal(res.status, 204);
        assert.equal(only().method, 'DELETE');
    });
});


describe('reqres resources', () => {

    test('getResources maps to the /unknown collection', async () => {
        const {fetchImpl, only} = mockFetch({
            'GET /api/unknown': {data: {page: 1, per_page: 6, total: 12, total_pages: 2, data: []}}
        });
        const api = new ReqresApi({fetch: fetchImpl});

        await api.getResources();

        assert.equal(only().path, '/api/unknown');
    });


    test('getResource(2) requests /unknown/2', async () => {
        const resource = {id: 2, name: 'fuchsia rose', year: 2001, color: '#C74375', pantone_value: '17-2031'};
        const {fetchImpl, only} = mockFetch({'GET /api/unknown/2': {data: {data: resource}}});
        const api = new ReqresApi({fetch: fetchImpl});

        const res = await api.getResource(2);
        const data = await res.json();

        assert.equal(only().path, '/api/unknown/2');
        assert.equal(data.data.pantone_value, '17-2031');
    });
});


describe('reqres api key', () => {

    test('the free key is sent by default', async () => {
        const {fetchImpl, only} = mockFetch({
            'GET /api/users': {data: {page: 1, per_page: 6, total: 12, total_pages: 2, data: []}}
        });
        const api = new ReqresApi({fetch: fetchImpl});

        await api.getUsers();

        assert.equal(only().headers['x-api-key'], freeApiKey);
    });


    test('apiKey sets the header', async () => {
        const {fetchImpl, only} = mockFetch({
            'GET /api/users': {data: {page: 1, per_page: 6, total: 12, total_pages: 2, data: []}}
        });
        const api = new ReqresApi({fetch: fetchImpl, apiKey: 'my-own-key'});

        await api.getUsers();

        assert.equal(only().headers['x-api-key'], 'my-own-key');
    });


    test('an explicit x-api-key header still wins over apiKey', async () => {
        const {fetchImpl, only} = mockFetch({
            'GET /api/users': {data: {page: 1, per_page: 6, total: 12, total_pages: 2, data: []}}
        });
        const api = new ReqresApi({
            fetch: fetchImpl,
            apiKey: 'from-option',
            headers: {'x-api-key': 'from-header'}
        });

        await api.getUsers();

        assert.equal(only().headers['x-api-key'], 'from-header');
    });


    test('other custom headers do not clobber the key', async () => {
        const {fetchImpl, only} = mockFetch({
            'GET /api/users': {data: {page: 1, per_page: 6, total: 12, total_pages: 2, data: []}}
        });
        const api = new ReqresApi({fetch: fetchImpl, headers: {'X-Trace': 'abc'}});

        await api.getUsers();

        assert.equal(only().headers['x-api-key'], freeApiKey);
        assert.equal(only().headers['x-trace'], 'abc');
    });


    test('requests go to the reqres api base URL', async () => {
        const {fetchImpl, only} = mockFetch({
            'GET /api/users': {data: {page: 1, per_page: 6, total: 12, total_pages: 2, data: []}}
        });
        const api = new ReqresApi({fetch: fetchImpl});

        await api.getUsers();

        assert.equal(only().url.href, 'https://reqres.in/api/users');
    });
});
