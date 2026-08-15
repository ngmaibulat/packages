import {test, describe} from 'node:test';
import assert from 'node:assert/strict';

import {GithubApi, HttpError, acceptHeader, apiVersion} from '../../src/github/index.ts';
import {rateLimitOf, linksOf} from '../../src/github/index.ts';
import type {GithubError} from '../../src/github/index.ts';
import {mockFetch} from '../helpers/mock-fetch.ts';


describe('github headers', () => {

    test('the media type and api version are sent on every request', async () => {
        const {fetchImpl, only} = mockFetch({'GET /users/octocat': {data: {login: 'octocat'}}});
        const api = new GithubApi({fetch: fetchImpl});

        await api.getUser('octocat');

        assert.equal(only().headers['accept'], acceptHeader);
        assert.equal(only().headers['x-github-api-version'], apiVersion);
    });


    test('no Authorization header without a token', async () => {
        const {fetchImpl, only} = mockFetch({'GET /users/octocat': {data: {}}});
        const api = new GithubApi({fetch: fetchImpl});

        await api.getUser('octocat');

        assert.equal(only().headers['authorization'], undefined);
    });


    test('a token becomes a bearer header', async () => {
        const {fetchImpl, only} = mockFetch({'GET /user': {data: {}}});
        const api = new GithubApi({fetch: fetchImpl, token: 'ghp_x'});

        await api.getAuthenticatedUser();

        assert.equal(only().headers['authorization'], 'Bearer ghp_x');
    });


    test('the api version can be overridden', async () => {
        const {fetchImpl, only} = mockFetch({'GET /users/octocat': {data: {}}});
        const api = new GithubApi({fetch: fetchImpl, version: '2021-01-01'});

        await api.getUser('octocat');

        assert.equal(only().headers['x-github-api-version'], '2021-01-01');
    });


    /*
    The raw media type is how you get a README as a file rather than as a
    base64 envelope -- so a per-request Accept has to beat the default.
    */
    test('a per-request Accept overrides the default media type', async () => {
        const {fetchImpl, only} = mockFetch({'GET /repos/a/b/readme': {data: '# Title'}});
        const api = new GithubApi({fetch: fetchImpl});

        await api.getReadme('a', 'b', {headers: {Accept: 'application/vnd.github.raw'}});

        assert.equal(only().headers['accept'], 'application/vnd.github.raw');
    });


    test('requests go to the github api base URL', async () => {
        const {fetchImpl, only} = mockFetch({'GET /users/octocat': {data: {}}});
        const api = new GithubApi({fetch: fetchImpl});

        await api.getUser('octocat');

        assert.equal(only().origin, 'https://api.github.com');
    });
});


describe('github endpoints', () => {

    test('list options map to per_page and page', async () => {
        const {fetchImpl, only} = mockFetch({'GET /users/octocat/repos': {data: []}});
        const api = new GithubApi({fetch: fetchImpl});

        await api.getUserRepos('octocat', {perPage: 100, page: 2, sort: 'pushed', direction: 'desc'});

        assert.deepEqual(only().params, {per_page: '100', page: '2', sort: 'pushed', direction: 'desc'});
    });


    test('no options means no params', async () => {
        const {fetchImpl, only} = mockFetch({'GET /users/octocat/repos': {data: []}});
        const api = new GithubApi({fetch: fetchImpl});

        await api.getUserRepos('octocat');

        assert.deepEqual(only().params, {});
    });


    test('issue labels are comma-joined when given as an array', async () => {
        const {fetchImpl, only} = mockFetch({'GET /repos/a/b/issues': {data: []}});
        const api = new GithubApi({fetch: fetchImpl});

        await api.getRepoIssues('a', 'b', {state: 'open', labels: ['bug', 'help wanted']});

        assert.deepEqual(only().params, {state: 'open', labels: 'bug,help wanted'});
    });


    test('search sends q alongside the paging options', async () => {
        const {fetchImpl, only} = mockFetch({
            'GET /search/repositories': {data: {total_count: 0, incomplete_results: false, items: []}}
        });
        const api = new GithubApi({fetch: fetchImpl});

        await api.searchRepositories('axios language:typescript', {perPage: 5});

        assert.deepEqual(only().params, {q: 'axios language:typescript', per_page: '5'});
    });


    test('repo paths interpolate owner and name', async () => {
        const {fetchImpl, calls} = mockFetch({
            'GET /repos/axios/axios': {data: {}},
            'GET /repos/axios/axios/commits': {data: []},
            'GET /repos/axios/axios/contributors': {data: []},
            'GET /repos/axios/axios/releases/latest': {data: {}},
            'GET /repos/axios/axios/issues/1': {data: {}}
        });
        const api = new GithubApi({fetch: fetchImpl});

        await api.getRepo('axios', 'axios');
        await api.getRepoCommits('axios', 'axios');
        await api.getRepoContributors('axios', 'axios');
        await api.getLatestRelease('axios', 'axios');
        await api.getIssue('axios', 'axios', 1);

        assert.deepEqual(calls.map((c) => c.path), [
            '/repos/axios/axios',
            '/repos/axios/axios/commits',
            '/repos/axios/axios/contributors',
            '/repos/axios/axios/releases/latest',
            '/repos/axios/axios/issues/1'
        ]);
    });


    test('getRateLimit reads the dedicated endpoint', async () => {
        const rate = {limit: 60, remaining: 59, reset: 1770000000, used: 1};
        const {fetchImpl, only} = mockFetch({
            'GET /rate_limit': {data: {resources: {core: rate}, rate}}
        });
        const api = new GithubApi({fetch: fetchImpl});

        const res = await api.getRateLimit();
        const data = await res.json();

        assert.equal(only().path, '/rate_limit');
        assert.equal(data.rate.remaining, 59);
    });
});


