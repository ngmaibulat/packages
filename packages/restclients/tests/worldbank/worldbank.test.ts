import {test, describe} from 'node:test';
import assert from 'node:assert/strict';

import {WorldBankApi, rowsOf, metaOf, hasMore, isErrorBody, errorMessage} from '../../src/worldbank/index.ts';
import {WorldBankError} from '../../src/worldbank/index.ts';
import {mockFetch} from '../helpers/mock-fetch.ts';

const peru = {
    id: 'PER',
    iso2Code: 'PE',
    name: 'Peru',
    region: {id: 'LCN', iso2code: 'ZJ', value: 'Latin America & Caribbean '},
    adminregion: {id: 'LAC', iso2code: 'XJ', value: 'Latin America & Caribbean (excluding high income)'},
    incomeLevel: {id: 'UMC', iso2code: 'XT', value: 'Upper middle income'},
    lendingType: {id: 'IBD', iso2code: 'XF', value: 'IBRD'},
    capitalCity: 'Lima',
    longitude: '-77.0465',
    latitude: '-12.0931'
};

const meta = {page: 1, pages: 1, per_page: 50, total: 1};

/* The API's actual failure shape: a 200 with this in place of the tuple. */
const errorBody = [{message: [{id: '120', key: 'Invalid value', value: 'The provided parameter value is not valid'}]}];


describe('worldbank requests', () => {

    /*
    The API answers in XML unless asked otherwise, on every endpoint. Sending
    format=json as an instance default is the only way no call can forget it.
    */
    test('format=json is sent on every request', async () => {
        const {fetchImpl, calls} = mockFetch({
            'GET /v2/country': {data: [meta, [peru]]},
            'GET /v2/country/PER': {data: [meta, [peru]]},
            'GET /v2/region': {data: [meta, []]}
        });
        const api = new WorldBankApi({fetch: fetchImpl});

        await api.getCountries();
        await api.getCountry('PER');
        await api.getRegions();

        for (const call of calls) {
            assert.equal(call.params['format'], 'json');
        }
    });


    test('paging options map to page and per_page', async () => {
        const {fetchImpl, only} = mockFetch({'GET /v2/country': {data: [meta, []]}});
        const api = new WorldBankApi({fetch: fetchImpl});

        await api.getCountries({page: 2, perPage: 300});

        assert.deepEqual(only().params, {format: 'json', page: '2', per_page: '300'});
    });


    test('classification filters are sent as named params', async () => {
        const {fetchImpl, only} = mockFetch({'GET /v2/country': {data: [meta, []]}});
        const api = new WorldBankApi({fetch: fetchImpl});

        await api.getCountries({region: 'LCN', incomeLevel: 'UMC', lendingType: 'IBD'});

        assert.deepEqual(only().params, {
            format: 'json',
            region: 'LCN',
            incomeLevel: 'UMC',
            lendingType: 'IBD'
        });
    });


    test('a caller can still override format', async () => {
        const {fetchImpl, only} = mockFetch({'GET /v2/country': {data: [meta, []]}});
        const api = new WorldBankApi({fetch: fetchImpl, params: {format: 'xml'}});

        await api.getCountries();

        assert.equal(only().params['format'], 'xml');
    });


    /*
    A code list is one path segment holding several codes, so the semicolons
    are structural and must not be encoded -- but each code around them still
    is. Encoding the whole string would send one nonsense code, `PER%3BCHL`.
    */
    test('a semicolon-joined code list keeps its separators', async () => {
        const {fetchImpl, only} = mockFetch({
            'GET /v2/country/PER;CHL/indicator/SP.POP.TOTL': {data: [{page: 1}, []]}
        });
        const api = new WorldBankApi({fetch: fetchImpl});

        await api.getCountryIndicator('PER;CHL', 'SP.POP.TOTL');

        assert.equal(only().path, '/v2/country/PER;CHL/indicator/SP.POP.TOTL');
    });


    /* An indicator id is dots and capitals -- encoding must not disturb it. */
    test('an ordinary indicator id is not re-encoded', async () => {
        const {fetchImpl, only} = mockFetch({'GET /v2/indicator/SP.POP.TOTL': {data: [{page: 1}, []]}});
        const api = new WorldBankApi({fetch: fetchImpl});

        await api.getIndicator('SP.POP.TOTL');

        assert.equal(only().path, '/v2/indicator/SP.POP.TOTL');
    });


    test('the indicator series path carries both code and indicator', async () => {
        const {fetchImpl, only} = mockFetch({
            'GET /v2/country/PER/indicator/SP.POP.TOTL': {data: [meta, []]}
        });
        const api = new WorldBankApi({fetch: fetchImpl});

        await api.getCountryIndicator('PER', 'SP.POP.TOTL', {date: '2000:2023', mrv: 5});

        assert.equal(only().path, '/v2/country/PER/indicator/SP.POP.TOTL');
        assert.deepEqual(only().params, {format: 'json', date: '2000:2023', mrv: '5'});
    });


    test('the classification endpoints hit their own paths', async () => {
        const {fetchImpl, calls} = mockFetch({
            'GET /v2/region': {data: [meta, []]},
            'GET /v2/incomeLevel': {data: [meta, []]},
            'GET /v2/lendingType': {data: [meta, []]},
            'GET /v2/source': {data: [meta, []]},
            'GET /v2/indicator': {data: [meta, []]}
        });
        const api = new WorldBankApi({fetch: fetchImpl});

        await api.getRegions();
        await api.getIncomeLevels();
        await api.getLendingTypes();
        await api.getSources();
        await api.getIndicators();

        assert.deepEqual(calls.map((c) => c.path), [
            '/v2/region', '/v2/incomeLevel', '/v2/lendingType', '/v2/source', '/v2/indicator'
        ]);
    });


    test('requests go to the world bank base URL', async () => {
        const {fetchImpl, only} = mockFetch({'GET /v2/country': {data: [meta, []]}});
        const api = new WorldBankApi({fetch: fetchImpl});

        await api.getCountries();

        assert.equal(only().url.href, 'https://api.worldbank.org/v2/country?format=json');
    });
});


