import { CliError } from "./error.js";
import { SAFE, SAMPLES_VERSION, substitute, unresolved } from "./spec.js";
import type { ApiSpec, Endpoint, Sample, SampleMode, Samples, SamplesFile } from "./spec.js";

//Executes the collection once so the generated types describe what the API
//really returns rather than what someone declared it returns.
//
//Two rules shape everything here:
//
//  - No individual request may fail the scaffold. A dead endpoint records a
//    skip *with its reason*, that reason is written into api/samples.json, and
//    the endpoint's response type falls back to unknown. Only a run in which
//    every single attempt failed is treated as a misconfiguration worth
//    stopping for - that is a wrong base url or a missing token, not a flaky
//    service.
//  - Nothing that could be a credential is written to disk. Only response
//    bodies are captured; the resolved request headers are used and dropped.

const TIMEOUT_MS = 10_000;

//enough to make a large collection quick without looking like a load test
const CONCURRENCY = 4;

//Node 18+ has all of these as globals, but the CLI's tsconfig loads no DOM
//lib, so they are described here rather than depended on ambiently.
type FetchResponse = {
    ok: boolean;
    status: number;
    headers: { get(name: string): string | null };
    text(): Promise<string>;
};

type FetchInit = {
    method: string;
    headers: Record<string, string>;
    body?: string;
    signal?: unknown;
};

type FetchFn = (url: string, init: FetchInit) => Promise<FetchResponse>;

//collection.ts stays free of process.env so that parsing is a pure function
//of the files. The environment is layered on here instead, and only where the
//files left a hole: declared vars always win, so exporting HOME or PATH
//cannot quietly redirect a request.
export function resolveVars(spec: Pick<ApiSpec, "vars" | "endpoints">) {
    const vars = { ...spec.vars };
    const wanted = new Set<string>();

    for (const e of spec.endpoints) {
        for (const template of [e.url, ...Object.values(e.headers)]) {
            for (const name of unresolved(substitute(template, vars))) {
                wanted.add(name);
            }
        }
    }

    for (const name of wanted) {
        const value = process.env[name];
        if (value !== undefined) {
            vars[name] = value;
        }
    }

    return vars;
}

//url with {{vars}} resolved and :id placeholders filled from params:path,
//plus the query string rebuilt from params:query
function buildUrl(e: Endpoint, vars: Record<string, string>) {
    let url = substitute(e.url, vars);

    for (const name of e.path) {
        const value = substitute(e.pathValues[name] ?? "", vars);
        if (!value) {
            return { error: `no value for path parameter :${name}` };
        }
        url = url.replace(`/:${name}`, `/${encodeURIComponent(value)}`);
    }

    const missing = unresolved(url);
    if (missing.length) {
        return {
            error: `unresolved variable${
                missing.length > 1 ? "s" : ""
            } ${missing.map((m) => `{{${m}}}`).join(", ")} - set ${missing.join(
                ", ",
            )} in the environment`,
        };
    }

    const pairs = e.query
        .map((key) => [key, substitute(e.queryValues[key] ?? "", vars)])
        .filter(([, value]) => value && !unresolved(value).length);

    const search = pairs
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join("&");

    return { url: search ? `${url}?${search}` : url };
}

//a header still holding an unresolved {{var}} is dropped rather than sent
//literally, which would otherwise show up as a confusing 401
function buildHeaders(e: Endpoint, vars: Record<string, string>) {
    const out: Record<string, string> = {};

    for (const [key, template] of Object.entries(e.headers)) {
        const value = substitute(template, vars);
        if (!unresolved(value).length) {
            out[key] = value;
        }
    }

    return out;
}

