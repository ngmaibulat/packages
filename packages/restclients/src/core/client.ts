/*
The bit every client has in common: one `fetch` call, built from the client's
own defaults with the caller's options layered on top.

Kept as a base class rather than a factory so subclasses stay plain classes.
The seam the whole offline test suite hangs off is the `fetch` option
(`new JsonPlaceHolderApi({fetch: stub})`), which is also how a consumer adds
logging, retries or tracing: wrap `fetch` and pass the wrapper.
*/

import {cleanQuery} from './params.ts';
import type {Query} from './params.ts';
import {mergeHeaders} from './headers.ts';
import {HttpError} from './errors.ts';


/*
The native `Response`, with `json()` narrowed to the payload the endpoint
returns. There is no wrapper object at runtime -- this is the same `Response`
`fetch` handed back, so `res.ok`, `res.status`, `res.headers` and `res.text()`
are all the standard ones.
*/
interface TypedResponse<T> extends Response {
    json(): Promise<T>
}


interface ClientOptions extends Omit<RequestInit, 'method' | 'body' | 'signal'> {
    /* Point the client somewhere else -- a mock server, a self-hosted instance. */
    baseUrl?: string,
    /* Sent on every request, and overridable per call. */
    params?: Query,
    /* Milliseconds. Aborts with a `TimeoutError` DOMException. */
    timeout?: number,
    /* Which statuses resolve. The default is `res.ok`; everything else throws. */
    validateStatus?: (status: number) => boolean,
    /* The injection point: tests pass a stub, consumers pass a wrapper. */
    fetch?: typeof globalThis.fetch
}


/*
The per-call form: a `RequestInit` minus `method` and `body`, both of which
belong to the method rather than to its config. `method` was always forced and
silently ignored here, and a `body` used to reach fetch untouched -- which on
a GET is a hard `TypeError` out of fetch itself.

`signal` stays. A per-call abort is exactly what it is for, and it is composed
with `timeout` below.
*/
type RequestOptions = Omit<RequestInit, 'method' | 'body'> & {
    timeout?: number,
    /* Merged over the params the method built, so the caller always wins. */
    params?: Query,
    validateStatus?: (status: number) => boolean
};


interface ClientDefaults {
    baseUrl: string,
    /* Sent on every request unless the caller supplies the same header. */
    headers?: Record<string, string>
}


/* `baseUrl` is only a prefix; an absolute url replaces it outright. */
function isAbsolute(path: string): boolean
{
    return /^https?:\/\//i.test(path);
}


/*
Anything `fetch` can send as-is. Everything else is JSON.

Checked rather than assumed because a client method takes `body?: unknown` --
httpbin will happily echo a FormData, and stringifying it would produce
`"[object FormData]"`.
*/
function isBodyInit(value: unknown): value is BodyInit
{
    return typeof value === 'string'
        || value instanceof ArrayBuffer
        || ArrayBuffer.isView(value)
        || value instanceof Blob
        || value instanceof FormData
        || value instanceof URLSearchParams
        || value instanceof ReadableStream;
}


/*
One signal out of a timeout and whatever the caller passed.

`AbortSignal.timeout()` and `AbortSignal.any()` would do this in two lines,
but between them they raise the browser floor further than anything else here
does, so it is spelled out. The timer has to be cleared either way, or Node
holds the event loop open for the length of every timeout that never fired.

`release()` runs once the response arrives, so the timeout covers the request
and not the reading of the body. Consuming a stalled body is the caller's to
bound -- which for these APIs means a JSON payload that has already arrived.
*/
function composeSignal(timeout: number | undefined, caller: AbortSignal | null | undefined): {
    signal: AbortSignal | undefined,
    release: () => void
}
{
    if (timeout === undefined) {
        return {signal: caller ?? undefined, release: () => {}};
    }

    const controller = new AbortController();
    const timer = setTimeout(() => {
        controller.abort(new DOMException(`timeout of ${timeout}ms exceeded`, 'TimeoutError'));
    }, timeout);

    const forward = () => controller.abort(caller?.reason);

    caller?.addEventListener('abort', forward, {once: true});

    return {
        signal: controller.signal,
        release: () => {
            clearTimeout(timer);
            caller?.removeEventListener('abort', forward);
        }
    };
}


class BaseApi
{
    /* Where this client points. Read-only; pass `baseUrl` to move it. */
    readonly baseUrl: string;

    /*
    Sent on every request. Mutable on purpose -- dummyjson's `setToken()`
    writes the bearer token here after `login()` has returned it.
    */
    protected readonly defaultHeaders: Headers;

