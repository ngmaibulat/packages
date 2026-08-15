import http from 'node:http';
import type { AddressInfo } from 'node:net';

export interface Recorded {
    method: string;
    url: string;
    headers: http.IncomingHttpHeaders;
    body: Buffer;
}

export interface Fixture {
    origin: string;
    port: number;
    /** The most recent request the server saw, or null if it has seen none. */
    last: () => Recorded | null;
    all: () => Recorded[];
    reset: () => void;
    close: () => Promise<void>;
}

export const BINARY_BODY = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01, 0x02, 0x03]);

/**
 * A local echo server standing in for httpbin: no network, no flakiness, and it can
 * report exactly what arrived on the wire.
 */
export async function startServer(): Promise<Fixture> {
    const seen: Recorded[] = [];

    const server = http.createServer((req, res) => {
        const chunks: Buffer[] = [];

        req.on('data', (chunk: Buffer) => chunks.push(chunk));
        req.on('end', () => {
            const body = Buffer.concat(chunks);
            seen.push({ method: req.method ?? '', url: req.url ?? '', headers: req.headers, body });

            const url = new URL(req.url ?? '/', 'http://localhost');
            route(url, req, res, body);
        });
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));

    const { port } = server.address() as AddressInfo;

    return {
        origin: `http://127.0.0.1:${port}`,
        port,
        last: () => seen.at(-1) ?? null,
        all: () => [...seen],
        reset: () => {
            seen.length = 0;
        },
        close: () =>
            new Promise<void>((resolve, reject) => {
                server.closeAllConnections();
                server.close((err) => (err ? reject(err) : resolve()));
            }),
    };
}

function route(url: URL, req: http.IncomingMessage, res: http.ServerResponse, body: Buffer): void {
    const path = url.pathname;

    if (path === '/text') {
        res.setHeader('content-type', 'text/plain; charset=utf-8');
        res.end('plain text body');
        return;
    }

    if (path === '/json') {
        res.setHeader('content-type', 'application/json; charset=utf-8');
        res.end('{"b":2,"a":[1,{"deep":true}]}');
        return;
    }

    if (path === '/vendor-json') {
        res.setHeader('content-type', 'application/vnd.api+json');
        res.end('{"ok":true}');
        return;
    }

    if (path === '/broken-json') {
        res.setHeader('content-type', 'application/json');
        res.end('{not really json');
        return;
    }

    if (path === '/binary') {
        res.setHeader('content-type', 'image/png');
        res.setHeader('content-length', String(BINARY_BODY.length));
        res.end(BINARY_BODY);
        return;
    }

    if (path === '/download') {
        res.setHeader('content-type', 'text/csv');
        res.setHeader('content-disposition', 'attachment; filename="report.csv"');
        res.end('a,b\n1,2\n');
        return;
    }

    if (path === '/download-utf8') {
        res.setHeader('content-type', 'text/plain');
        res.setHeader('content-disposition', "attachment; filename*=UTF-8''r%C3%A9sum%C3%A9.txt");
        res.end('cv');
        return;
    }

    if (path === '/cookies') {
        res.setHeader('set-cookie', ['a=1; Expires=Wed, 21 Oct 2026 07:28:00 GMT', 'b=2; Path=/']);
        res.setHeader('content-type', 'application/json');
        res.end('{"ok":true}');
        return;
    }

    if (path === '/no-content-type') {
        res.removeHeader('content-type');
        res.end('bare');
        return;
    }

    if (path.startsWith('/status/')) {
        const code = Number(path.slice('/status/'.length)) || 200;
        res.statusCode = code;
        res.setHeader('content-type', 'application/json');
        res.end(`{"status":${code}}`);
        return;
    }

    if (path.startsWith('/redirect/')) {
        const remaining = Number(path.slice('/redirect/'.length)) || 0;
        const status = Number(url.searchParams.get('status') ?? '302');
        res.statusCode = remaining <= 1 ? status : status;
        res.setHeader('location', remaining <= 1 ? '/echo' : `/redirect/${remaining - 1}`);
        res.end();
        return;
    }

    if (path === '/redirect-elsewhere') {
        res.statusCode = 302;
        res.setHeader('location', url.searchParams.get('to') ?? '/echo');
        res.end();
        return;
    }

    if (path === '/slow') {
        const ms = Number(url.searchParams.get('ms') ?? '500');
        setTimeout(() => {
            res.setHeader('content-type', 'application/json');
            res.end('{"slow":true}');
        }, ms).unref();
        return;
    }

    // Default: echo everything back as JSON.
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.end(
        JSON.stringify({
            method: req.method,
            url: req.url,
            headers: req.headers,
            body: body.toString('utf8'),
        }),
    );
}
