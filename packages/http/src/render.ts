import { createWriteStream } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';

import type { PrintSet } from './args.ts';
import type { Styles } from './color.ts';
import { CliError, EXIT } from './errors.ts';
import { formatJson, tryParseJson } from './json.ts';
import { isJsonType, isTextType } from './mime.ts';
import type { Hop, Prepared, SendResult } from './request.ts';

export interface OutputStream extends NodeJS.WritableStream {
    isTTY?: boolean;
}

export interface RenderContext {
    styles: Styles;
    color: boolean;
    format: boolean;
    print: PrintSet;
    stdout: OutputStream;
    stderr: OutputStream;
}

const UNITS = ['B', 'kB', 'MB', 'GB', 'TB'];

export function formatBytes(bytes: number): string {
    let value = bytes;
    let unit = 0;

    while (value >= 1000 && unit < UNITS.length - 1) {
        value /= 1000;
        unit++;
    }

    const rounded = unit === 0 ? String(value) : value.toFixed(value < 10 ? 1 : 0);
    return `${rounded} ${UNITS[unit]}`;
}

function statusStyle(status: number, styles: Styles): (text: string) => string {
    if (status < 200) return styles.cyan;
    if (status < 300) return styles.green;
    if (status < 400) return styles.cyan;
    if (status < 500) return styles.yellow;
    return styles.red;
}

/** `fetch` does not expose the negotiated protocol version, so this label is synthetic. */
const HTTP_VERSION = 'HTTP/1.1';

function headerLines(entries: [string, string][], styles: Styles): string {
    return entries.map(([name, value]) => `${styles.blue(name)}${styles.dim(':')} ${value}`).join('\n');
}

function responseHeaderEntries(headers: Headers): [string, string][] {
    const entries: [string, string][] = [];

    for (const [name, value] of headers) {
        // Multiple Set-Cookie headers are comma-joined by the iterator, which corrupts
        // cookies containing commas (in Expires, for one). getSetCookie keeps them apart.
        if (name.toLowerCase() === 'set-cookie') continue;
        entries.push([name, value]);
    }

    for (const cookie of headers.getSetCookie()) {
        entries.push(['set-cookie', cookie]);
    }

    entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return entries;
}

export function renderRequestHead(prepared: Prepared, ctx: RenderContext): void {
    const { styles } = ctx;

    if (ctx.print.reqHeaders) {
        const target = `${prepared.url.pathname}${prepared.url.search}`;
        ctx.stdout.write(`${styles.bold(prepared.method)} ${target} ${styles.dim(HTTP_VERSION)}\n`);

        const entries: [string, string][] = [['host', prepared.url.host]];
        for (const [name, value] of prepared.headers) {
            entries.push([name, name.toLowerCase() === 'authorization' ? redactAuth(value) : value]);
        }
        entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

        ctx.stdout.write(`${headerLines(entries, styles)}\n`);
    }

    if (ctx.print.reqBody && prepared.bodyPreview !== null && prepared.bodyPreview !== '') {
        if (ctx.print.reqHeaders) ctx.stdout.write('\n');
        ctx.stdout.write(`${prepared.bodyPreview}\n`);
    }

    if (ctx.print.reqHeaders || ctx.print.reqBody) ctx.stdout.write('\n');
}

/** Keep credentials out of terminal scrollback and shared logs. */
function redactAuth(value: string): string {
    const space = value.indexOf(' ');
    if (space === -1) return '********';
    return `${value.slice(0, space)} ********`;
}

export function renderStatusLine(response: Response, ctx: RenderContext): void {
    const paint = statusStyle(response.status, ctx.styles);
    const text = response.statusText === '' ? '' : ` ${response.statusText}`;
    ctx.stdout.write(`${ctx.styles.dim(HTTP_VERSION)} ${paint(`${response.status}${text}`)}\n`);
}

export function renderHops(hops: readonly Hop[], ctx: RenderContext): void {
    for (const hop of hops) {
        const notes: string[] = [];
        if (hop.droppedBody) notes.push('body dropped');
        if (hop.droppedAuth) notes.push('credentials dropped (cross-origin)');

        const suffix = notes.length === 0 ? '' : ` ${ctx.styles.dim(`(${notes.join(', ')})`)}`;
        ctx.stdout.write(`${ctx.styles.dim(`${hop.status} ->`)} ${hop.to}${suffix}\n`);
    }
}

/**
 * Decode `Content-Disposition`, preferring the RFC 5987 `filename*` form, and fall back
 * to the final URL's last path segment.
 */
