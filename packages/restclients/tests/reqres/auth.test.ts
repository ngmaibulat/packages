import {test, describe} from 'node:test';
import assert from 'node:assert/strict';

import {ReqresApi, HttpError} from '../../src/reqres/index.ts';
import type {ReqresError} from '../../src/reqres/index.ts';
import {mockFetch} from '../helpers/mock-fetch.ts';

const credentials = {email: 'eve.holt@reqres.in', password: 'cityslicka'};


describe('reqres auth', () => {

    test('register POSTs credentials and returns an id and token', async () => {
        const {fetchImpl, only} = mockFetch({
            'POST /api/register': {data: {id: 4, token: 'QpwL5tke4Pnpja7X4'}}
        });
        const api = new ReqresApi({fetch: fetchImpl});

        const res = await api.register(credentials);
        const data = await res.json();

        assert.equal(only().route, 'POST /api/register');
        assert.deepEqual(only().body, credentials);
        assert.equal(data.token, 'QpwL5tke4Pnpja7X4');
    });


    test('login POSTs credentials and returns a token', async () => {
        const {fetchImpl, only} = mockFetch({
            'POST /api/login': {data: {token: 'QpwL5tke4Pnpja7X4'}}
        });
        const api = new ReqresApi({fetch: fetchImpl});

        const res = await api.login(credentials);
        const data = await res.json();

        assert.equal(only().route, 'POST /api/login');
        assert.equal(data.token, 'QpwL5tke4Pnpja7X4');
    });


    test('a rejected login surfaces the ReqresError body on the HttpError', async () => {
        const {fetchImpl} = mockFetch({
            'POST /api/login': {status: 400, data: {error: 'user not found'}}
        });
        const api = new ReqresApi({fetch: fetchImpl});

        const err = await api.login(credentials).then(
            () => assert.fail('expected the request to reject'),
            (e: unknown) => e
        );

        assert.ok(err instanceof HttpError);
        assert.equal(err.status, 400);
        assert.equal((await err.response.json() as ReqresError).error, 'user not found');
    });


    test('a missing api key surfaces as a 401', async () => {
        /*
        Mirrors what reqres actually returns for an unwhitelisted URL when
        only the public free key is supplied.
        */
        const body = {
            error: 'missing_api_key',
            message: 'The x-api-key header is required for this endpoint.'
        };
        const {fetchImpl} = mockFetch({'GET /api/unknown': {status: 401, data: body}});
        const api = new ReqresApi({fetch: fetchImpl});

        const err = await api.getResources().then(
            () => assert.fail('expected the request to reject'),
            (e: unknown) => e
        );

        assert.ok(err instanceof HttpError);
        assert.equal(err.status, 401);
        assert.equal((await err.response.json() as ReqresError).error, 'missing_api_key');
    });
});
