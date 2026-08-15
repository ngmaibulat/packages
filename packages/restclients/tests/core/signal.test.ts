import {test, describe} from 'node:test';
import assert from 'node:assert/strict';

import {JsonPlaceHolderApi} from '../../src/jsonplaceholder/index.ts';
import {mockFetch} from '../helpers/mock-fetch.ts';

/*
The abort plumbing: a caller signal, a timeout, or both composed into one.

A timeout means the client builds its own controller and forwards the
caller's abort into it, so the two have to be tested together and not just
separately -- forwarding is the part that decides whether the caller's own
reason survives or gets replaced by a TimeoutError.

The timer also has to be cleared once the request settles, or Node holds the
event loop open for the full length of every timeout that never fired.
*/

/* A fetch that never settles until the signal it was handed aborts. */
function hangingFetch(seen: Array<RequestInit | undefined>): typeof globalThis.fetch
{
    return (_input, init) => new Promise((_resolve, reject) => {
        seen.push(init);
        init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), {once: true});
    });
}


describe('abort signals', () => {

    test('a caller signal reaches the transport', async () => {
        const {fetchImpl, only} = mockFetch({'GET /posts': {data: []}});
        const api = new JsonPlaceHolderApi({fetch: fetchImpl});

        const controller = new AbortController();

        await api.getPosts(undefined, {signal: controller.signal});

        assert.ok(only().init?.signal instanceof AbortSignal);
        assert.equal(only().init?.signal?.aborted, false);
    });


    test('a mid-flight abort reaches the transport signal', async () => {
        const seen: Array<RequestInit | undefined> = [];
        const api = new JsonPlaceHolderApi({fetch: hangingFetch(seen)});

        const controller = new AbortController();
        const pending = api.getPosts(undefined, {signal: controller.signal});

        controller.abort();

        await assert.rejects(() => pending);
        assert.equal(seen[0]?.signal?.aborted, true);
    });


    /*
    With a timeout in play the client aborts a controller of its own, so the
    caller's reason has to be forwarded rather than replaced. Without the
    forwarding this rejects with a TimeoutError -- or, since the timeout here
    is far longer than the test, never settles at all.
    */
    test('the caller reason survives the timeout composition', async () => {
        const seen: Array<RequestInit | undefined> = [];
        const api = new JsonPlaceHolderApi({fetch: hangingFetch(seen), timeout: 60_000});

        const controller = new AbortController();
        const pending = api.getPosts(undefined, {signal: controller.signal});

        const reason = new Error('mine');
        controller.abort(reason);

        const err = await pending.then(
            () => assert.fail('expected the request to reject'),
            (e: unknown) => e
        );

        assert.equal(err, reason);
    });


    test('a timeout with no caller signal aborts with a TimeoutError', async () => {
        const seen: Array<RequestInit | undefined> = [];
        const api = new JsonPlaceHolderApi({fetch: hangingFetch(seen), timeout: 5});

        const err = await api.getPosts().then(
            () => assert.fail('expected the request to reject'),
            (e: unknown) => e
        );

        assert.equal((err as DOMException).name, 'TimeoutError');
    });
});


/*
`release()` clears the timer once the response arrives. Asserted through the
event loop's own resource list rather than by waiting, so a leak fails the
test immediately instead of stalling the suite for the length of the timeout.
*/
describe('timeout cleanup', () => {

    test('the timeout timer is cleared once the response arrives', async () => {
        const {fetchImpl} = mockFetch({'GET /posts': {data: []}});
        const api = new JsonPlaceHolderApi({fetch: fetchImpl, timeout: 60_000});

        await api.getPosts();

        assert.ok(!process.getActiveResourcesInfo().includes('Timeout'));
    });


    test('the timeout timer is cleared when the request fails', async () => {
        const {fetchImpl} = mockFetch({'GET /posts': {networkError: 'down'}});
        const api = new JsonPlaceHolderApi({fetch: fetchImpl, timeout: 60_000});

        await assert.rejects(() => api.getPosts());

        assert.ok(!process.getActiveResourcesInfo().includes('Timeout'));
    });
});
