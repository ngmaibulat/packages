import { banner } from "./emit.js";
import type { ApiSpec } from "./spec.js";

//The transport every generated query and mutation goes through. Kept
//deliberately small: one fetch, one error type, one place to add a header.
//Anything a user wants to change lives in config.ts, which survives
//regeneration - see emitConfig.ts.
export default function clientTs(spec: ApiSpec) {
    const tpl = `
${banner(spec)}

import { config } from './config';

export class ApiError extends Error {
    constructor(
        readonly status: number,
        readonly body: unknown,
        readonly url: string
    ) {
        super(\`\${status} \${url}\`);
        this.name = 'ApiError';
    }
}

export type RequestOpts = {
    method: string;
    path: string;
    query?: Record<string, string | number | undefined>;
    body?: unknown;
    headers?: Record<string, string>;
    signal?: AbortSignal;
};

//path parameters go through this rather than straight into the template, so
//an id containing a slash cannot escape into the url as a new segment
export function segment(value: string | number) {
    return encodeURIComponent(String(value));
}

//an undefined query parameter is dropped rather than sent as "undefined"
function search(query: RequestOpts['query']) {
    const params = new URLSearchParams();

    for (const [key, value] of Object.entries(query ?? {})) {
        if (value !== undefined && value !== '') {
            params.set(key, String(value));
        }
    }

    const text = params.toString();
    return text ? \`?\${text}\` : '';
}

export async function request<T>(opts: RequestOpts): Promise<T> {
    const url = \`\${config.baseUrl}\${opts.path}\${search(opts.query)}\`;

    const headers: Record<string, string> = {
        Accept: 'application/json',
        ...opts.headers,
        ...config.headers,
    };

    if (config.token) {
        headers.Authorization = \`Bearer \${config.token}\`;
    }

    if (opts.body !== undefined) {
        headers['Content-Type'] ??= 'application/json';
    }

    const res = await fetch(url, {
        method: opts.method,
        headers,
        body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
        signal: opts.signal,
    });

    //read the body before throwing: an error payload is usually the only
    //thing that says *why* the call failed
    const text = await res.text();
    let parsed: unknown = undefined;

    if (text) {
        try {
            parsed = JSON.parse(text);
        } catch {
            parsed = text;
        }
    }

    if (!res.ok) {
        throw new ApiError(res.status, parsed, url);
    }

    return parsed as T;
}
`;

    return tpl;
}