async function request(
    fetchFn: FetchFn,
    e: Endpoint,
    vars: Record<string, string>,
): Promise<Sample> {
    const built = buildUrl(e, vars);
    if (built.error) {
        return { skipped: built.error };
    }

    const headers = buildHeaders(e, vars);
    const init: FetchInit = { method: e.method.toUpperCase(), headers };

    if (e.body && e.method !== "get" && e.method !== "head") {
        init.body = substitute(e.body, vars);
        headers["Content-Type"] ??= "application/json";
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    init.signal = controller.signal;

    try {
        const res = await fetchFn(built.url as string, init);

        if (!res.ok) {
            return { skipped: `HTTP ${res.status}` };
        }

        const type = res.headers.get("content-type") ?? "";
        const text = await res.text();

        if (!text.trim()) {
            return { status: res.status, body: null };
        }

        try {
            return { status: res.status, body: JSON.parse(text) };
        } catch {
            return {
                skipped: `response is not json${type ? ` (content-type: ${type})` : ""}`,
            };
        }
    } catch (err) {
        const message = (err as Error).message || String(err);
        return {
            skipped: controller.signal.aborted
                ? `timed out after ${TIMEOUT_MS}ms`
                : `request failed: ${message}`,
        };
    } finally {
        clearTimeout(timer);
    }
}

//a fixed-size worker pool - Promise.all over the whole collection would open
//as many sockets as there are requests
async function pool<T>(items: T[], run: (item: T) => Promise<void>) {
    let next = 0;

    const workers = Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
        while (next < items.length) {
            await run(items[next++]);
        }
    });

    await Promise.all(workers);
}

export type CollectOpts = {
    mode: SampleMode;
    //what api/samples.json already held, replayed instead of re-fetched
    previous: Samples;
    //re-hit the network for every endpoint, ignoring previous
    refresh: boolean;
};

export async function collect(
    spec: Pick<ApiSpec, "vars" | "endpoints">,
    opts: CollectOpts,
): Promise<Samples> {
    const samples: Samples = {};
    const todo: Endpoint[] = [];

    for (const e of spec.endpoints) {
        //replaying is what makes "npm run api:gen" work offline and produce a
        //byte-identical result
        if (!opts.refresh && opts.previous[e.name]) {
            samples[e.name] = opts.previous[e.name];
            continue;
        }

        if (opts.mode === "none") {
            samples[e.name] = { skipped: "not sampled (--api-sample=none)" };
            continue;
        }

        //a scaffolder must not POST to someone's real API as a side effect of
        //"npm create". Opting in is explicit.
        if (opts.mode === "safe" && !SAFE.includes(e.method)) {
            samples[e.name] = {
                skipped: `${e.method.toUpperCase()} not sampled (--api-sample=safe)`,
            };
            continue;
        }

        todo.push(e);
    }

    if (todo.length === 0) {
        return samples;
    }

    const fetchFn = (globalThis as { fetch?: FetchFn }).fetch;
    if (!fetchFn) {
        throw new CliError(
            "Sampling needs global fetch (Node 18+). Re-run with --api-sample=none.",
        );
    }

    const vars = resolveVars(spec);

    await pool(todo, async (e) => {
        samples[e.name] = await request(fetchFn, e, vars);
    });

    const failures = todo.filter((e) => "skipped" in samples[e.name]);

    //every attempt failing is a wrong base url or a missing token, not a
    //flaky service - stopping here beats scaffolding an app typed entirely
    //as unknown and letting the user work out why
    if (failures.length === todo.length) {
        const first = samples[failures[0].name] as { skipped: string };
        throw new CliError(
            `Could not sample any endpoint (${todo.length} tried).\n` +
                `First failure - ${failures[0].name}: ${first.skipped}\n` +
                `Re-run with --api-sample=none to generate without sampling.`,
        );
    }

    return samples;
}

//api/samples.json is committed, so it is formatted for a code review rather
//than for size, and endpoints are written in spec order for a stable diff
export function serialise(spec: Pick<ApiSpec, "endpoints">, samples: Samples) {
    const ordered: Samples = {};

    for (const e of spec.endpoints) {
        if (samples[e.name]) {
            ordered[e.name] = samples[e.name];
        }
    }

    const file: SamplesFile = {
        version: SAMPLES_VERSION,
        endpoints: ordered,
    };

    return JSON.stringify(file, null, 4);
}

export function deserialise(text: string, file: string): Samples {
    let parsed: SamplesFile;

    try {
        parsed = JSON.parse(text);
    } catch (err) {
        throw new CliError(`${file} is not valid json: ${(err as Error).message}`);
    }

    if (parsed.version !== SAMPLES_VERSION) {
        throw new CliError(
            `${file} was written by a different version of create-tsreact ` +
                `(found ${parsed.version}, expected ${SAMPLES_VERSION}). ` +
                `Delete it and re-run with --refresh.`,
        );
    }

    return parsed.endpoints ?? {};
}