describe('github response headers', () => {

    /*
    Pagination and the rate-limit budget live in headers, which is exactly
    why every method returns the whole Response instead of just the body.
    */
    test('rateLimitOf works on a real client response', async () => {
        const {fetchImpl} = mockFetch({
            'GET /users/octocat': {
                data: {},
                headers: {'x-ratelimit-limit': '60', 'x-ratelimit-remaining': '58'}
            }
        });
        const api = new GithubApi({fetch: fetchImpl});

        const res = await api.getUser('octocat');

        assert.equal(rateLimitOf(res).remaining, 58);
    });


    test('linksOf works on a real client response', async () => {
        const {fetchImpl} = mockFetch({
            'GET /repos/a/b/issues': {
                data: [],
                headers: {link: '<https://api.github.com/repos/a/b/issues?page=2>; rel="next"'}
            }
        });
        const api = new GithubApi({fetch: fetchImpl});

        const res = await api.getRepoIssues('a', 'b');

        assert.equal(linksOf(res).next, 'https://api.github.com/repos/a/b/issues?page=2');
    });


    /*
    The absolute URL from `Link` has to go back through the client, or the
    token and the media-type headers are lost on every page but the first.
    */
    test('getPage follows an absolute URL and keeps the client headers', async () => {
        const {fetchImpl, only} = mockFetch({
            'GET /repos/a/b/issues': {data: []}
        });
        const api = new GithubApi({fetch: fetchImpl, token: 'ghp_x'});

        await api.getPage('https://api.github.com/repos/a/b/issues?page=2');

        assert.equal(only().url.href, 'https://api.github.com/repos/a/b/issues?page=2');
        assert.equal(only().headers['authorization'], 'Bearer ghp_x');
        assert.equal(only().headers['accept'], 'application/vnd.github+json');
    });
});


describe('github errors', () => {

    test('a 404 surfaces the GithubError body', async () => {
        const {fetchImpl} = mockFetch({
            'GET /users/nope': {status: 404, data: {message: 'Not Found', documentation_url: 'https://docs.github.com/rest'}}
        });
        const api = new GithubApi({fetch: fetchImpl});

        const err = await api.getUser('nope').then(
            () => assert.fail('expected the request to reject'),
            (e: unknown) => e
        );

        assert.ok(err instanceof HttpError);
        assert.equal(err.status, 404);
        assert.equal((await err.response.json() as GithubError).message, 'Not Found');
    });


    /*
    An exhausted budget is a 403 whose remaining is 0 -- which is how you tell
    it apart from a permissions failure.
    */
    test('an exhausted rate limit is a 403 with remaining 0', async () => {
        const {fetchImpl} = mockFetch({
            'GET /users/octocat': {
                status: 403,
                data: {message: 'API rate limit exceeded'},
                headers: {'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '1770000000'}
            }
        });
        const api = new GithubApi({fetch: fetchImpl});

        const err = await api.getUser('octocat').then(
            () => assert.fail('expected the request to reject'),
            (e: unknown) => e
        );

        assert.ok(err instanceof HttpError);
        assert.equal(err.status, 403);

        const limit = rateLimitOf(err.response);
        assert.equal(limit.remaining, 0);
        assert.deepEqual(limit.reset, new Date(1770000000 * 1000));
    });
});


/*
Path segments are interpolated from caller-supplied strings. `#`, `?` and `/`
are structural in a URL, so an unencoded one silently reshapes the request
rather than failing -- `getUser('a/b')` used to ask for `/users/a/b`.
*/
describe('github path encoding', () => {

    test('a slash in a username stays inside one segment', async () => {
        const {fetchImpl, only} = mockFetch({'GET /users/a%2Fb': {data: {}}});
        const api = new GithubApi({fetch: fetchImpl});

        await api.getUser('a/b');

        assert.equal(only().url.pathname, '/users/a%2Fb');
    });


    test('a hash in a repo name does not truncate the path', async () => {
        const {fetchImpl, only} = mockFetch({'GET /repos/o/r%23x': {data: {}}});
        const api = new GithubApi({fetch: fetchImpl});

        await api.getRepo('o', 'r#x');

        assert.equal(only().url.hash, '');
        assert.equal(only().url.pathname, '/repos/o/r%23x');
    });


    /* The common case has to stay byte-for-byte what it always was. */
    test('ordinary names are not re-encoded', async () => {
        const {fetchImpl, only} = mockFetch({'GET /repos/octocat/Hello-World.js': {data: {}}});
        const api = new GithubApi({fetch: fetchImpl});

        await api.getRepo('octocat', 'Hello-World.js');

        assert.equal(only().path, '/repos/octocat/Hello-World.js');
    });
});
