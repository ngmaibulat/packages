/*
A tiny `fetch` that answers from a route table and records every request.

Tests run fully offline: no network, no extra dependency. This sits where the
real fetch would, so the url has been joined, the params serialised, the
headers merged and the body encoded by the time we see it -- which is exactly
what we want to assert on.

    const {fetchImpl, calls} = mockFetch({
        'GET /posts': {data: [{id: 1}]}
    });
    const api = new JsonPlaceHolderApi({fetch: fetchImpl});

Replies are real `Response` objects, so the client's own "non-2xx throws"
path runs for real rather than being simulated here.
*/

interface MockReply {
    status?: number,
    data?: unknown,
    /*
    A plain-text body, for the endpoints that do not answer JSON at all --
    ipinfo's `field()` replies `US\n`. Wins over `data`, and defaults the
    content-type to text/plain instead of application/json.
    */
    text?: string,
    headers?: Record<string, string>,
    /* Simulate a transport failure (no HTTP response at all). */
    networkError?: string
}

interface RecordedCall {
    /* `GET /posts` -- the key this call was matched on. */
    route: string,
    method: string,
    url: URL,
    /* Path only, with the baseUrl's own prefix included. */
    path: string,
    origin: string,
    /* Query params as sent. Every value is a string: they went through a URL. */
    params: Record<string, string>,
    /* Header names are lowercase -- `Headers` normalises them. */
    headers: Record<string, string>,
    body: unknown,
    /*
    The raw init as the transport saw it. Everything else here is the
    interpreted form; this is what catches a key that should never have
    reached `fetch` at all -- a credential option, or a caller `body` on a GET.
    */
    init: RequestInit | undefined
}

type Routes = Record<string, MockReply>;

interface MockFetch {
    fetchImpl: typeof globalThis.fetch,
    calls: Array<RecordedCall>,
    /* The single call made so far -- fails loudly if there was not exactly one. */
    only(): RecordedCall
}


/*
A JSON body was stringified before it got here, so parse it back for readable
assertions. Anything else is handed over as-is.
*/
function parseBody(body: BodyInit | null | undefined): unknown
{
    if (body === null || body === undefined) {
        return undefined;
    }

    if (typeof body !== 'string') {
        return body;
    }

    try {
        return JSON.parse(body);
    }
    catch {
        return body;
    }
}


function record(url: URL, init: RequestInit | undefined): Omit<RecordedCall, 'route'>
{
    const params: Record<string, string> = {};

    for (const [key, value] of url.searchParams) {
        params[key] = value;
    }

    const headers: Record<string, string> = {};

    new Headers(init?.headers).forEach((value, key) => {
        headers[key] = value;
    });

    return {
        method: (init?.method ?? 'GET').toUpperCase(),
        url,
        path: url.pathname,
        origin: url.origin,
        params,
        headers,
        body: parseBody(init?.body),
        init
    };
}


function mockFetch(routes: Routes): MockFetch
{
    const calls: Array<RecordedCall> = [];

    const fetchImpl: typeof globalThis.fetch = async (input, init) => {
        const url = new URL(String(input));
        const call = record(url, init);

        /*
        Matched on the path alone, which is the readable form. A cross-host
        client -- openmeteo spans three of them -- can key on the origin too
        when the path by itself would be ambiguous.
        */
        const byPath = `${call.method} ${call.path}`;
        const byOrigin = `${call.method} ${call.origin}${call.path}`;

        const route = routes[byOrigin] !== undefined ? byOrigin : byPath;
        const reply = routes[route];

        calls.push({...call, route});

        if (!reply) {
            const known = Object.keys(routes).join(', ') || '(none)';
            throw new Error(
                `mockFetch: no route for "${byPath}". Known routes: ${known}`
            );
        }

        if (reply.networkError) {
            /* What fetch itself throws when the request never got an answer. */
            throw new TypeError(`fetch failed: ${reply.networkError}`);
        }

        const status = reply.status ?? 200;
        const headers = new Headers(reply.headers ?? {});

        if (!headers.has('content-type')) {
            headers.set('content-type', reply.text === undefined ? 'application/json' : 'text/plain');
        }

        const payload = reply.text === undefined ? JSON.stringify(reply.data ?? null) : reply.text;

        /* 204 and 304 are the two statuses a Response may not carry a body for. */
        const body = status === 204 || status === 304 ? null : payload;

        return new Response(body, {status, statusText: String(status), headers});
    };

    const only = () => {
        if (calls.length !== 1) {
            throw new Error(`mockFetch: expected exactly 1 call, got ${calls.length}`);
        }
        return calls[0] as RecordedCall;
    };

    return {fetchImpl, calls, only};
}


export {mockFetch};
export type {MockReply, RecordedCall, MockFetch};
