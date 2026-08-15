import { SAFE, substitute, unresolved } from "./spec.js";
import type { ApiSpec, Endpoint } from "./spec.js";

//Shared helpers for the emit*.ts modules: naming, the split between queries
//and mutations, and working out what belongs in config.baseUrl versus in each
//endpoint's own path.

export function pascal(name: string) {
    return name[0].toUpperCase() + name.slice(1);
}

//GET and HEAD become queries; everything else becomes a mutation hook. Same
//split the sampler uses to decide what is safe to execute.
export function isQuery(e: Endpoint) {
    return SAFE.includes(e.method);
}

export function queries(spec: ApiSpec) {
    return spec.endpoints.filter(isQuery);
}

export function mutations(spec: ApiSpec) {
    return spec.endpoints.filter((e) => !isQuery(e));
}

//Endpoint urls are templates sharing a {{baseUrl}}. Rather than emit that
//variable name into the client, the longest common prefix of the *resolved*
//urls becomes config.baseUrl and each endpoint keeps the remainder. That way
//a collection spanning two hosts still works - the prefix collapses to empty
//and every endpoint carries its full url instead.
export function commonPrefix(urls: string[]) {
    if (urls.length === 0) {
        return "";
    }

    let prefix = urls[0];

    for (const url of urls.slice(1)) {
        let i = 0;
        while (i < prefix.length && i < url.length && prefix[i] === url[i]) {
            i++;
        }
        prefix = prefix.slice(0, i);
    }

    //only ever cut on a path separator, so that /users and /userGroups do not
    //produce a baseUrl ending in "/user"
    const cut = prefix.lastIndexOf("/");
    prefix = cut === -1 ? "" : prefix.slice(0, cut);

    //"https:/" is what is left when two urls share nothing but their scheme
    return /^https?:\/\/[^/]+/.test(prefix) ? prefix : "";
}

//resolved url per endpoint, falling back to the raw template when a variable
//could not be resolved - the user then sees the {{var}} in the generated code
//and knows exactly what to fill in
export function resolvedUrls(spec: ApiSpec) {
    const out = new Map<string, string>();

    for (const e of spec.endpoints) {
        out.set(e.name, substitute(e.url, spec.vars));
    }

    return out;
}

export function baseUrl(spec: ApiSpec) {
    const urls = [...resolvedUrls(spec).values()].filter((u) => !unresolved(u).length);

    return commonPrefix(urls);
}

//what each endpoint contributes after config.baseUrl. Absolute when the
//endpoint does not sit under the common prefix, which is what makes a
//multi-host collection keep working.
export function pathOf(spec: ApiSpec, e: Endpoint) {
    const url = resolvedUrls(spec).get(e.name) as string;
    const base = baseUrl(spec);

    if (base && url.startsWith(base + "/")) {
        return url.slice(base.length);
    }

    return url;
}

//a template literal when the path carries :id placeholders, a plain string
//otherwise. segment() url-encodes, so an id containing a slash cannot escape
//into the path.
export function pathExpression(path: string, params: string[]) {
    if (params.length === 0) {
        return str(path);
    }

    let out = path;
    for (const name of params) {
        out = out.replace(`/:${name}`, "/${segment(params." + name + ")}");
    }

    return "`" + out + "`";
}

//path parameters are required, query parameters are not. Numbers are allowed
//alongside strings because ids are usually numbers and String() is applied
//before anything reaches the url.
export function paramsType(e: Endpoint, indent = "    ") {
    const lines = [
        ...e.path.map((p) => `${indent}${p}: string | number;`),
        ...e.query.map((q) => `${indent}${quoteKey(q)}?: string | number;`),
    ];

    return lines.join("\n");
}

export function hasParams(e: Endpoint) {
    return e.path.length > 0 || e.query.length > 0;
}

export function quoteKey(key: string) {
    return /^[A-Za-z_$][\w$]*$/.test(key) ? key : str(key);
}

//every emitted file uses single quotes, so string literals are built here
//rather than with JSON.stringify - a lone double-quoted path in the middle of
//otherwise single-quoted code reads like someone patched it by hand
export function str(value: string) {
    return `'${value.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
}

//params.page where the name allows it, params['odd-name'] where it does not
export function access(key: string) {
    return /^[A-Za-z_$][\w$]*$/.test(key) ? `params.${key}` : `params[${str(key)}]`;
}

//query parameters are forwarded by name; an undefined one is dropped by the
//client rather than sent as the string "undefined"
export function queryObject(e: Endpoint, indent: string) {
    if (e.query.length === 0) {
        return "";
    }

    const pairs = e.query.map((q) => `${indent}    ${quoteKey(q)}: ${access(q)},`).join("\n");

    return `\n${indent}query: {\n${pairs}\n${indent}},`;
}

//Headers worth keeping in the generated client: content negotiation and the
//like. Authorization is dropped even when it resolved, because config.ts is
//where a credential belongs and this file is destined for git. Anything still
//holding a {{var}} is dropped too - it would be sent literally.
export function staticHeaders(e: Endpoint, vars: Record<string, string>) {
    const out: Record<string, string> = {};

    for (const [key, template] of Object.entries(e.headers)) {
        if (/^(authorization|cookie|proxy-authorization)$/i.test(key)) {
            continue;
        }

        const value = substitute(template, vars);
        if (!unresolved(value).length) {
            out[key] = value;
        }
    }

    return out;
}

export function headersObject(e: Endpoint, vars: Record<string, string>, indent: string) {
    const headers = staticHeaders(e, vars);
    const keys = Object.keys(headers);

    if (keys.length === 0) {
        return "";
    }

    const pairs = keys.map((k) => `${indent}    ${quoteKey(k)}: ${str(headers[k])},`).join("\n");

    return `\n${indent}headers: {\n${pairs}\n${indent}},`;
}

//the banner every emitted file carries. Nothing in src/api/ except config.ts
//survives a regeneration, so it has to be obvious which file is which.
export function banner(spec: ApiSpec) {
    return `//Generated by create-tsreact from the Bruno collection in ${spec.dir}
//Do not edit: "npm run api:gen" overwrites this file.
//Response types were inferred from real responses captured in api/samples.json.`;
}
