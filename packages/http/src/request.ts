import fs from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

import type { Options } from './args.ts';
import { SAFE_METHODS } from './args.ts';
import { CliError, EXIT } from './errors.ts';
import type { Item } from './items.ts';
import { guessMime, OCTET_STREAM } from './mime.ts';
import { USER_AGENT } from './version.ts';

/** The body shapes we ever construct. Narrower than `BodyInit`, which Node does not declare globally. */
export type RequestBody = string | Buffer | Blob | FormData | URLSearchParams;

export interface Prepared {
    method: string;
    url: URL;
    headers: Headers;
    body: RequestBody | null;
    /** A short textual rendering of the body for `--verbose` / `--offline`. */
    bodyPreview: string | null;
    /** False when the body could not survive being sent a second time (it never is, today). */
    replayable: boolean;
}

export interface BuildDeps {
    /** Lazy so that a piped stdin is only drained when it is actually the body source. */
    readStdin: () => Promise<Buffer | null>;
    promptPassword: (user: string) => Promise<string>;
    stdinIsTTY: boolean;
}

export interface Hop {
    status: number;
    from: string;
    to: string;
    method: string;
    droppedBody: boolean;
    droppedAuth: boolean;
}

export interface Timing {
    startedAt: number;
    headersMs: number;
}

/**
 * A `--timeout` that spans the whole exchange. The caller clears it only after the
 * response body has been consumed, so a slow download counts against the same budget.
 */
export interface Deadline {
    signal: AbortSignal | undefined;
    expired: () => boolean;
    clear: () => void;
    seconds: number | undefined;
}

export function createDeadline(seconds: number | undefined): Deadline {
    if (seconds === undefined) {
        return { signal: undefined, expired: () => false, clear: () => {}, seconds: undefined };
    }

    const controller = new AbortController();
    let expired = false;

    const timer = setTimeout(() => {
        expired = true;
        controller.abort();
    }, seconds * 1000);
    timer.unref();

    return {
        signal: controller.signal,
        expired: () => expired,
        clear: () => clearTimeout(timer),
        seconds,
    };
}

/** Rethrow a transport error as a timeout when our own deadline is what killed it. */
export function classifyAbort(err: unknown, deadline: Deadline): unknown {
    if (deadline.expired()) {
        return new CliError(EXIT.TIMEOUT, `request timed out after ${deadline.seconds}s`);
    }
    return err;
}

const CONTENT_TYPE = 'content-type';

async function readFileOrFail(filePath: string, what: string): Promise<string> {
    try {
        return await readFile(filePath, 'utf8');
    } catch (err) {
        const code = (err as NodeJS.ErrnoException).code ?? 'unknown';
        throw new CliError(EXIT.ERROR, `cannot read ${what} '${filePath}': ${code}`);
    }
}

async function openBlobOrFail(filePath: string, type: string): Promise<Blob> {
    // openAsBlob reports every failure as ERR_INVALID_ARG_VALUE ("Unable to open file as
    // blob"), which tells the user nothing. Stat first so the message names the real cause.
    try {
        const info = await stat(filePath);
        if (info.isDirectory()) {
            throw new CliError(EXIT.ERROR, `cannot read file '${filePath}': it is a directory`);
        }
    } catch (err) {
        if (err instanceof CliError) throw err;
        const code = (err as NodeJS.ErrnoException).code ?? 'unknown';
        throw new CliError(EXIT.ERROR, `cannot read file '${filePath}': ${code}`);
    }

    try {
        return await fs.openAsBlob(filePath, { type });
    } catch (err) {
        const code = (err as NodeJS.ErrnoException).code ?? 'unknown';
        throw new CliError(EXIT.ERROR, `cannot read file '${filePath}': ${code}`);
    }
}

function applyHeaderItems(headers: Headers, items: readonly Item[]): void {
    const seen = new Set<string>();

    for (const item of items) {
        if (item.kind !== 'header') continue;

        const name = item.name;
        const lower = name.toLowerCase();

        if (item.value === null) {
            headers.delete(name);
            seen.add(lower);
            continue;
        }

        try {
            // The first mention of a name replaces our default; later ones add to it,
            // so `Cookie:a Cookie:b` sends both.
            if (seen.has(lower)) {
                headers.append(name, item.value);
            } else {
                headers.set(name, item.value);
            }
        } catch {
            throw new CliError(EXIT.USAGE, `invalid header '${name}: ${item.value}'`);
        }

        seen.add(lower);
    }
}

function applyQueryItems(url: URL, items: readonly Item[]): void {
    for (const item of items) {
        if (item.kind !== 'query') continue;
        // Append rather than set, so repeated names and pre-existing URL params both survive.
        url.searchParams.append(item.name, item.value);
    }
}

