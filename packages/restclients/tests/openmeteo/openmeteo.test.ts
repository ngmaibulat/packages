import {test, describe} from 'node:test';
import assert from 'node:assert/strict';

import {OpenMeteoApi, HttpError, geocodingURL, archiveURL} from '../../src/openmeteo/index.ts';
import type {OpenMeteoError} from '../../src/openmeteo/index.ts';
import {mockFetch} from '../helpers/mock-fetch.ts';

const berlin = {
    latitude: 52.52,
    longitude: 13.41,
    generationtime_ms: 0.05,
    utc_offset_seconds: 0,
    timezone: 'GMT',
    timezone_abbreviation: 'GMT',
    elevation: 38
};


describe('open-meteo forecast', () => {

    test('coordinates are sent as params', async () => {
        const {fetchImpl, only} = mockFetch({'GET /v1/forecast': {data: berlin}});
        const api = new OpenMeteoApi({fetch: fetchImpl});

        await api.forecast({latitude: 52.52, longitude: 13.41});

        assert.equal(only().path, '/v1/forecast');
        assert.deepEqual(only().params, {latitude: '52.52', longitude: '13.41'});
    });


    /*
    The reason array-joining lives in the shared params helper: Open-Meteo
    rejects a repeated `hourly=a&hourly=b` outright.
    */
    test('variable arrays are comma-joined', async () => {
        const {fetchImpl, only} = mockFetch({'GET /v1/forecast': {data: berlin}});
        const api = new OpenMeteoApi({fetch: fetchImpl});

        await api.forecast({
            latitude: 52.52,
            longitude: 13.41,
            hourly: ['temperature_2m', 'wind_speed_10m', 'precipitation'],
            daily: ['sunrise', 'sunset']
        });

        assert.equal(only().params['hourly'], 'temperature_2m,wind_speed_10m,precipitation');
        assert.equal(only().params['daily'], 'sunrise,sunset');
    });


    test('a single variable can be given as a string', async () => {
        const {fetchImpl, only} = mockFetch({'GET /v1/forecast': {data: berlin}});
        const api = new OpenMeteoApi({fetch: fetchImpl});

        await api.forecast({latitude: 0, longitude: 0, hourly: 'temperature_2m'});

        assert.equal(only().params['hourly'], 'temperature_2m');
    });


    test('unset options add no params', async () => {
        const {fetchImpl, only} = mockFetch({'GET /v1/forecast': {data: berlin}});
        const api = new OpenMeteoApi({fetch: fetchImpl});

        await api.forecast({latitude: 0, longitude: 0, timezone: 'auto'});

        assert.deepEqual(only().params, {latitude: '0', longitude: '0', timezone: 'auto'});
    });


    /*
    Coordinate 0 is the Gulf of Guinea, not "no coordinate" -- a truthiness
    check on params would have dropped it.
    */
    test('a zero coordinate is still sent', async () => {
        const {fetchImpl, only} = mockFetch({'GET /v1/forecast': {data: berlin}});
        const api = new OpenMeteoApi({fetch: fetchImpl});

        await api.forecast({latitude: 0, longitude: 0});

        assert.deepEqual(only().params, {latitude: '0', longitude: '0'});
    });


    test('units and day counts pass through', async () => {
        const {fetchImpl, only} = mockFetch({'GET /v1/forecast': {data: berlin}});
        const api = new OpenMeteoApi({fetch: fetchImpl});

        await api.forecast({
            latitude: 1,
            longitude: 2,
            forecast_days: 3,
            past_days: 1,
            temperature_unit: 'fahrenheit',
            wind_speed_unit: 'mph'
        });

        assert.deepEqual(only().params, {
            latitude: '1',
            longitude: '2',
            forecast_days: '3',
            past_days: '1',
            temperature_unit: 'fahrenheit',
            wind_speed_unit: 'mph'
        });
    });


    test('the parallel-array response is passed through untouched', async () => {
        const body = {
            ...berlin,
            hourly: {time: ['2026-08-11T00:00'], temperature_2m: [17.4]},
            hourly_units: {time: 'iso8601', temperature_2m: '°C'}
        };
        const {fetchImpl} = mockFetch({'GET /v1/forecast': {data: body}});
        const api = new OpenMeteoApi({fetch: fetchImpl});

        const res = await api.forecast({latitude: 52.52, longitude: 13.41, hourly: 'temperature_2m'});
        const data = await res.json();

        assert.deepEqual(data.hourly?.time, ['2026-08-11T00:00']);
        assert.equal(data.hourly_units?.['temperature_2m'], '°C');
    });


    test('requests go to the open-meteo base URL', async () => {
        const {fetchImpl, only} = mockFetch({'GET /v1/forecast': {data: berlin}});
        const api = new OpenMeteoApi({fetch: fetchImpl});

        await api.forecast({latitude: 0, longitude: 0});

        assert.equal(only().url.origin, 'https://api.open-meteo.com');
    });


    test('a bad variable name is a 400 with a reason', async () => {
        const {fetchImpl} = mockFetch({
            'GET /v1/forecast': {status: 400, data: {error: true, reason: 'Cannot initialize WeatherVariable from invalid String value nonsense'}}
        });
        const api = new OpenMeteoApi({fetch: fetchImpl});

        const err = await api.forecast({latitude: 0, longitude: 0, hourly: 'nonsense'}).then(
            () => assert.fail('expected the request to reject'),
            (e: unknown) => e
        );

        assert.ok(err instanceof HttpError);
        assert.equal((await err.response.json() as OpenMeteoError).error, true);
    });
});


