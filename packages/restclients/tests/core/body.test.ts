import {test, describe} from 'node:test';
import assert from 'node:assert/strict';

import {HttpbinApi} from '../../src/httpbin/index.ts';
import {mockFetch} from '../helpers/mock-fetch.ts';

/*
What the client does with a body, and what content-type it decides to send.

Driven through httpbin because echoing the request back is the whole point of
that API, so a body test reads the same way there as the real call does.

The rule: anything `fetch` can send as-is goes through untouched and picks up
no content-type from us -- fetch sets its own for FormData and friends, and a
string is the caller's to describe. Everything else is JSON.
*/

describe('request bodies', () => {

    test('an object body gets a json content-type', async () => {
        const {fetchImpl, only} = mockFetch({'POST /post': {data: {}}});
        const api = new HttpbinApi({fetch: fetchImpl});

        await api.post({a: 1});

        assert.equal(only().headers['content-type'], 'application/json');
        assert.deepEqual(only().body, {a: 1});
    });


    test('an explicit content-type is not overwritten', async () => {
        const {fetchImpl, only} = mockFetch({'POST /post': {data: {}}});
        const api = new HttpbinApi({fetch: fetchImpl});

        await api.post({a: 1}, {headers: {'content-type': 'application/vnd.api+json'}});

        assert.equal(only().headers['content-type'], 'application/vnd.api+json');
    });


    /*
    A string is already something fetch can send, so it is not stringified
    again and gets no content-type -- the caller knows what it is, we do not.
    Deliberately not JSON-shaped: the mock parses a JSON string back for
    readable assertions, which would hide the passthrough.
    */
    test('a string body is passed through with no content-type added', async () => {
        const {fetchImpl, only} = mockFetch({'POST /post': {data: {}}});
        const api = new HttpbinApi({fetch: fetchImpl});

        await api.post('plain text');

        assert.equal(only().body, 'plain text');
        assert.equal(only().headers['content-type'], undefined);
    });


    test('a URLSearchParams body is passed through', async () => {
        const {fetchImpl, only} = mockFetch({'POST /post': {data: {}}});
        const api = new HttpbinApi({fetch: fetchImpl});

        await api.post(new URLSearchParams({a: '1'}));

        assert.ok(only().body instanceof URLSearchParams);
        assert.equal(only().headers['content-type'], undefined);
    });


    /* The case `isBodyInit` exists for: stringifying this gives "[object FormData]". */
    test('a FormData body is passed through', async () => {
        const {fetchImpl, only} = mockFetch({'POST /post': {data: {}}});
        const api = new HttpbinApi({fetch: fetchImpl});

        const form = new FormData();
        form.set('a', '1');

        await api.post(form);

        assert.ok(only().body instanceof FormData);
    });


    test('an ArrayBuffer view is passed through', async () => {
        const {fetchImpl, only} = mockFetch({'POST /post': {data: {}}});
        const api = new HttpbinApi({fetch: fetchImpl});

        await api.post(new Uint8Array([1, 2, 3]));

        assert.ok(only().body instanceof Uint8Array);
    });


    test('no body means no content-type and no body key at all', async () => {
        const {fetchImpl, only} = mockFetch({'GET /ip': {data: {origin: '1.1.1.1'}}});
        const api = new HttpbinApi({fetch: fetchImpl});

        await api.ip();

        assert.equal(only().body, undefined);
        assert.equal(only().headers['content-type'], undefined);
        assert.ok(!('body' in (only().init ?? {})));
    });
});