async function buildAuthHeader(options: Options, deps: BuildDeps): Promise<string | undefined> {
    const { auth, bearer } = options.flags;

    if (bearer !== undefined) {
        if (auth !== undefined) {
            throw new CliError(EXIT.USAGE, '--auth and --bearer are mutually exclusive');
        }
        return `Bearer ${bearer}`;
    }

    if (auth === undefined) return undefined;

    const separator = auth.indexOf(':');
    let user = auth;
    let password: string;

    if (separator === -1) {
        if (deps.stdinIsTTY === false) {
            throw new CliError(
                EXIT.USAGE,
                'a password is required for --auth when stdin is not a terminal',
                'use --auth user:pass',
            );
        }
        password = await deps.promptPassword(auth);
    } else {
        user = auth.slice(0, separator);
        password = auth.slice(separator + 1);
    }

    return `Basic ${Buffer.from(`${user}:${password}`, 'utf8').toString('base64')}`;
}

interface BodyResult {
    body: RequestBody | null;
    contentType: string | null;
    preview: string | null;
}

function jsonPreview(value: unknown): string {
    return JSON.stringify(value, null, 2);
}

async function buildFormData(items: readonly Item[]): Promise<BodyResult> {
    const form = new FormData();
    const previewLines: string[] = [];

    for (const item of items) {
        switch (item.kind) {
            case 'field':
                form.append(item.name, item.value);
                previewLines.push(`${item.name}=${item.value}`);
                break;
            case 'raw':
                form.append(item.name, JSON.stringify(item.value));
                previewLines.push(`${item.name}=${JSON.stringify(item.value)}`);
                break;
            case 'fieldFile': {
                const text = await readFileOrFail(item.path, 'field file');
                form.append(item.name, text);
                previewLines.push(`${item.name}=<${item.path}>`);
                break;
            }
            case 'rawFile': {
                const text = await readFileOrFail(item.path, 'field file');
                form.append(item.name, text.trim());
                previewLines.push(`${item.name}=<${item.path}>`);
                break;
            }
            case 'file': {
                const type = guessMime(item.path);
                const blob = await openBlobOrFail(item.path, type);
                form.append(item.name, blob, path.basename(item.path));
                previewLines.push(`${item.name}=@${item.path} (${type}, ${blob.size} bytes)`);
                break;
            }
            default:
                break;
        }
    }

    // Content-Type is deliberately left null: undici must generate the boundary.
    return { body: form, contentType: null, preview: previewLines.join('\n') };
}

async function buildUrlEncoded(items: readonly Item[]): Promise<BodyResult> {
    const params = new URLSearchParams();

    for (const item of items) {
        switch (item.kind) {
            case 'field':
                params.append(item.name, item.value);
                break;
            case 'raw':
                params.append(item.name, typeof item.value === 'string' ? item.value : JSON.stringify(item.value));
                break;
            case 'fieldFile':
            case 'rawFile':
                params.append(item.name, (await readFileOrFail(item.path, 'field file')).trim());
                break;
            default:
                break;
        }
    }

    const text = params.toString();
    return { body: text, contentType: 'application/x-www-form-urlencoded; charset=utf-8', preview: text };
}

async function buildJson(items: readonly Item[]): Promise<BodyResult> {
    const object: Record<string, unknown> = {};

    for (const item of items) {
        switch (item.kind) {
            case 'field':
                object[item.name] = item.value;
                break;
            case 'raw':
                object[item.name] = item.value;
                break;
            case 'fieldFile':
                object[item.name] = await readFileOrFail(item.path, 'field file');
                break;
            case 'rawFile': {
                const text = await readFileOrFail(item.path, 'JSON field file');
                try {
                    object[item.name] = JSON.parse(text) as unknown;
                } catch (err) {
                    const detail = err instanceof Error ? err.message : String(err);
                    throw new CliError(EXIT.USAGE, `invalid JSON in '${item.path}' for field '${item.name}': ${detail}`);
                }
                break;
            }
            default:
                break;
        }
    }

    return { body: JSON.stringify(object), contentType: 'application/json', preview: jsonPreview(object) };
}

function sniffContentType(buffer: Buffer): string {
    const head = buffer.subarray(0, 512).toString('utf8').trimStart();
    if (head.startsWith('{') || head.startsWith('[')) return 'application/json';
    return OCTET_STREAM;
}

/** Methods that must never carry a body -- `fetch` throws outright for these. */
const BODYLESS_METHODS = new Set(['GET', 'HEAD']);

