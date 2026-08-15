import assert from "node:assert/strict";

const TIMEOUT_MS = 15_000;

/** A normalized response, so every test reads the same way. */
export interface Reply {
    status: number;
    ok: boolean;
    redirected: boolean;
    /** Content type with any parameters stripped, e.g. "application/json". */
    type: string;
    /** Lowercased charset parameter, or null when the server omits it. */
    charset: string | null;
    body: any;
}

export interface RequestOptions {
    headers?: Record<string, string>;
    /** "manual" leaves a 3xx untouched so a test can assert on the redirect itself. */
    redirect?: RequestRedirect;
}

/** Binds a base URL, mirroring how the endpoint tests are organized. */
export function api(baseUrl: string) {
    return {
        get: (path: string, options: RequestOptions = {}) =>
            send(baseUrl, path, "GET", undefined, options),

        post: (path: string, payload: unknown, options: RequestOptions = {}) =>
            send(baseUrl, path, "POST", payload, options),
    };
}

async function send(
    baseUrl: string,
    path: string,
    method: string,
    payload: unknown,
    options: RequestOptions,
): Promise<Reply> {
    const { headers = {}, redirect = "follow" } = options;
    const hasBody = payload !== undefined;

    const response = await fetch(new URL(path, baseUrl), {
        method,
        redirect,
        // fetch has no default timeout, so a hung endpoint would stall the run
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: {
            // several of these APIs serve HTML unless JSON is asked for by name
            Accept: "application/json",
            // and GitHub rejects requests that arrive without a User-Agent
            "User-Agent": "funtest",
            ...(hasBody ? { "Content-Type": "application/json" } : {}),
            ...headers,
        },
        ...(hasBody ? { body: JSON.stringify(payload) } : {}),
    });

    return toReply(response);
}

async function toReply(response: Response): Promise<Reply> {
    const [type = "", ...params] = (response.headers.get("content-type") ?? "")
        .split(";")
        .map((part) => part.trim());

    const charset =
        params
            .find((part) => part.toLowerCase().startsWith("charset="))
            ?.slice("charset=".length)
            .toLowerCase() ?? null;

    return {
        status: response.status,
        ok: response.ok,
        redirected: response.redirected,
        type,
        charset,
        body: type === "application/json" ? await response.json() : await response.text(),
    };
}

/** The checks every successful JSON endpoint should satisfy. */
export function stdChecks(reply: Reply) {
    assert.equal(reply.type, "application/json", `unexpected content type "${reply.type}"`);

    // charset is optional on application/json, since RFC 8259 already mandates UTF-8
    if (reply.charset !== null) {
        assert.equal(reply.charset, "utf-8");
    }

    assert.equal(reply.status, 200);
    assert.ok(reply.ok, "expected a 2xx response");
}

export function checkArray(value: unknown) {
    assert.ok(Array.isArray(value), `expected an array, got ${typeof value}`);
}

/**
 * Schema-by-example: assert the payload carries every property the captured
 * sample does. Given an array, only the first element is inspected.
 */
export function checkProps(payload: unknown, props: string[]) {
    const target = Array.isArray(payload) ? payload[0] : payload;

    assert.ok(
        target !== null && typeof target === "object",
        "expected an object to check properties on",
    );

    for (const prop of props) {
        assert.ok(prop in target, `missing property "${prop}"`);
    }
}