    protected readonly defaultParams: Record<string, string>;

    private readonly init: RequestInit;

    private readonly timeout: number | undefined;

    private readonly validateStatus: ((status: number) => boolean) | undefined;

    private readonly fetchImpl: typeof globalThis.fetch;

    constructor(defaults: ClientDefaults, options: ClientOptions = {})
    {
        const {baseUrl, headers, params, timeout, validateStatus, fetch, ...init} = options;

        /*
        A trailing slash is stripped so the concatenation in `request()` cannot
        produce `https://host//ip`. Paths are joined by concatenation on
        purpose -- `new URL(path, base)` drops worldbank's `/v2` -- so the base
        has to arrive already normalised, and this is the one place to do it.
        */
        this.baseUrl = (baseUrl ?? defaults.baseUrl).replace(/\/+$/, '');
        this.defaultParams = cleanQuery(params ?? {});
        this.init = init;
        this.timeout = timeout;
        this.validateStatus = validateStatus;

        /*
        Wrapped rather than stored bare: `globalThis.fetch` throws if it is
        called detached from its global.
        */
        this.fetchImpl = fetch ?? ((input, requestInit) => globalThis.fetch(input, requestInit));

        /*
        Caller headers are applied last, so an explicit header always wins
        over a client default -- including the api-key headers that reqres,
        github and dummyjson set for you.
        */
        this.defaultHeaders = mergeHeaders(defaults.headers, headers);
    }


    /*
    Named `httpGet`/`httpSend` rather than `get`/`send` because httpbin
    exposes its own public `get`, `post`, `put`, `patch` and `delete` -- the
    echo verbs are the whole point of that API -- and a subclass cannot
    redeclare a base member with a different signature.
    */
    protected httpGet<T>(path: string, params?: Query, options?: RequestOptions): Promise<TypedResponse<T>>
    {
        return this.request<T>('GET', path, params, undefined, options);
    }


    /* POST/PUT/PATCH/DELETE. None of the wrapped APIs send a body and a query at once. */
    protected httpSend<T>(method: string, path: string, body?: unknown, options?: RequestOptions): Promise<TypedResponse<T>>
    {
        return this.request<T>(method, path, undefined, body, options);
    }


    private async request<T>(
        method: string,
        path: string,
        params: Query | undefined,
        body: unknown,
        options?: RequestOptions
    ): Promise<TypedResponse<T>>
    {
        const {timeout, params: callerParams, validateStatus, headers, signal, ...rest} = options ?? {};

        const init: RequestInit = {...rest};

        /*
        `RequestOptions` excludes `method` and `body` -- both belong to the
        method rather than to its config -- but a plain-JS consumer can still
        pass them, and a caller `body` on a GET is a hard `TypeError` out of
        fetch. Deleted so the type and the runtime agree.
        */
        delete init.method;
        delete init.body;

        const url = new URL(isAbsolute(path) ? path : this.baseUrl + path);

        /* Client defaults first, then the method, then the caller. */
        const query = {
            ...this.defaultParams,
            ...cleanQuery(params ?? {}),
            ...cleanQuery(callerParams ?? {})
        };

        for (const [key, value] of Object.entries(query)) {
            url.searchParams.set(key, value);
        }

        const merged = mergeHeaders(this.defaultHeaders, headers);

        let payload: BodyInit | undefined = undefined;

        if (body !== undefined) {
            payload = isBodyInit(body) ? body : JSON.stringify(body);

            if (!isBodyInit(body) && !merged.has('content-type')) {
                merged.set('content-type', 'application/json');
            }
        }

        /*
        An already-aborted signal must not reach the network at all, which is
        what `fetch` would otherwise do before rejecting.
        */
        if (signal?.aborted) {
            throw signal.reason;
        }

        const composed = composeSignal(timeout ?? this.timeout, signal);

        let response: Response;

        try {
            response = await this.fetchImpl(url.href, {
                ...this.init,
                ...init,
                method,
                headers: merged,
                ...(payload === undefined ? {} : {body: payload}),
                ...(composed.signal === undefined ? {} : {signal: composed.signal})
            });
        }
        finally {
            composed.release();
        }

        const accept = validateStatus ?? this.validateStatus;
        const ok = accept ? accept(response.status) : response.ok;

        if (!ok) {
            throw new HttpError(response, url.href);
        }

        return response as TypedResponse<T>;
    }
}


export {BaseApi};
export type {ClientDefaults, ClientOptions, RequestOptions, TypedResponse};