async function buildBody(options: Options, deps: BuildDeps, headers: Headers): Promise<BodyResult> {
    const { flags, items } = options;
    const bodyItems = items.filter((item) => item.kind !== 'header' && item.kind !== 'query');
    const hasFileItem = bodyItems.some((item) => item.kind === 'file');

    if (flags.raw !== undefined) {
        return {
            body: flags.raw,
            contentType: flags.json ? 'application/json' : 'text/plain; charset=utf-8',
            preview: flags.raw,
        };
    }

    if (flags.file !== undefined) {
        const type = guessMime(flags.file);
        const blob = await openBlobOrFail(flags.file, type);
        return { body: blob, contentType: type, preview: `<${flags.file}: ${blob.size} bytes, ${type}>` };
    }

    if (bodyItems.length > 0) {
        if (hasFileItem || flags.multipart) {
            if (headers.has(CONTENT_TYPE) && !(headers.get(CONTENT_TYPE) ?? '').includes('boundary=')) {
                throw new CliError(
                    EXIT.USAGE,
                    'a multipart Content-Type must include a boundary',
                    'omit the Content-Type header and let it be generated',
                );
            }
            return buildFormData(bodyItems);
        }

        if (flags.form) return buildUrlEncoded(bodyItems);

        return buildJson(bodyItems);
    }

    // Never drain stdin for a method that cannot carry a body: it is forbidden anyway,
    // and an open-but-idle stdin would block the whole command forever.
    if (!deps.stdinIsTTY && !BODYLESS_METHODS.has(options.method.toUpperCase())) {
        const piped = await deps.readStdin();

        if (piped !== null && piped.length > 0) {
            const explicit = headers.get(CONTENT_TYPE);
            return {
                body: piped,
                contentType: explicit ?? sniffContentType(piped),
                preview: piped.toString('utf8'),
            };
        }
    }

    return { body: null, contentType: null, preview: null };
}

export async function buildRequest(options: Options, deps: BuildDeps): Promise<Prepared> {
    const url = new URL(options.url.href);
    applyQueryItems(url, options.items);

    const headers = new Headers({
        'user-agent': USER_AGENT,
        accept: 'application/json, */*;q=0.5',
    });

    applyHeaderItems(headers, options.items);

    const auth = await buildAuthHeader(options, deps);
    if (auth !== undefined && !headers.has('authorization')) {
        headers.set('authorization', auth);
    }

    const { body, contentType, preview } = await buildBody(options, deps, headers);

    if (contentType !== null && !headers.has(CONTENT_TYPE)) {
        headers.set(CONTENT_TYPE, contentType);
    }

    if (options.flags.json && !headers.has('accept')) {
        headers.set('accept', 'application/json');
    }

    return {
        // `fetch` only uppercases the six methods it knows; anything else (QUERY, SEARCH,
        // PURGE) goes out verbatim and a lowercase method is rejected by the server.
        method: options.method.toUpperCase(),
        url,
        headers,
        body,
        bodyPreview: preview,
        replayable: true,
    };
}

/** 301/302 after a POST, and any 303, become a GET without a body. */
function rewriteForRedirect(method: string, status: number): { method: string; dropBody: boolean } {
    if (status === 307 || status === 308) return { method, dropBody: false };

    if (status === 303) return { method: method === 'HEAD' ? 'HEAD' : 'GET', dropBody: true };

    if (status === 301 || status === 302) {
        // Safe methods (including QUERY) keep their identity; unsafe ones degrade to GET.
        if (SAFE_METHODS.has(method)) return { method, dropBody: true };
        return { method: 'GET', dropBody: true };
    }

    return { method, dropBody: false };
}

export interface SendResult {
    response: Response;
    hops: Hop[];
    timing: Timing;
    finalUrl: URL;
}

export async function send(prepared: Prepared, options: Options, deadline: Deadline): Promise<SendResult> {
    const { flags } = options;

    if (flags.insecure) {
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    }

    const started = performance.now();
    const hops: Hop[] = [];

    let method = prepared.method;
    let url = prepared.url;
    let headers = new Headers(prepared.headers);
    let body = prepared.body;

    try {
        for (let attempt = 0; ; attempt++) {
            const response = await fetch(url, {
                method,
                headers,
                body,
                redirect: 'manual',
                signal: deadline.signal,
            });

            const isRedirect = response.status >= 300 && response.status < 400 && response.headers.has('location');

            if (!flags.follow || !isRedirect) {
                return {
                    response,
                    hops,
                    timing: { startedAt: started, headersMs: performance.now() - started },
                    finalUrl: url,
                };
            }

            if (attempt >= flags.maxRedirects) {
                throw new CliError(
                    EXIT.TOO_MANY_REDIRECTS,
                    `exceeded --max-redirects (${flags.maxRedirects})`,
                    `last redirect was to ${response.headers.get('location') ?? '?'}`,
                );
            }

            const location = response.headers.get('location') as string;
            let target: URL;
            try {
                target = new URL(location, url);
            } catch {
                throw new CliError(EXIT.ERROR, `server sent an unusable redirect target: ${location}`);
            }

            const rewrite = rewriteForRedirect(method, response.status);
            const crossOrigin = target.origin !== url.origin;

            headers = new Headers(headers);
            if (rewrite.dropBody) {
                body = null;
                headers.delete('content-type');
                headers.delete('content-length');
            }
            if (crossOrigin) {
                headers.delete('authorization');
                headers.delete('cookie');
            }

            hops.push({
                status: response.status,
                from: url.href,
                to: target.href,
                method: rewrite.method,
                droppedBody: rewrite.dropBody,
                droppedAuth: crossOrigin,
            });

            // Drain the redirect response so the socket can be reused.
            await response.arrayBuffer().catch(() => undefined);

            method = rewrite.method;
            url = target;
        }
    } catch (err) {
        // The deadline is intentionally left running: the caller clears it only once the
        // response body has been read, so `--timeout` covers the download as well.
        throw classifyAbort(err, deadline);
    }
}
