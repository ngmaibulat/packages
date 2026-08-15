import {test, describe} from 'node:test';
import assert from 'node:assert/strict';

import {mergeHeaders} from '../../src/core/index.ts';

/*
`HeadersInit` has three forms and only one of them can be spread. Every merge
in the package goes through this function for that reason -- the clients that
hand-rolled it with `{...a, ...b}` silently dropped the other two forms.
*/

/* `Headers` has no deepEqual-able shape, so compare the entries. */
function entriesOf(headers: Headers): Record<string, string>
{
    const out: Record<string, string> = {};

    headers.forEach((value, key) => {
        out[key] = value;
    });

    return out;
}


describe('mergeHeaders', () => {

    test('merges the record form', () => {
        const merged = mergeHeaders({'X-One': '1'}, {'X-Two': '2'});

        assert.deepEqual(entriesOf(merged), {'x-one': '1', 'x-two': '2'});
    });


    test('merges a Headers instance', () => {
        const merged = mergeHeaders({'X-One': '1'}, new Headers({'X-Two': '2'}));

        assert.deepEqual(entriesOf(merged), {'x-one': '1', 'x-two': '2'});
    });


    test('merges an array of pairs', () => {
        const merged = mergeHeaders({'X-One': '1'}, [['x-two', '2']]);

        assert.deepEqual(entriesOf(merged), {'x-one': '1', 'x-two': '2'});
    });


    test('a later source wins', () => {
        const merged = mergeHeaders({'X-One': 'first'}, {'X-One': 'second'});

        assert.equal(merged.get('x-one'), 'second');
    });


    /* `Headers` normalises names, so the override does not depend on casing. */
    test('an override is case-insensitive', () => {
        const merged = mergeHeaders({'content-type': 'text/plain'}, {'Content-Type': 'application/json'});

        assert.deepEqual(entriesOf(merged), {'content-type': 'application/json'});
    });


    test('undefined sources are skipped', () => {
        const merged = mergeHeaders(undefined, {'X-One': '1'}, undefined);

        assert.deepEqual(entriesOf(merged), {'x-one': '1'});
    });


    test('no sources at all is an empty Headers', () => {
        assert.deepEqual(entriesOf(mergeHeaders()), {});
    });
});