describe('worldbank response helpers', () => {

    test('rowsOf unwraps the second element of the tuple', async () => {
        const {fetchImpl} = mockFetch({'GET /v2/country/PER': {data: [meta, [peru]]}});
        const api = new WorldBankApi({fetch: fetchImpl});

        const body = await (await api.getCountry('PER')).json();

        assert.deepEqual(rowsOf(body), [peru]);
        assert.equal(rowsOf(body)[0]?.capitalCity, 'Lima');
    });


    test('metaOf returns the pagination block', async () => {
        const {fetchImpl} = mockFetch({'GET /v2/country': {data: [{page: 2, pages: 6, per_page: 50, total: 296}, []]}});
        const api = new WorldBankApi({fetch: fetchImpl});

        const body = await (await api.getCountries()).json();

        assert.equal(metaOf(body)?.total, 296);
    });


    /*
    /region reports its numbers as strings and /country as numbers, so the
    page comparison has to coerce.
    */
    test('hasMore copes with the string-typed metadata some endpoints send', async () => {
        const {fetchImpl} = mockFetch({
            'GET /v2/region': {data: [{page: '1', pages: '22', per_page: '2', total: '43'}, []]},
            'GET /v2/country': {data: [{page: 6, pages: 6, per_page: 50, total: 296}, []]}
        });
        const api = new WorldBankApi({fetch: fetchImpl});

        assert.equal(hasMore(await (await api.getRegions()).json()), true);
        assert.equal(hasMore(await (await api.getCountries()).json()), false);
    });


    /*
    The reason these helpers exist. An unknown code is a 200, so nothing
    rejects -- the mistake would otherwise surface as an undefined far from
    where it was made.
    */
    test('an unknown code is a 200, not a rejection', async () => {
        const {fetchImpl} = mockFetch({'GET /v2/country/ZZZ': {status: 200, data: errorBody}});
        const api = new WorldBankApi({fetch: fetchImpl});

        const res = await api.getCountry('ZZZ');
        const data = await res.json();

        assert.equal(res.status, 200);
        assert.ok(isErrorBody(data));
    });


    test('rowsOf turns that silent failure into an exception', async () => {
        const {fetchImpl} = mockFetch({'GET /v2/country/ZZZ': {status: 200, data: errorBody}});
        const api = new WorldBankApi({fetch: fetchImpl});

        const body = await (await api.getCountry('ZZZ')).json();

        assert.throws(() => rowsOf(body), /Invalid value: The provided parameter value is not valid/);
    });


    /*
    The failure is discriminable without matching on the message: nothing went
    wrong at the HTTP layer, so it is not an `HttpError`, and a bare `Error`
    would leave string-matching as the only option.
    */
    test('rowsOf throws a WorldBankError carrying the API messages', async () => {
        const {fetchImpl} = mockFetch({'GET /v2/country/ZZZ': {data: errorBody}});
        const api = new WorldBankApi({fetch: fetchImpl});

        const body = await (await api.getCountry('ZZZ')).json();

        const err = (() => {
            try {
                rowsOf(body);
                return undefined;
            }
            catch (e: unknown) {
                return e;
            }
        })();

        assert.ok(err instanceof WorldBankError);
        assert.equal(err.name, 'WorldBankError');
        assert.equal(err.messages[0]?.key, 'Invalid value');
    });


    test('metaOf and hasMore are safe on an error body', async () => {
        const {fetchImpl} = mockFetch({'GET /v2/country/ZZZ': {data: errorBody}});
        const api = new WorldBankApi({fetch: fetchImpl});

        const body = await (await api.getCountry('ZZZ')).json();

        assert.equal(metaOf(body), undefined);
        assert.equal(hasMore(body), false);
    });


    test('isErrorBody does not mistake a real tuple for a failure', () => {
        assert.equal(isErrorBody([meta, [peru]]), false);
        assert.equal(isErrorBody([]), false);
        assert.equal(isErrorBody(null), false);
        assert.equal(isErrorBody({message: []}), false);
        assert.equal(isErrorBody(errorBody), true);
    });


    test('errorMessage joins every message the API sent', () => {
        const two = [{message: [
            {id: '120', key: 'Invalid value', value: 'bad code'},
            {id: '160', key: 'Bad date', value: 'bad range'}
        ]}] as const;

        assert.equal(errorMessage(two as never), 'Invalid value: bad code; Bad date: bad range');
    });


    test('rowsOf returns an empty array when the API sends no rows', async () => {
        const {fetchImpl} = mockFetch({'GET /v2/country': {data: [meta]}});
        const api = new WorldBankApi({fetch: fetchImpl});

        const body = await (await api.getCountries()).json();

        assert.deepEqual(rowsOf(body), []);
    });
});
