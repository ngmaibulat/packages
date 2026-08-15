//The intermediate representation every emitter sees. Nothing downstream of
//this file knows that Bruno exists, and nothing upstream of it knows what a
//query key is - swapping in a second front end later means producing an
//ApiSpec and nothing else.
//
//This lives in src/bruno/ rather than src/api/ on purpose: src/api/ is the
//path these files are *emitted to* inside the scaffolded app, and having both
//meanings share a name is how you end up editing the wrong one.

export const METHODS = ["get", "post", "put", "patch", "delete", "head", "options"] as const;

export type Method = (typeof METHODS)[number];

//GET and HEAD are the only ones a scaffolder may fire at someone's real API
//without being asked twice
export const SAFE: readonly Method[] = ["get", "head"];

//lives here rather than in sample.ts because cli.ts needs it to validate the
//flag, and sample.ts imports CliError back out of cli.ts - this module has no
//runtime imports of its own, so it can be depended on from either side
export const SAMPLE_MODES = ["safe", "all", "none"] as const;

export type SampleMode = (typeof SAMPLE_MODES)[number];

export type Endpoint = {
    //slugified from meta.name and made unique across the collection
    name: string;
    method: Method;
    //still a template: {{vars}} unresolved, path params as :id
    url: string;
    //:id placeholders in url, in the order they appear
    path: string[];
    //enabled keys of params:query
    query: string[];
    //the example values Bruno keeps alongside those params. Never emitted
    //into the client - they exist so the sampler can build a real url.
    pathValues: Record<string, string>;
    queryValues: Record<string, string>;
    //enabled headers, values still templates
    headers: Record<string, string>;
    //raw body:json text, still a template - may not be valid JSON
    body?: string;
    //"bearer" | "basic" | ... from the method block's auth: line
    auth?: string;
    //folder path inside the collection, used to break name collisions and to
    //group the generated functions in a comment
    folder: string;
    seq: number;
};

//one captured response, or a note saying why there isn't one. The skip
//reasons are written into api/samples.json verbatim so the committed file
//explains itself in a code review.
export type Sample = { status: number; body: unknown } | { skipped: string };

export type Samples = Record<string, Sample>;

export const SAMPLES_VERSION = 1;

export type SamplesFile = {
    version: number;
    endpoints: Samples;
};

export type ApiSpec = {
    //from bruno.json, falls back to the directory name
    collection: string;
    //where the collection was read from, relative to the app root. Recorded
    //in the generated package.json so "create-tsreact api" can find it again.
    dir: string;
    //vars from the selected environment. Secrets are deliberately absent -
    //Bruno stores only their *names* in the .bru file.
    vars: Record<string, string>;
    secrets: string[];
    endpoints: Endpoint[];
    samples: Samples;
};

//distinct origins across every endpoint url, after variable resolution. The
//extension template needs these for host_permissions; without them an MV3
//popup's cross-origin fetch is blocked and the client fails silently.
export function origins(spec: ApiSpec): string[] {
    const seen = new Set<string>();

    for (const e of spec.endpoints) {
        const url = substitute(e.url, spec.vars);
        try {
            seen.add(new URL(url).origin + "/*");
        } catch {
            //still holds an unresolved {{var}}, so there is no origin to
            //extract. Not fatal: the user fills the permission in by hand.
        }
    }

    return [...seen].sort();
}

//{{name}} -> vars[name], left alone when unknown so the caller can tell the
//difference between "resolved to empty" and "never resolved"
export function substitute(text: string, vars: Record<string, string>) {
    return text.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (whole, key: string) =>
        key in vars ? vars[key] : whole,
    );
}

//every {{var}} still left in a string after substitution
export function unresolved(text: string) {
    const out = new Set<string>();

    for (const m of text.matchAll(/\{\{\s*([\w.-]+)\s*\}\}/g)) {
        out.add(m[1]);
    }

    return [...out];
}