export function deriveDownloadFilename(headers: Headers, url: URL): string {
    const disposition = headers.get('content-disposition');

    if (disposition !== null) {
        const extended = /filename\*\s*=\s*([^']*)'([^']*)'([^;]+)/i.exec(disposition);
        if (extended?.[3] !== undefined) {
            try {
                return sanitizeFilename(decodeURIComponent(extended[3].trim()));
            } catch {
                // fall through to the plain form
            }
        }

        const plain = /filename\s*=\s*("([^"]*)"|[^;]+)/i.exec(disposition);
        const candidate = plain?.[2] ?? plain?.[1];
        if (candidate !== undefined && candidate.trim() !== '') {
            return sanitizeFilename(candidate.trim());
        }
    }

    const last = url.pathname.split('/').filter((part) => part !== '').pop();
    if (last !== undefined) {
        try {
            return sanitizeFilename(decodeURIComponent(last));
        } catch {
            return sanitizeFilename(last);
        }
    }

    return 'index.html';
}

export function sanitizeFilename(name: string): string {
    // Never let a server choose a path -- only a name in the current directory.
    const base = path.basename(name.replace(/\\/g, '/'));
    const cleaned = base.replace(/^\.+/, '').replace(/[\u0000-\u001f<>:"|?*]/g, '_');
    return cleaned === '' ? 'index.html' : cleaned;
}

/** Pick a name that does not already exist, so a download never clobbers a file. */
async function uniquePath(candidate: string): Promise<string> {
    const { access } = await import('node:fs/promises');
    const dir = path.dirname(candidate);
    const ext = path.extname(candidate);
    const stem = path.basename(candidate, ext);

    for (let counter = 0; counter < 1000; counter++) {
        const attempt = counter === 0 ? candidate : path.join(dir, `${stem}-${counter}${ext}`);
        try {
            await access(attempt);
        } catch {
            return attempt;
        }
    }

    throw new CliError(EXIT.ERROR, `could not find an unused filename near ${candidate}`);
}

async function writeBodyToFile(response: Response, destination: string, ctx: RenderContext): Promise<void> {
    if (response.body === null) {
        throw new CliError(EXIT.ERROR, 'the response had no body to save');
    }

    const total = Number(response.headers.get('content-length') ?? '0');
    const showProgress = ctx.stderr.isTTY === true && total > 0;

    let written = 0;
    let lastPaint = 0;

    const source = Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]);

    if (showProgress) {
        source.on('data', (chunk: Buffer) => {
            written += chunk.length;
            const now = Date.now();
            if (now - lastPaint < 100 && written < total) return;
            lastPaint = now;
            const percent = Math.min(100, Math.round((written / total) * 100));
            ctx.stderr.write(`\r${destination}: ${percent}% (${formatBytes(written)}/${formatBytes(total)})`);
        });
    }

    try {
        await pipeline(source, createWriteStream(destination));
    } catch (err) {
        const code = (err as NodeJS.ErrnoException).code ?? 'unknown';
        throw new CliError(EXIT.ERROR, `cannot write '${destination}': ${code}`);
    }

    if (showProgress) ctx.stderr.write('\n');
}

function looksBinary(buffer: Buffer): boolean {
    const sample = buffer.subarray(0, 1024);
    return sample.includes(0);
}

async function renderBody(result: SendResult, ctx: RenderContext): Promise<void> {
    const { response } = result;
    const contentType = response.headers.get('content-type');

    if (response.body === null) return;

    const textual = isTextType(contentType) || contentType === null;

    // Unknown or binary types are streamed straight through when redirected, so large
    // downloads never sit in memory, and summarised when they would hit a terminal.
    if (!textual) {
        if (ctx.stdout.isTTY === true) {
            const bytes = Buffer.from(await response.arrayBuffer());
            const label = contentType ?? 'unknown type';
            ctx.stdout.write(ctx.styles.dim(`<binary data: ${formatBytes(bytes.length)}, ${label}>\n`));
            return;
        }

        await pipeline(Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]), ctx.stdout);
        return;
    }

    const bytes = Buffer.from(await response.arrayBuffer());

    if (bytes.length === 0) return;

    if (looksBinary(bytes) && ctx.stdout.isTTY === true) {
        ctx.stdout.write(ctx.styles.dim(`<binary data: ${formatBytes(bytes.length)}, ${contentType ?? 'unknown'}>\n`));
        return;
    }

    const text = bytes.toString('utf8');

    if (isJsonType(contentType) && ctx.format) {
        const parsed = tryParseJson(text);
        if (parsed !== undefined) {
            ctx.stdout.write(`${formatJson(parsed.value, ctx.color ? ctx.styles : null)}\n`);
            return;
        }
        // Not actually JSON -- show it verbatim rather than swallowing it.
    }

    ctx.stdout.write(text.endsWith('\n') ? text : `${text}\n`);
}

export interface RenderOptions {
    output: string | undefined;
    download: boolean;
}

export async function renderResponse(result: SendResult, options: RenderOptions, ctx: RenderContext): Promise<void> {
    const { response } = result;

    if (ctx.print.resHeaders) {
        renderStatusLine(response, ctx);
        renderHops(result.hops, ctx);
        ctx.stdout.write(`${headerLines(responseHeaderEntries(response.headers), ctx.styles)}\n`);
    }

    const saving = options.output !== undefined || options.download;

    if (saving) {
        const destination =
            options.output ?? (await uniquePath(deriveDownloadFilename(response.headers, result.finalUrl)));

        await writeBodyToFile(response, destination, ctx);

        if (ctx.print.resHeaders || ctx.print.meta) {
            ctx.stderr.write(`saved to ${destination}\n`);
        }
        return;
    }

    if (!ctx.print.resBody) {
        await response.body?.cancel().catch(() => undefined);
        return;
    }

    if (ctx.print.resHeaders) ctx.stdout.write('\n');

    await renderBody(result, ctx);
}

/** Timing goes to stderr so that stdout stays pipe-clean regardless of flags. */
export function renderTiming(result: SendResult, ctx: RenderContext): void {
    if (!ctx.print.meta) return;

    const total = Math.round(performance.now() - result.timing.startedAt);
    const headers = Math.round(result.timing.headersMs);

    ctx.stderr.write(ctx.styles.dim(`# ${result.response.status} · ${total} ms (headers ${headers} ms)\n`));
}