describe('open-meteo geocoding', () => {

    /*
    Geocoding is a different host, so the method passes an absolute URL,
    which replaces baseUrl rather than being appended to it.
    */
    test('geocode goes to the geocoding host, not the forecast one', async () => {
        const {fetchImpl, only} = mockFetch({[`GET ${geocodingURL}`]: {data: {generationtime_ms: 0.1}}});
        const api = new OpenMeteoApi({fetch: fetchImpl});

        await api.geocode('Berlin');

        assert.equal(only().url.origin + only().path, geocodingURL);
        assert.deepEqual(only().params, {name: 'Berlin'});
    });


    test('count and language are forwarded', async () => {
        const {fetchImpl, only} = mockFetch({[`GET ${geocodingURL}`]: {data: {generationtime_ms: 0.1}}});
        const api = new OpenMeteoApi({fetch: fetchImpl});

        await api.geocode('Berlin', {count: 5, language: 'de'});

        assert.deepEqual(only().params, {name: 'Berlin', count: '5', language: 'de'});
    });


    test('a miss has no results key at all', async () => {
        const {fetchImpl} = mockFetch({[`GET ${geocodingURL}`]: {data: {generationtime_ms: 0.1}}});
        const api = new OpenMeteoApi({fetch: fetchImpl});

        const res = await api.geocode('Zzzzz');
        const data = await res.json();

        assert.equal(data.results, undefined);
    });


    test('a hit carries coordinates ready for forecast()', async () => {
        const body = {
            results: [{id: 2950159, name: 'Berlin', latitude: 52.52437, longitude: 13.41053, country: 'Germany'}],
            generationtime_ms: 0.1
        };
        const {fetchImpl} = mockFetch({[`GET ${geocodingURL}`]: {data: body}});
        const api = new OpenMeteoApi({fetch: fetchImpl});

        const res = await api.geocode('Berlin');
        const data = await res.json();

        assert.equal(data.results?.[0]?.latitude, 52.52437);
    });
});


/*
The archive is the third host this one client spans. Nothing pins it to that
host but this: an absolute url replaces `baseUrl` outright, and a typo would
quietly send historical queries to the forecast endpoint instead.
*/
describe('open-meteo archive', () => {

    test('archive goes to the archive host, not the forecast one', async () => {
        const {fetchImpl, only} = mockFetch({[`GET ${archiveURL}`]: {data: berlin}});
        const api = new OpenMeteoApi({fetch: fetchImpl});

        await api.archive({
            latitude: 52.52,
            longitude: 13.41,
            start_date: '2020-01-01',
            end_date: '2020-01-31'
        });

        assert.equal(only().origin, 'https://archive-api.open-meteo.com');
        assert.equal(only().path, '/v1/archive');
    });


    test('archive forwards the date range', async () => {
        const {fetchImpl, only} = mockFetch({[`GET ${archiveURL}`]: {data: berlin}});
        const api = new OpenMeteoApi({fetch: fetchImpl});

        await api.archive({
            latitude: 52.52,
            longitude: 13.41,
            start_date: '2020-01-01',
            end_date: '2020-01-31',
            daily: ['temperature_2m_max', 'temperature_2m_min']
        });

        assert.deepEqual(only().params, {
            latitude: '52.52',
            longitude: '13.41',
            start_date: '2020-01-01',
            end_date: '2020-01-31',
            daily: 'temperature_2m_max,temperature_2m_min'
        });
    });
});
