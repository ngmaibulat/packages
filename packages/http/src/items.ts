import { CliError, EXIT } from './errors.ts';

export type Item =
    /** `Name:value` -- a request header. `value: null` unsets a default header. */
    | { kind: 'header'; name: string; value: string | null }
    /** `name==value` -- a URL query parameter. */
    | { kind: 'query'; name: string; value: string }
    /** `name=value` -- a body field with a string value. */
    | { kind: 'field'; name: string; value: string }
    /** `name:=value` -- a body field with a raw JSON value. */
    | { kind: 'raw'; name: string; value: unknown }
    /** `name@path` -- a file upload; forces multipart. */
    | { kind: 'file'; name: string; path: string }
    /** `name=@path` -- a body field whose string value is read from a file. */
    | { kind: 'fieldFile'; name: string; path: string }
    /** `name:=@path` -- a body field whose JSON value is parsed from a file. */
    | { kind: 'rawFile'; name: string; path: string };

export type ItemKind = Item['kind'];

/**
 * Sorted longest-first so that the first separator matching at a given index is
 * necessarily the longest one matching there. Order within the array is load-bearing:
 * `:=@` must be tried before `:=`, `:=` before `:`, `==` before `=`, `=@` before `=`.
 */
const SEPARATORS = [':=@', '=@', '==', ':=', '=', '@', ':'] as const;

type Separator = (typeof SEPARATORS)[number];

/** Only these are meaningful after a backslash; every other `\x` is left alone so that
 *  Windows paths (`C:\tmp\x`) and JSON escapes (`"a\nb"`) survive intact. */
const ESCAPABLE = new Set([':', '=', '@', ';', '\\']);

function unescape(text: string): string {
    if (!text.includes('\\')) return text;

    let out = '';
    for (let i = 0; i < text.length; i++) {
        const ch = text[i] as string;
        const next = text[i + 1];

        if (ch === '\\' && next !== undefined && ESCAPABLE.has(next)) {
            out += next;
            i++;
        } else {
            out += ch;
        }
    }
    return out;
}

interface Split {
    key: string;
    separator: Separator;
    value: string;
}

/**
 * Find where the token splits: the earliest *unescaped* index at which any separator
 * matches wins, and at that index the longest separator wins.
 */
function split(token: string): Split | undefined {
    for (let i = 0; i < token.length; i++) {
        if (token[i] === '\\') {
            i++; // skip the escaped character so it can never be read as a separator
            continue;
        }

        for (const separator of SEPARATORS) {
            if (token.startsWith(separator, i)) {
                return {
                    key: token.slice(0, i),
                    separator,
                    value: token.slice(i + separator.length),
                };
            }
        }
    }

    return undefined;
}

function parseJsonValue(token: string, key: string, text: string, source: string): unknown {
    try {
        return JSON.parse(text) as unknown;
    } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        throw new CliError(EXIT.USAGE, `invalid JSON ${source} for '${key}': ${detail}`, `in item: ${token}`);
    }
}

/** Parse a single request-item token. Throws `CliError(EXIT.USAGE)` on anything malformed. */
export function parseItem(token: string): Item {
    const found = split(token);

    if (!found) {
        // `Header;` is HTTPie's way of sending a header with an empty value, as distinct
        // from `Header:` which removes a default header entirely.
        if (token.endsWith(';') && token.length > 1) {
            return { kind: 'header', name: unescape(token.slice(0, -1)), value: '' };
        }

        throw new CliError(
            EXIT.USAGE,
            `not a valid request item: ${token}`,
            'expected Header:value, param==value, field=value, field:=json, or field@file',
        );
    }

    const { separator, value } = found;
    const name = unescape(found.key);

    if (name === '') {
        throw new CliError(EXIT.USAGE, `request item has an empty name: ${token}`);
    }

    switch (separator) {
        case ':':
            // A bare `Header:` unsets whatever default we would otherwise send.
            return { kind: 'header', name, value: value === '' ? null : unescape(value) };
        case '==':
            return { kind: 'query', name, value: unescape(value) };
        case '=':
            return { kind: 'field', name, value: unescape(value) };
        case ':=':
            return { kind: 'raw', name, value: parseJsonValue(token, name, value, 'value') };
        case '@':
            return { kind: 'file', name, path: unescape(value) };
        case '=@':
            return { kind: 'fieldFile', name, path: unescape(value) };
        case ':=@':
            return { kind: 'rawFile', name, path: unescape(value) };
    }
}

export function parseItems(tokens: readonly string[]): Item[] {
    return tokens.map(parseItem);
}

/** True for items that contribute to the request body (as opposed to headers or the query string). */
export function isBodyItem(item: Item): boolean {
    return item.kind !== 'header' && item.kind !== 'query';
}
