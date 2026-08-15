/*
Header merging, in the one place that decides what "the caller wins" means.

`{...defaults, ...callerHeaders}` looks like it does this and does not:
`HeadersInit` is a `Headers`, an array of pairs *or* a record, and only the
record form has spreadable own keys. The other two spread to nothing, so the
caller's headers vanish without a word.
*/


/* Later sources win, header names compared case-insensitively. */
function mergeHeaders(...sources: Array<HeadersInit | undefined>): Headers
{
    const merged = new Headers();

    for (const source of sources) {
        if (source === undefined) {
            continue;
        }

        new Headers(source).forEach((value, key) => {
            merged.set(key, value);
        });
    }

    return merged;
}


export {mergeHeaders};
