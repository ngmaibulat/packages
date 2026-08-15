import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";

/**
 * Static file server for previewing a generated bundle.
 *
 * The published version ended with `npx serve dist`, which blocked the
 * terminal on every run and needed the network for a package that otherwise
 * needs neither. This is the same preview with no dependency, and it only runs
 * when --serve is passed.
 */

const MIME: Record<string, string> = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".map": "application/json; charset=utf-8",
};

export interface ServeOptions {
    root: string;
    port?: number;
    host?: string;
}

export function serve(options: ServeOptions): http.Server {
    const { root, port = 3000, host = "127.0.0.1" } = options;
    const rootDir = path.resolve(root);

    const server = http.createServer((req, res) => {
        void respond(rootDir, req, res);
    });

    server.listen(port, host, () => {
        console.log(`Serving ${rootDir} on http://${host}:${port}`);
        console.log("Press Ctrl+C to stop");
    });

    return server;
}

async function respond(
    rootDir: string,
    req: http.IncomingMessage,
    res: http.ServerResponse
): Promise<void> {
    const url = new URL(req.url ?? "/", "http://localhost");
    const requested = decodeURIComponent(url.pathname);
    const target = path.join(
        rootDir,
        requested.endsWith("/") ? `${requested}index.html` : requested
    );

    // path.join collapses `..`, so this catches any attempt to escape the
    // served directory before the read happens.
    if (target !== rootDir && !target.startsWith(rootDir + path.sep)) {
        res.writeHead(403).end("Forbidden");
        return;
    }

    try {
        const body = await fs.readFile(target);
        const type = MIME[path.extname(target)] ?? "application/octet-stream";

        res.writeHead(200, {
            "content-type": type,
            "content-length": body.byteLength,
        }).end(body);
    } catch {
        res.writeHead(404, { "content-type": "text/plain" }).end("Not Found");
    }
}
