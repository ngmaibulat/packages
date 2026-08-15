import type {HttpbinEcho, HttpbinHeaders, HttpbinOrigin, HttpbinUserAgent} from './types.ts';
import type {HttpbinUuid, HttpbinAuth, HttpbinSlideshow} from './types.ts';
import {BaseApi, encodeSegment, mergeHeaders} from '../core/index.ts';
import type {Query, ClientOptions, RequestOptions} from '../core/index.ts';

/*
httpbin.org goes down from time to time. Postman Echo answers most of the same
routes, so the base URL is worth knowing:

    new HttpbinApi({baseUrl: 'https://postman-echo.com'})

A self-hosted instance (`docker run -p 80:80 kennethreitz/httpbin`) works the
same way and is the reliable option for CI.
*/
const baseUrl = 'https://httpbin.org';

class HttpbinApi extends BaseApi
{
    constructor(options: ClientOptions = {})
    {
        super({baseUrl}, options);
    }


    //Echo verbs - the response describes the request it just received

    async get(params?: Query, config?: RequestOptions)
    {
        const url = '/get';
        return this.httpGet<HttpbinEcho>(url, params ?? {}, config);
    }

    async post(body?: unknown, config?: RequestOptions)
    {
        const url = '/post';
        return this.httpSend<HttpbinEcho>('POST', url, body, config);
    }

    async put(body?: unknown, config?: RequestOptions)
    {
        const url = '/put';
        return this.httpSend<HttpbinEcho>('PUT', url, body, config);
    }

    async patch(body?: unknown, config?: RequestOptions)
    {
        const url = '/patch';
        return this.httpSend<HttpbinEcho>('PATCH', url, body, config);
    }

    async delete(config?: RequestOptions)
    {
        const url = '/delete';
        return this.httpSend<HttpbinEcho>('DELETE', url, undefined, config);
    }


    //Behaviour - the reason to reach for httpbin at all

    /*
    Answers with the status you ask for. Anything outside 2xx rejects with an
    HttpError, so this is the cheapest way to exercise error handling:

        await api.status(503);   // rejects
    */
    async status(code: number, config?: RequestOptions)
    {
        const url = `/status/${code}`;
        return this.httpGet<unknown>(url, undefined, config);
    }

    /* Holds the response for N seconds (httpbin caps it at 10). */
    async delay(seconds: number, config?: RequestOptions)
    {
        const url = `/delay/${seconds}`;
        return this.httpGet<HttpbinEcho>(url, undefined, config);
    }

    /* Follows N redirects before answering -- fetch follows them for you. */
    async redirect(times: number, config?: RequestOptions)
    {
        const url = `/redirect/${times}`;
        return this.httpGet<HttpbinEcho>(url, undefined, config);
    }

    async redirectTo(target: string, statusCode?: number, config?: RequestOptions)
    {
        const url = '/redirect-to';
        return this.httpGet<unknown>(url, {url: target, status_code: statusCode}, config);
    }


    //Request inspection

    async headers(config?: RequestOptions)
    {
        const url = '/headers';
        return this.httpGet<HttpbinHeaders>(url, undefined, config);
    }

    async ip(config?: RequestOptions)
    {
        const url = '/ip';
        return this.httpGet<HttpbinOrigin>(url, undefined, config);
    }

    async userAgent(config?: RequestOptions)
    {
        const url = '/user-agent';
        return this.httpGet<HttpbinUserAgent>(url, undefined, config);
    }


    //Auth - both reject with a 401 when the credentials do not match

    /*
    httpbin wants the credentials twice: in the path, so it knows what to
    accept, and as real basic auth. `fetch` has no `auth` option, so the
    header is built here.
    */
    async basicAuth(user: string, password: string, config?: RequestOptions)
    {
        const url = `/basic-auth/${encodeSegment(user)}/${encodeSegment(password)}`;
        const credentials = btoa(`${user}:${password}`);

        /*
        Merged through `mergeHeaders` rather than by object spread: a caller
        who passes a `Headers` instance or an array of pairs spreads to
        nothing, and their headers used to disappear here without a word.
        The built header goes first, so an explicit caller one still wins.
        */
        return this.httpGet<HttpbinAuth>(url, undefined, {
            ...config,
            headers: mergeHeaders({Authorization: `Basic ${credentials}`}, config?.headers)
        });
    }

    async bearer(token: string, config?: RequestOptions)
    {
        const url = '/bearer';
        return this.httpGet<HttpbinAuth>(url, undefined, {
            ...config,
            headers: mergeHeaders({Authorization: `Bearer ${token}`}, config?.headers)
        });
    }


    //Payloads

    async uuid(config?: RequestOptions)
    {
        const url = '/uuid';
        return this.httpGet<HttpbinUuid>(url, undefined, config);
    }

    async json(config?: RequestOptions)
    {
        const url = '/json';
        return this.httpGet<HttpbinSlideshow>(url, undefined, config);
    }

    async gzip(config?: RequestOptions)
    {
        const url = '/gzip';
        return this.httpGet<HttpbinEcho & {gzipped: boolean}>(url, undefined, config);
    }

    /* N random bytes. `await res.arrayBuffer()` if you want them raw. */
    async bytes(count: number, config?: RequestOptions)
    {
        const url = `/bytes/${count}`;
        return this.httpGet<unknown>(url, undefined, config);
    }

    /*
    Sets Cache-Control for N seconds. Called without an argument it answers
    304 to a conditional request, which is handy for testing ETag handling.
    */
    async cache(seconds?: number, config?: RequestOptions)
    {
        const url = seconds === undefined ? '/cache' : `/cache/${seconds}`;
        return this.httpGet<HttpbinEcho>(url, undefined, config);
    }

}

export {HttpbinApi, baseUrl}
