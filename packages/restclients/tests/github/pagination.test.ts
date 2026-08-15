import {test, describe} from 'node:test';
import assert from 'node:assert/strict';

import {parseLink, linksOf, rateLimitOf} from '../../src/github/index.ts';

/*
Header strings taken from real GitHub responses. These two helpers are the
reason the github client exists rather than being another CRUD wrapper, so
they are tested directly rather than only through a request.
*/

const middlePage = '<https://api.github.com/repositories/1300192/issues?page=2>; rel="prev", '
    + '<https://api.github.com/repositories/1300192/issues?page=4>; rel="next", '
    + '<https://api.github.com/repositories/1300192/issues?page=515>; rel="last", '
    + '<https://api.github.com/repositories/1300192/issues?page=1>; rel="first"';


function response(headers: Record<string, string>): Response
{
    return new Response(null, {status: 200, statusText: '200', headers});
}


describe('parseLink', () => {

    test('reads all four relations from a middle page', () => {
        const links = parseLink(middlePage);

        assert.deepEqual(links, {
            prev: 'https://api.github.com/repositories/1300192/issues?page=2',
            next: 'https://api.github.com/repositories/1300192/issues?page=4',
            last: 'https://api.github.com/repositories/1300192/issues?page=515',
            first: 'https://api.github.com/repositories/1300192/issues?page=1'
        });
    });


    /*
    The case a `while (links.next)` loop depends on: GitHub drops next and
    last once you reach the final page.
    */
    test('the last page has no next', () => {
        const header = '<https://api.github.com/user/repos?page=1>; rel="first", '
            + '<https://api.github.com/user/repos?page=4>; rel="prev"';

        const links = parseLink(header);

        assert.equal(links.next, undefined);
        assert.equal(links.prev, 'https://api.github.com/user/repos?page=4');
    });


    test('a single-page result sends no header at all', () => {
        assert.deepEqual(parseLink(undefined), {});
        assert.deepEqual(parseLink(null), {});
        assert.deepEqual(parseLink(''), {});
    });


    test('percent-encoded commas survive', () => {
        const header = '<https://api.github.com/search/issues?q=repo%3Aa%2Cb&page=2>; rel="next"';

        assert.equal(parseLink(header).next, 'https://api.github.com/search/issues?q=repo%3Aa%2Cb&page=2');
    });


    /*
    The header is delimited by `<...>`, not by commas -- a url may hold one of
    its own. Splitting on commas cut these entries in half, the halves matched
    nothing, and the relation was dropped with no error at all: a
    `while (links.next)` loop simply stopped early on partial data.
    */
    test('a raw comma inside a link url does not split the header', () => {
        const header = '<https://api.github.com/repositories/1/issues?labels=bug,ui&page=2>; rel="next"';

        assert.equal(parseLink(header).next, 'https://api.github.com/repositories/1/issues?labels=bug,ui&page=2');
    });


    test('every relation survives when several urls contain commas', () => {
        const header = '<https://api.github.com/x?labels=a,b&page=2>; rel="next", '
            + '<https://api.github.com/x?labels=a,b&page=9>; rel="last"';

        assert.deepEqual(parseLink(header), {
            next: 'https://api.github.com/x?labels=a,b&page=2',
            last: 'https://api.github.com/x?labels=a,b&page=9'
        });
    });


    test('a rel parameter without quotes is still read', () => {
        const header = '<https://api.github.com/x>; rel=next';

        assert.deepEqual(parseLink(header), {next: 'https://api.github.com/x'});
    });


    /* RFC 8288 allows other parameters ahead of rel. */
    test('a parameter before rel does not hide it', () => {
        const header = '<https://api.github.com/x>; type="text/html"; rel="next"';

        assert.deepEqual(parseLink(header), {next: 'https://api.github.com/x'});
    });


    test('unknown relations are ignored', () => {
        const header = '<https://api.github.com/x>; rel="next", <https://api.github.com/y>; rel="alternate"';

        assert.deepEqual(parseLink(header), {next: 'https://api.github.com/x'});
    });


    test('a malformed segment does not take the rest down with it', () => {
        const header = 'garbage, <https://api.github.com/x>; rel="next"';

        assert.deepEqual(parseLink(header), {next: 'https://api.github.com/x'});
    });


    test('linksOf reads the header off a response', () => {
        const links = linksOf(response({link: middlePage}));

        assert.equal(links.next, 'https://api.github.com/repositories/1300192/issues?page=4');
    });


    test('linksOf on a response with no link header is empty', () => {
        assert.deepEqual(linksOf(response({})), {});
    });
});


describe('rateLimitOf', () => {

    test('reads the budget and converts reset to a Date', () => {
        const limit = rateLimitOf(response({
            'x-ratelimit-limit': '60',
            'x-ratelimit-remaining': '57',
            'x-ratelimit-used': '3',
            'x-ratelimit-reset': '1770000000'
        }));

        assert.equal(limit.limit, 60);
        assert.equal(limit.remaining, 57);
        assert.equal(limit.used, 3);
        assert.deepEqual(limit.reset, new Date(1770000000 * 1000));
    });


    test('a zero remaining is reported, not swallowed as absent', () => {
        const limit = rateLimitOf(response({'x-ratelimit-remaining': '0'}));

        assert.equal(limit.remaining, 0);
    });


    test('missing headers become undefined rather than NaN', () => {
        const limit = rateLimitOf(response({}));

        assert.deepEqual(limit, {
            limit: undefined,
            remaining: undefined,
            used: undefined,
            reset: undefined
        });
    });


    test('an unparseable header becomes undefined', () => {
        const limit = rateLimitOf(response({'x-ratelimit-limit': 'lots'}));

        assert.equal(limit.limit, undefined);
    });
});
