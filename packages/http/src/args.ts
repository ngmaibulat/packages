import { parseArgs } from 'node:util';

import { CliError, EXIT } from './errors.ts';
import { toParseArgsOptions } from './flags.ts';
import { isBodyItem, parseItems, type Item } from './items.ts';

export type PrettyMode = 'all' | 'colors' | 'format' | 'none';

export interface PrintSet {
    reqHeaders: boolean;
    reqBody: boolean;
    resHeaders: boolean;
    resBody: boolean;
    meta: boolean;
}

export interface ResolvedFlags {
    json: boolean;
    form: boolean;
    multipart: boolean;
    raw: string | undefined;
    file: string | undefined;
    auth: string | undefined;
    bearer: string | undefined;
    print: PrintSet;
    output: string | undefined;
    download: boolean;
    pretty: PrettyMode | undefined;
    follow: boolean;
    maxRedirects: number;
    timeout: number | undefined;
    insecure: boolean;
    checkStatus: boolean;
    offline: boolean;
    verbose: boolean;
}

export interface Options {
    method: string;
    url: URL;
    items: Item[];
    flags: ResolvedFlags;
    /** The bin name the user actually typed, used to prefix error messages. */
    invokedAs: string;
    /** Set when the deprecated `-u/--url` form was used. */
    deprecation: string | undefined;
}

export interface ParseContext {
    invokedAs: string;
    /** Set for the per-method shortcut bins; undefined for the `httpc` umbrella. */
    fixedMethod?: string | undefined;
    stdoutIsTTY: boolean;
    stdinIsTTY: boolean;
    /**
     * Whether piped stdin actually carries bytes. Used only to infer the method for the
     * `httpc` umbrella -- "stdin is not a TTY" is far too broad on its own, since that is
     * true of every script, cron job, and CI step regardless of whether anything was piped in.
     */
    stdinHasData?: boolean;
}

export interface HelpRequest {
    kind: 'help' | 'version';
    invokedAs: string;
    fixedMethod: string | undefined;
}

export type ParseResult = { kind: 'run'; options: Options } | HelpRequest;

/** Methods that must never carry a body -- `fetch` throws outright for these. */
const BODYLESS = new Set(['GET', 'HEAD']);

/** Safe methods, for which redirects need no method rewriting on 307/308. */
export const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS', 'QUERY', 'SEARCH', 'TRACE']);

const DEFAULT_MAX_REDIRECTS = 10;

/**
 * Accept the shorthands people actually type: a bare host, and a leading colon for
 * localhost. Everything else must already be a URL.
 */
export function resolveUrl(raw: string): URL {
    if (raw === '') {
        throw new CliError(EXIT.USAGE, 'the URL is empty');
    }

    let text = raw;

    if (text.startsWith(':')) {
        // `:8080/api` -> localhost:8080/api,  `:/api` -> localhost/api,  `:` -> localhost
        const rest = text.slice(1);
        text = /^\d/.test(rest) ? `http://localhost:${rest}` : `http://localhost${rest}`;
    } else if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) {
        text = `http://${text}`;
    }

    try {
        return new URL(text);
    } catch {
        throw new CliError(EXIT.USAGE, `not a valid URL: ${raw}`);
    }
}

function parsePrintLetters(letters: string): PrintSet {
    const set: PrintSet = { reqHeaders: false, reqBody: false, resHeaders: false, resBody: false, meta: false };

    for (const letter of letters) {
        switch (letter) {
            case 'H':
                set.reqHeaders = true;
                break;
            case 'B':
                set.reqBody = true;
                break;
            case 'h':
                set.resHeaders = true;
                break;
            case 'b':
                set.resBody = true;
                break;
            case 'm':
                set.meta = true;
                break;
            default:
                throw new CliError(
                    EXIT.USAGE,
                    `unknown --print letter: ${letter}`,
                    'valid letters are H (request headers), B (request body), h, b, m',
                );
        }
    }

    return set;
}

const NOTHING: PrintSet = { reqHeaders: false, reqBody: false, resHeaders: false, resBody: false, meta: false };

function resolvePrintSet(
    values: { print?: string; verbose?: boolean; headers?: boolean; body?: boolean; quiet?: boolean },
    stdoutIsTTY: boolean,
): PrintSet {
    if (values.quiet === true) return { ...NOTHING };
    if (values.print !== undefined) return parsePrintLetters(values.print);
    if (values.verbose === true) return parsePrintLetters('HBhbm');
    if (values.headers === true && values.body === true) return parsePrintLetters('hb');
    if (values.headers === true) return parsePrintLetters('h');
    if (values.body === true) return parsePrintLetters('b');

    // Piped output should be the body alone so `get url | jq` works with no flags.
    return parsePrintLetters(stdoutIsTTY ? 'hb' : 'b');
}

function parsePretty(value: string | undefined): PrettyMode | undefined {
    if (value === undefined) return undefined;

    if (value === 'all' || value === 'colors' || value === 'format' || value === 'none') {
        return value;
    }

    throw new CliError(EXIT.USAGE, `unknown --pretty mode: ${value}`, 'expected all, colors, format, or none');
}

function parsePositiveNumber(value: string | undefined, flag: string, integer: boolean): number | undefined {
    if (value === undefined) return undefined;

    const parsed = Number(value);

    if (!Number.isFinite(parsed) || parsed <= 0 || (integer && !Number.isInteger(parsed))) {
        throw new CliError(EXIT.USAGE, `--${flag} expects a positive ${integer ? 'integer' : 'number'}, got: ${value}`);
    }

    return parsed;
}

