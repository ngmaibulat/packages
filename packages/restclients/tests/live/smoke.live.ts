/*
Live smoke tests. NOT part of `npm test` -- run them with `npm run test:live`.

The offline suite proves the client sends what it means to send. It cannot
prove the upstream API still answers with the shape we claim, and that is a
real risk here: every wrapped API is someone else's service, free, and free to
change. These tests are the only thing that notices when a field is renamed or
an endpoint starts 400ing.

They are deliberately shallow -- one call per client, asserting the handful of
fields the types promise. They need network, they are slow, and they will fail
for reasons that are nobody's fault (an API being down is not a bug in this
package), which is exactly why they are opt-in and why the nightly CI job that
runs them is allowed to fail without blocking anything.

reqres is absent on purpose: its demo key is rotated and throttled upstream, so
a live 401 there would say nothing about this code.

Set GITHUB_TOKEN to raise the github rate limit from 60/hr to 5000/hr, and
HTTPBIN_BASE_URL to point the httpbin tests somewhere that is actually up.
*/

import {test, describe} from 'node:test';
import assert from 'node:assert/strict';

import {JsonPlaceHolderApi} from '../../src/jsonplaceholder/index.ts';
import {DummyJsonApi} from '../../src/dummyjson/index.ts';
import {GithubApi, rateLimitOf, linksOf} from '../../src/github/index.ts';
import {HttpbinApi, HttpError} from '../../src/httpbin/index.ts';
import {IpInfoApi} from '../../src/ipinfo/index.ts';
import {OpenMeteoApi} from '../../src/openmeteo/index.ts';
import {WorldBankApi, rowsOf, metaOf} from '../../src/worldbank/index.ts';

/* Every live call gets the same budget; a slow API is not a failing one. */
const timeout = 15000;


describe('live: jsonplaceholder', () => {

    test('getPosts respects _limit and returns real posts', async () => {
        const api = new JsonPlaceHolderApi({timeout});

        const res = await api.getPosts({limit: 3});
        const data = await res.json();

        assert.equal(res.status, 200);
        assert.equal(data.length, 3);
        assert.equal(typeof data[0]?.title, 'string');
        assert.equal(typeof data[0]?.userId, 'number');
    });


    test('a nested route returns the child collection', async () => {
        const api = new JsonPlaceHolderApi({timeout});

        const res = await api.getPostComments(1);
        const data = await res.json();

        assert.ok(data.length > 0);
        assert.equal(data[0]?.postId, 1);
        assert.equal(typeof data[0]?.email, 'string');
    });
});


describe('live: dummyjson', () => {

    test('the list envelope names its array after the resource', async () => {
        const api = new DummyJsonApi({timeout});

        const res = await api.getProducts({limit: 2, select: ['title', 'price']});
        const data = await res.json();

        assert.equal(data.products.length, 2);
        assert.equal(typeof data.total, 'number');
        assert.equal(typeof data.products[0]?.title, 'string');
    });


    /*
    The token flow is the part most likely to drift, and the part the offline
    tests can only assert the shape of.
    */
    test('login mints a token that authenticates me()', async () => {
        const api = new DummyJsonApi({timeout});

        const tokens = await (await api.login({username: 'emilys', password: 'emilyspass'})).json();

        assert.equal(typeof tokens.accessToken, 'string');
        assert.equal(typeof tokens.refreshToken, 'string');

        api.setToken(tokens.accessToken);
        const me = await (await api.me()).json();

        assert.equal(me.username, 'emilys');
    });
});


describe('live: github', () => {

    const token = process.env['GITHUB_TOKEN'];

    test('rate limit headers are present and parse', async () => {
        const api = new GithubApi({timeout, token});

        const res = await api.getRateLimit();
        const data = await res.json();
        const budget = rateLimitOf(res);

        assert.equal(typeof data.rate.limit, 'number');
        assert.equal(typeof budget.remaining, 'number');
        assert.ok(budget.reset instanceof Date);
    });


    test('a paginated request carries a parseable Link header', async () => {
        const api = new GithubApi({timeout, token});

        const res = await api.getRepoIssues('axios', 'axios', {state: 'all', perPage: 2});
        const data = await res.json();
        const links = linksOf(res);

        assert.equal(data.length, 2);
        assert.equal(typeof data[0]?.number, 'number');
        /* Two issues out of thousands: there is always a next page. */
        assert.ok(links.next, 'expected a next link on a 2-per-page request');
    });


    test('a repo has the fields the type promises', async () => {
        const api = new GithubApi({timeout, token});

        const res = await api.getRepo('axios', 'axios');
        const data = await res.json();

        assert.equal(data.full_name, 'axios/axios');
        assert.equal(typeof data.stargazers_count, 'number');
        assert.equal(typeof data.default_branch, 'string');
    });
});


