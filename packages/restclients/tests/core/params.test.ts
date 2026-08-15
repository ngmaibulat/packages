import {test, describe} from 'node:test';
import assert from 'node:assert/strict';

import {cleanQuery} from '../../src/core/index.ts';

/*
`cleanQuery` is the one place that decides what "no argument" means, so it is
worth testing directly rather than only through a client.
*/

describe('cleanQuery', () => {

    test('drops undefined values', () => {
        assert.deepEqual(cleanQuery({page: 2, delay: undefined}), {page: '2'});
    });


    test('keeps an explicit 0, false and empty string', () => {
        assert.deepEqual(
            cleanQuery({limit: 0, verbose: false, q: ''}),
            {limit: '0', verbose: 'false', q: ''}
        );
    });


    test('returns an empty record when every value is absent', () => {
        assert.deepEqual(cleanQuery({page: undefined}), {});
    });


    test('comma-joins array values', () => {
        assert.deepEqual(
            cleanQuery({hourly: ['temperature_2m', 'wind_speed_10m']}),
            {hourly: 'temperature_2m,wind_speed_10m'}
        );
    });


    test('an empty array produces an empty value rather than being dropped', () => {
        assert.deepEqual(cleanQuery({hourly: []}), {hourly: ''});
    });


    test('the input is not mutated', () => {
        const query = {page: 1, delay: undefined};

        cleanQuery(query);

        assert.deepEqual(query, {page: 1, delay: undefined});
    });
});
