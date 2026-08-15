/*
The two things GitHub puts in response headers rather than in the body.

Neither is in the body, which is why they are functions over the response
rather than another set of methods on the client.
*/

import type {PageLinks, RateLimit} from './types.ts';


/*
The `rel` out of one entry's parameter list.

Not folded into the entry pattern below because RFC 8288 allows other
parameters (`type`, `title`) before it, and GitHub is not the only thing that
sends a Link header at a proxy.
*/
const relParam = /rel\s*=\s*"?([^",;\s]+)"?/;


/*
Parse a `Link` header into its named relations.

    <https://api.github.com/repositories/1/issues?page=2>; rel="next",
    <https://api.github.com/repositories/1/issues?page=9>; rel="last"

GitHub omits the header entirely for a single-page result, and drops `next`
and `last` once you are on the final page -- so an absent key means "there is
no such page", and callers can loop with `while (links.next)`.

Unknown relations are kept out: only next/prev/first/last are typed, because
those are the four GitHub documents.
*/
function parseLink(header?: string | null): PageLinks
{
    const links: PageLinks = {};

    if (!header) {
        return links;
    }

    /*
    Scanned on the `<url>` delimiters rather than split on commas: a link url
    may contain a comma of its own (`?labels=bug,ui`), and splitting cut those
    entries in half. The halves matched nothing, the relation was dropped
    silently, and a `while (links.next)` loop stopped early with partial data
    and no error at all.
    */
    for (const entry of header.matchAll(/<([^>]*)>([^<]*)/g)) {
        const url = entry[1];
        const params = entry[2];

        if (url === undefined || params === undefined) {
            continue;
        }

        const rel = relParam.exec(params)?.[1];

        if (rel === 'next' || rel === 'prev' || rel === 'first' || rel === 'last') {
            links[rel] = url;
        }
    }

    return links;
}


/* Headers arrive as strings; anything unparseable becomes undefined. */
function toNumber(value: unknown): number | undefined
{
    if (value === undefined || value === null || value === '') {
        return undefined;
    }

    const parsed = Number(value);

    return Number.isNaN(parsed) ? undefined : parsed;
}


/*
Read the rate-limit budget off any response.

Every GitHub response carries these headers, so this costs nothing -- unlike
calling `/rate_limit`, which is free but is still a round trip.

`reset` is the moment the budget refills, converted from the unix seconds
GitHub sends. Each field is independently optional: a response that has been
through a proxy may have lost some of them.
*/
function rateLimitOf(response: Response): RateLimit
{
    const headers = response.headers;
    const reset = toNumber(headers.get('x-ratelimit-reset'));

    return {
        limit: toNumber(headers.get('x-ratelimit-limit')),
        remaining: toNumber(headers.get('x-ratelimit-remaining')),
        used: toNumber(headers.get('x-ratelimit-used')),
        reset: reset === undefined ? undefined : new Date(reset * 1000)
    };
}


/* Convenience for the common `while (links.next)` loop. */
function linksOf(response: Response): PageLinks
{
    return parseLink(response.headers.get('link'));
}


export {parseLink, linksOf, rateLimitOf};
