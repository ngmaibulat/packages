import {test, describe} from 'node:test';
import assert from 'node:assert/strict';

import {IpInfoApi, HttpError} from '../../src/ipinfo/index.ts';
import {mockFetch} from '../helpers/mock-fetch.ts';

const google = {
    ip: '8.8.8.8',
    hostname: 'dns.google',
    city: 'Mountain View',
    region: 'California',
    country: 'US',
    loc: '37.4056,-122.0775',
    org: 'AS15169 Google LLC',
    postal: '94043',
    timezone: 'America/Los_Angeles'
};


describe('ipinfo', () => {

    test('lookup() with no address asks about the caller', async () => {
        const {fetchImpl, only} = mockFetch({'GET /json': {data: google}});
        const api = new IpInfoApi({fetch: fetchImpl});

        await api.lookup();

        assert.equal(only().path, '/json');
    });


    test('lookup(ip) puts the address in the path', async () => {
        const {fetchImpl, only} = mockFetch({'GET /8.8.8.8/json': {data: google}});
        const api = new IpInfoApi({fetch: fetchImpl});

        const res = await api.lookup('8.8.8.8');
        const data = await res.json();

        assert.equal(only().path, '/8.8.8.8/json');
        assert.equal(data.org, 'AS15169 Google LLC');
    });


    /*
    A private address comes back with nothing but `ip` and `bogon`, which is
    why every geolocation field on IpInfo is optional.
    */
    test('a private address comes back as a bogon', async () => {
        const {fetchImpl} = mockFetch({'GET /192.168.0.1/json': {data: {ip: '192.168.0.1', bogon: true}}});
        const api = new IpInfoApi({fetch: fetchImpl});

        const res = await api.lookup('192.168.0.1');
        const data = await res.json();

        assert.equal(data.bogon, true);
        assert.equal(data.city, undefined);
    });


    /*
    The one method here that does not answer JSON. The mock replies with a
    real text/plain body, so `res.json()` fails in the test exactly the way it
    fails against ipinfo -- which the previous version of this test hid by
    JSON-encoding the string it was pretending was plain text.
    */
    test('field() fetches one value as text', async () => {
        const {fetchImpl, only} = mockFetch({'GET /8.8.8.8/country': {text: 'US\n'}});
        const api = new IpInfoApi({fetch: fetchImpl});

        const res = await api.field('8.8.8.8', 'country');

        assert.equal(only().path, '/8.8.8.8/country');
        assert.equal(await res.text(), 'US\n');
    });


    test('field() answers text that json() cannot parse', async () => {
        const {fetchImpl} = mockFetch({'GET /8.8.8.8/country': {text: 'US\n'}});
        const api = new IpInfoApi({fetch: fetchImpl});

        const res = await api.field('8.8.8.8', 'country');

        await assert.rejects(() => res.clone().json());
        assert.equal(await res.text(), 'US\n');
    });


    test('no Authorization header without a token', async () => {
        const {fetchImpl, only} = mockFetch({'GET /json': {data: google}});
        const api = new IpInfoApi({fetch: fetchImpl});

        await api.lookup();

        assert.equal(only().headers['authorization'], undefined);
    });


    test('a token becomes a bearer header', async () => {
        const {fetchImpl, only} = mockFetch({'GET /json': {data: google}});
        const api = new IpInfoApi({fetch: fetchImpl, token: 'tok_1'});

        await api.lookup();

        assert.equal(only().headers['authorization'], 'Bearer tok_1');
    });


    test('requests go to the ipinfo base URL', async () => {
        const {fetchImpl, only} = mockFetch({'GET /json': {data: google}});
        const api = new IpInfoApi({fetch: fetchImpl});

        await api.lookup();

        assert.equal(only().origin, 'https://ipinfo.io');
    });


    test('an exhausted quota surfaces as a 429', async () => {
        const {fetchImpl} = mockFetch({'GET /json': {status: 429, data: {}}});
        const api = new IpInfoApi({fetch: fetchImpl});

        const err = await api.lookup().then(
            () => assert.fail('expected the request to reject'),
            (e: unknown) => e
        );

        assert.ok(err instanceof HttpError);
        assert.equal(err.status, 429);
    });
});


/*
An IPv6 address is colons all the way down. They are legal in a path segment
but are encoded anyway, and ipinfo decodes them back -- checked against the
live API, which answers 200 for the encoded form.
*/
describe('ipinfo path encoding', () => {

    test('an IPv6 address survives the round trip', async () => {
        const address = '2001:4860:4860::8888';
        const {fetchImpl, only} = mockFetch({
            [`GET /${encodeURIComponent(address)}/json`]: {data: {ip: address}}
        });
        const api = new IpInfoApi({fetch: fetchImpl});

        await api.lookup(address);

        assert.equal(decodeURIComponent(only().url.pathname), `/${address}/json`);
    });


    test('an ordinary IPv4 address is not re-encoded', async () => {
        const {fetchImpl, only} = mockFetch({'GET /8.8.8.8/json': {data: google}});
        const api = new IpInfoApi({fetch: fetchImpl});

        await api.lookup('8.8.8.8');

        assert.equal(only().path, '/8.8.8.8/json');
    });
});
