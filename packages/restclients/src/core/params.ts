/*
URL plumbing shared by every client.

Two rules, both of which the individual clients used to reimplement:

  - an argument that was not passed must produce no param at all, never
    `?_limit=undefined`;
  - an array value is comma-joined rather than repeated or bracketed, which is
    the only form Open-Meteo, dummyjson's `select` and the GitHub search
    endpoints accept.
*/

type QueryValue = string | number | boolean | Array<string | number>;

type Query = Record<string, QueryValue | undefined>;


/*
Drop the absent params and flatten the rest to strings, ready to be spread
into a `URLSearchParams`.

Only `undefined` counts as absent. `0`, `false` and `''` are real values and
are sent -- Open-Meteo's latitude 0 is why that has to be the general rule.

Returns a plain record rather than a `URLSearchParams` so the three layers
that contribute params -- client defaults, the method, the caller -- can be
merged by ordinary object spread.
*/
function cleanQuery(params: Query): Record<string, string>
{
    const clean: Record<string, string> = {};

    for (const [key, value] of Object.entries(params)) {
        if (value === undefined) {
            continue;
        }

        clean[key] = Array.isArray(value) ? value.join(',') : String(value);
    }

    return clean;
}


/*
One path segment, safe to interpolate.

`new URL()` already percent-encodes a space or a non-ASCII character, so those
were never the problem. `#`, `?` and `/` are: each is structural, so a segment
containing one silently truncates or reshapes the request rather than failing.
`getUser('a/b')` used to request `/users/a/b`.

Only string segments need this -- a number cannot contain any of them.
*/
function encodeSegment(value: string): string
{
    return encodeURIComponent(value);
}


export {cleanQuery, encodeSegment};
export type {Query, QueryValue};