describe('live: httpbin', () => {

    /*
    httpbin.org goes down for days at a time. Point the tests at Postman Echo
    or at a local container to keep them meaningful:

        HTTPBIN_BASE_URL=https://postman-echo.com npm run test:live
    */
    const httpbinUrl = process.env['HTTPBIN_BASE_URL'] ?? 'https://httpbin.org';

    /*
    The statuses an outage speaks in. httpbin's load balancer answers all of
    these itself while the app behind it is gone, so a 503 here says nothing
    about the API's shape -- observed on 2026-08-12, when every route came back
    `503 Service Temporarily Unavailable` from `server: awselb/2.0`.

    That case matters beyond wasted time: `status(503)` would have *passed*
    against the load balancer's own 503, which is a green for the wrong reason.
    */
    const unavailable = new Set([429, 502, 503, 504]);

    /*
    Resolves to a skip reason when the host is not answering, and to undefined
    when it is. Down means a transport failure, an elapsed timeout, or one of
    the statuses above -- nobody's fault, and nothing this suite can say
    anything about, so the tests below are skipped rather than failed. Any
    other answer is a real one, and they run and fail on their own terms.

    `/get` is the probe because it is the route the tests use; `/status/200`
    would be cheaper but is served by the same dead app.

    Memoised: one probe covers both tests, so an outage costs one timeout
    instead of one per test.
    */
    let probe: Promise<string | undefined> | undefined;

    function httpbinDown()
    {
        probe ??= new HttpbinApi({baseUrl: httpbinUrl, timeout: 5000}).get().then(
            () => undefined,
            (e: unknown) => {
                if (e instanceof HttpError && !unavailable.has(e.status)) {
                    return undefined;
                }

                const detail = e instanceof HttpError ? `HTTP ${e.status}` : (e as Error).name;

                return `${httpbinUrl} is not answering (${detail})`;
            }
        );

        return probe;
    }


    test('get() echoes the params back', async (t) => {
        const reason = await httpbinDown();
        if (reason) return t.skip(reason);

        const api = new HttpbinApi({timeout, baseUrl: httpbinUrl});

        const res = await api.get({a: '1', b: 'two'});
        const data = await res.json();

        assert.deepEqual(data.args, {a: '1', b: 'two'});
    });


    test('a requested status is a real rejection', async (t) => {
        const reason = await httpbinDown();
        if (reason) return t.skip(reason);

        const api = new HttpbinApi({timeout, baseUrl: httpbinUrl});

        const err = await api.status(503).then(
            () => assert.fail('expected the request to reject'),
            (e: unknown) => e
        );

        assert.equal((err as {response?: {status?: number}}).response?.status, 503);
    });
});


describe('live: ipinfo', () => {

    test('a public address resolves to a location', async () => {
        const api = new IpInfoApi({timeout, token: process.env['IPINFO_TOKEN']});

        const res = await api.lookup('8.8.8.8');
        const data = await res.json();

        assert.equal(data.ip, '8.8.8.8');
        assert.equal(typeof data.country, 'string');
        /* loc has always been "lat,lng" in one string. */
        assert.match(String(data.loc), /^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/);
    });
});


describe('live: open-meteo', () => {

    /*
    The one that proves comma-joining: a bracketed array would come back 400.
    */
    test('a multi-variable forecast returns one array per variable', async () => {
        const api = new OpenMeteoApi({timeout});

        const res = await api.forecast({
            latitude: 52.52,
            longitude: 13.41,
            hourly: ['temperature_2m', 'wind_speed_10m'],
            forecast_days: 1,
            timezone: 'auto'
        });
        const data = await res.json();

        const hourly = data.hourly;

        assert.ok(hourly, 'expected an hourly block');
        assert.equal(hourly.time.length, 24);
        assert.equal(hourly['temperature_2m']?.length, 24);
        assert.equal(hourly['wind_speed_10m']?.length, 24);
    });


    test('geocoding reaches its own host and returns coordinates', async () => {
        const api = new OpenMeteoApi({timeout});

        const res = await api.geocode('Berlin', {count: 1});
        const data = await res.json();

        assert.equal(data.results?.[0]?.name, 'Berlin');
        assert.equal(typeof data.results?.[0]?.latitude, 'number');
    });
});


describe('live: world bank', () => {

    test('the country list arrives as a [meta, rows] tuple', async () => {
        const api = new WorldBankApi({timeout});

        const body = await (await api.getCountries({perPage: 300})).json();
        const rows = rowsOf(body);

        assert.ok(rows.length > 200, `expected 200+ rows, got ${rows.length}`);
        assert.equal(typeof metaOf(body)?.total, 'number');
        assert.equal(typeof rows[0]?.iso2Code, 'string');
    });


    test('a country lookup carries the fields the type promises', async () => {
        const api = new WorldBankApi({timeout});

        const [peru] = rowsOf(await (await api.getCountry('PER')).json());

        assert.equal(peru?.name, 'Peru');
        assert.equal(peru?.capitalCity, 'Lima');
        assert.equal(peru?.region.id, 'LCN');
    });


    /*
    The behaviour the response helpers exist for: an unknown code is answered
    with HTTP 200 and an error body, so nothing rejects on its own.
    */
    test('an unknown code is a 200 that rowsOf turns into a throw', async () => {
        const api = new WorldBankApi({timeout});

        const res = await api.getCountry('ZZZ');
        const body = await res.json();

        assert.equal(res.status, 200);
        assert.throws(() => rowsOf(body), /World Bank API error/);
    });


    test('an indicator series returns observations newest first', async () => {
        const api = new WorldBankApi({timeout});

        const res = await api.getCountryIndicator('PER', 'SP.POP.TOTL', {date: '2020:2023'});
        const rows = rowsOf(await res.json());

        assert.ok(rows.length >= 4, `expected 4 years, got ${rows.length}`);
        assert.equal(rows[0]?.indicator.id, 'SP.POP.TOTL');
        assert.equal(rows[0]?.countryiso3code, 'PER');
        assert.ok(Number(rows[0]?.date) > Number(rows[1]?.date), 'expected newest first');
    });
});
