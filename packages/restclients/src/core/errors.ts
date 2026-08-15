/*
The one failure this package describes better than the platform does.

`fetch` resolves a 404 -- it only rejects when the request never got an answer
at all. Every client here throws instead, so a failed call is a rejected
promise the way it has always been.

Everything else is left alone on purpose: a transport failure is fetch's own
`TypeError`, and an abort is the standard `DOMException`. Wrapping those would
hide names the caller already knows.
*/

class HttpError extends Error
{
    /*
    The response, with its body still unread -- nothing here consumes it, so
    `await err.response.json()` is the way to the error payload.
    */
    readonly response: Response;

    readonly status: number;

    readonly statusText: string;

    readonly url: string;

    /*
    `response.url` is the redirect-resolved url and is preferred, but it is
    empty on any `Response` that was constructed rather than fetched -- which
    covers every mock and some non-native fetch implementations. The url the
    request was sent to is the fallback.
    */
    constructor(response: Response, requestUrl?: string)
    {
        super(`Request failed with status code ${response.status}`);

        this.name = 'HttpError';
        this.response = response;
        this.status = response.status;
        this.statusText = response.statusText;
        this.url = response.url || requestUrl || '';
    }
}


export {HttpError};
