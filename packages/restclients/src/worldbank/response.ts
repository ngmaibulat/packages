/*
Unwrapping the World Bank's tuple, and turning its silent failures loud.

An unknown country code does not produce a 404. It produces HTTP 200 with

    [{message: [{id: '120', key: 'Invalid value', value: '...'}]}]

which nothing rejects. Without these helpers, `body[1]` is `undefined` and the
mistake surfaces somewhere far away from its cause.

They take the parsed body rather than the response, so they stay synchronous
and pure now that reading the body is the caller's explicit step:

    rowsOf(await res.json())
*/

import type {WorldBankMeta, WorldBankPayload, WorldBankErrorBody} from './types.ts';


/*
Distinguish the error body from a successful tuple.

A success has metadata at [0] and an array at [1]; the error body has one
element whose `message` is an array.
*/
function isErrorBody(body: unknown): body is WorldBankErrorBody
{
    if (!Array.isArray(body) || body.length === 0) {
        return false;
    }

    const first: unknown = body[0];

    if (typeof first !== 'object' || first === null) {
        return false;
    }

    return Array.isArray((first as {message?: unknown}).message);
}


/* Join the API's message list into one line, for an exception or a log. */
function errorMessage(body: WorldBankErrorBody): string
{
    const messages = body[0].message.map((m) => `${m.key}: ${m.value}`);

    return messages.join('; ') || 'unknown World Bank error';
}


/*
A World Bank failure that arrived as an HTTP 200.

Separate from `HttpError` because nothing failed at the HTTP layer -- the
status really was 200 and `validateStatus` was right to accept it. The API
reports the problem in the body instead, and `messages` is that body's own
list, so a caller can read the codes rather than parse the message string.
*/
class WorldBankError extends Error
{
    readonly messages: WorldBankErrorBody[0]['message'];

    constructor(body: WorldBankErrorBody)
    {
        super(`World Bank API error -- ${errorMessage(body)}`);

        this.name = 'WorldBankError';
        this.messages = body[0].message;
    }
}


/*
The rows, or an exception.

    const res = await api.getCountries({region: 'LCN'});
    for (const country of rowsOf(await res.json())) { ... }

Throws when the API reported a problem in a 200, so a bad code fails where it
was made rather than as an undefined three frames later.
*/
function rowsOf<T>(body: WorldBankPayload<T>): Array<T>
{
    if (isErrorBody(body)) {
        throw new WorldBankError(body);
    }

    return body[1] ?? [];
}


/* The pagination block, or undefined if the body was an error body. */
function metaOf(body: WorldBankPayload<unknown>): WorldBankMeta | undefined
{
    return isErrorBody(body) ? undefined : body[0];
}


/*
Whether another page exists.

`page` and `pages` are numbers on some endpoints and strings on others, so
both are coerced before comparing.
*/
function hasMore(body: WorldBankPayload<unknown>): boolean
{
    const meta = metaOf(body);

    if (!meta) {
        return false;
    }

    return Number(meta.page) < Number(meta.pages);
}


export {isErrorBody, errorMessage, rowsOf, metaOf, hasMore, WorldBankError};