/** The 0.0.x form was `post -u <url> -f <file>`; `-f` now means `--form`, so it needs its own path. */
function isLegacyInvocation(argv: readonly string[]): boolean {
    return argv.some((arg) => arg === '-u' || arg === '--url' || arg.startsWith('--url='));
}

function parseLegacy(argv: readonly string[], context: ParseContext): Options {
    const { values } = parseArgs({
        args: [...argv],
        allowPositionals: false,
        strict: true,
        options: {
            url: { type: 'string', short: 'u' },
            filename: { type: 'string', short: 'f' },
        },
    });

    if (values.url === undefined) {
        throw new CliError(EXIT.USAGE, '-u/--url requires a value');
    }

    const method = context.fixedMethod ?? 'GET';

    return {
        method,
        url: resolveUrl(values.url),
        items: [],
        flags: {
            json: false,
            form: false,
            multipart: false,
            raw: undefined,
            file: values.filename,
            auth: undefined,
            bearer: undefined,
            print: resolvePrintSet({}, context.stdoutIsTTY),
            output: undefined,
            download: false,
            pretty: undefined,
            follow: false,
            maxRedirects: DEFAULT_MAX_REDIRECTS,
            timeout: undefined,
            insecure: false,
            checkStatus: false,
            offline: false,
            verbose: false,
        },
        invokedAs: context.invokedAs,
        deprecation: `-u/--url is deprecated; pass the URL positionally: ${context.invokedAs} ${values.url}`,
    };
}

export function parseArgv(argv: readonly string[], context: ParseContext): ParseResult {
    if (isLegacyInvocation(argv)) {
        return { kind: 'run', options: parseLegacy(argv, context) };
    }

    let values: Record<string, string | boolean | undefined>;
    let positionals: string[];

    try {
        const parsed = parseArgs({
            args: [...argv],
            allowPositionals: true,
            strict: true,
            options: toParseArgsOptions(),
        });
        values = parsed.values as Record<string, string | boolean | undefined>;
        positionals = parsed.positionals;
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        throw new CliError(EXIT.USAGE, message, `try '${context.invokedAs} --help'`);
    }

    if (values.help === true) {
        return { kind: 'help', invokedAs: context.invokedAs, fixedMethod: context.fixedMethod };
    }
    if (values.version === true) {
        return { kind: 'version', invokedAs: context.invokedAs, fixedMethod: context.fixedMethod };
    }

    const rest = [...positionals];
    let method = context.fixedMethod;

    if (method === undefined) {
        // `httpc <method> <url> [items]`, but also `httpc <url>` with the method inferred.
        const first = rest[0];
        if (first !== undefined && rest.length >= 2 && /^[A-Za-z]+$/.test(first)) {
            method = first.toUpperCase();
            rest.shift();
        }
    }

    const rawUrl = rest.shift();
    if (rawUrl === undefined) {
        throw new CliError(EXIT.USAGE, 'no URL given', `try '${context.invokedAs} --help'`);
    }

    const items = parseItems(rest);

    if (method === undefined) {
        const hasBodySource =
            items.some(isBodyItem) ||
            values.raw !== undefined ||
            values.file !== undefined ||
            context.stdinHasData === true;

        method = hasBodySource ? 'POST' : 'GET';
    }

    if (BODYLESS.has(method) && (items.some(isBodyItem) || values.raw !== undefined || values.file !== undefined)) {
        throw new CliError(
            EXIT.USAGE,
            `${method} cannot have a request body`,
            'use name==value for query parameters, or the QUERY method to send a body safely',
        );
    }

    const maxRedirectsGiven = parsePositiveNumber(values['max-redirects'] as string | undefined, 'max-redirects', true);

    const flags: ResolvedFlags = {
        json: values.json === true,
        form: values.form === true,
        multipart: values.multipart === true,
        raw: values.raw as string | undefined,
        file: values.file as string | undefined,
        auth: values.auth as string | undefined,
        bearer: values.bearer as string | undefined,
        print: resolvePrintSet(
            {
                print: values.print as string | undefined,
                verbose: values.verbose === true,
                headers: values.headers === true,
                body: values.body === true,
                quiet: values.quiet === true,
            },
            context.stdoutIsTTY,
        ),
        output: values.output as string | undefined,
        download: values.download === true,
        pretty: parsePretty(values.pretty as string | undefined),
        follow: values.follow === true || maxRedirectsGiven !== undefined,
        maxRedirects: maxRedirectsGiven ?? DEFAULT_MAX_REDIRECTS,
        timeout: parsePositiveNumber(values.timeout as string | undefined, 'timeout', false),
        insecure: values.insecure === true,
        checkStatus: values['check-status'] === true,
        offline: values.offline === true,
        verbose: values.verbose === true,
    };

    if (flags.json && flags.form) {
        throw new CliError(EXIT.USAGE, '--json and --form are mutually exclusive');
    }

    if (values.filename !== undefined && flags.file === undefined) {
        flags.file = values.filename as string;
    }

    return {
        kind: 'run',
        options: {
            method,
            url: resolveUrl(rawUrl),
            items,
            flags,
            invokedAs: context.invokedAs,
            deprecation: undefined,
        },
    };
}

/** Exposed so help output can list the same methods the bins cover. */
export const SHORTCUT_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'query'] as const;

/** Shortcuts that are not installed by default because they would shadow real commands. */
export const OPTIONAL_SHORTCUTS = ['head', 'patch'] as const;
