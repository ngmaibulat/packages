import fs from "fs";
import path from "path";

import { CliError } from "./error.js";
import { dict, entries, list, parseBru, text } from "./parse.js";
import { METHODS } from "./spec.js";
import type { ApiSpec, Endpoint, Method } from "./spec.js";

//Reads a Bruno collection off disk and produces the IR. Deliberately offline
//and free of process.env: everything here is a pure function of the files, so
//the same collection always yields the same endpoint list. Secrets and the
//network are sample.ts's problem.

const IGNORED = new Set(["node_modules", "environments"]);

//collection.bru and folder.bru carry settings, not requests
const NOT_REQUESTS = new Set(["collection.bru", "folder.bru"]);

//all=true keeps folder.bru and collection.bru, which carry settings rather
//than requests - readCollection has no use for them, but the copy made into
//the scaffolded app has to be faithful
function walk(dir: string, base = "", all = false): { file: string; folder: string }[] {
    const out: { file: string; folder: string }[] = [];

    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name.startsWith(".") || IGNORED.has(entry.name)) {
            continue;
        }

        const full = path.join(dir, entry.name);

        if (entry.isDirectory()) {
            out.push(...walk(full, base ? `${base}/${entry.name}` : entry.name, all));
            continue;
        }

        if (entry.name.endsWith(".bru") && (all || !NOT_REQUESTS.has(entry.name))) {
            out.push({ file: full, folder: base });
        }
    }

    return out;
}

//"List users" -> "listUsers". Leading digits get an underscore rather than
//being dropped, so two endpoints called "1st" and "2nd" stay distinct.
export function slug(name: string) {
    const words = name.split(/[^A-Za-z0-9]+/).filter(Boolean);

    if (words.length === 0) {
        return "_";
    }

    const joined = words
        .map((w, i) =>
            i === 0 ? w[0].toLowerCase() + w.slice(1) : w[0].toUpperCase() + w.slice(1),
        )
        .join("");

    return /^[0-9]/.test(joined) ? `_${joined}` : joined;
}

//:id placeholders, in the order they appear. Anchored on the preceding slash
//so that a port ("//host:3000/x") is not mistaken for a path parameter.
export function pathParams(url: string) {
    return [...url.matchAll(/\/:(\w+)/g)].map((m) => m[1]);
}

//Bruno mirrors the url's query string into params:query, so taking both and
//letting the block win avoids sending a parameter twice. The url is stored
//without its query string; the generated client rebuilds it from the params.
function splitQuery(url: string) {
    const at = url.indexOf("?");

    if (at === -1) {
        return { url, keys: [] as string[] };
    }

    const keys = url
        .slice(at + 1)
        .split("&")
        .map((pair) => pair.split("=")[0].trim())
        .filter(Boolean);

    return { url: url.slice(0, at), keys };
}

//the same query string again, as values this time - only the sampler uses
//these, to build a url that the real API will actually answer
function splitQueryValues(url: string) {
    const at = url.indexOf("?");
    const out: Record<string, string> = {};

    if (at === -1) {
        return out;
    }

    for (const pair of url.slice(at + 1).split("&")) {
        const eq = pair.indexOf("=");
        if (eq > 0) {
            out[pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim();
        }
    }

    return out;
}

function readRequest(file: string, folder: string): Endpoint | undefined {
    const blocks = parseBru(fs.readFileSync(file, "utf8"), file);

    const method = METHODS.find((m) => blocks.has(m));
    if (!method) {
        //a .bru file with no http block is a folder setting or a draft, not
        //something we can generate a call for
        return undefined;
    }

    const call = dict(blocks.get(method));
    const meta = dict(blocks.get("meta"));

    const raw = call.url?.trim();
    if (!raw) {
        throw new CliError(`${file}: the ${method} block has no url`);
    }

    const { url, keys } = splitQuery(raw);

    const query = new Set(keys);
    for (const e of entries(blocks.get("params:query"))) {
        if (e.enabled) {
            query.add(e.key);
        } else {
            query.delete(e.key);
        }
    }

    const name = slug(meta.name || path.basename(file, ".bru"));
    const queryValues = dict(blocks.get("params:query"));

    for (const [key, value] of Object.entries(splitQueryValues(raw))) {
        queryValues[key] ??= value;
    }

    return {
        name,
        method: method as Method,
        url,
        path: pathParams(url),
        query: [...query],
        pathValues: dict(blocks.get("params:path")),
        queryValues,
        headers: dict(blocks.get("headers")),
        body: text(blocks.get("body:json")),
        auth: call.auth && call.auth !== "none" ? call.auth : undefined,
        folder,
        seq: Number(meta.seq) || 0,
    };
}

//collisions are broken by folder first, then by seq. Two requests genuinely
//called the same thing in the same folder is a collection bug, but erroring
//out of a scaffold over it would be worse than emitting listUsers2.
function dedupe(endpoints: Endpoint[]) {
    const taken = new Set<string>();

    for (const e of endpoints) {
        if (!taken.has(e.name)) {
            taken.add(e.name);
            continue;
        }

        const prefixed = slug(`${e.folder} ${e.name}`);
        let next = taken.has(prefixed) ? `${prefixed}${e.seq}` : prefixed;

        for (let n = 2; taken.has(next); n++) {
            next = `${prefixed}${n}`;
        }

        e.name = next;
        taken.add(next);
    }
}

function readEnvironment(dir: string, wanted: string | undefined) {
    const envDir = path.join(dir, "environments");

    if (!fs.existsSync(envDir)) {
        if (wanted) {
            throw new CliError(
                `No environments/ directory in ${dir}, so --api-env ${wanted} cannot be resolved`,
            );
        }
        return { vars: {}, secrets: [] as string[] };
    }

    const files = fs
        .readdirSync(envDir)
        .filter((f) => f.endsWith(".bru"))
        .sort();

    if (files.length === 0) {
        return { vars: {}, secrets: [] as string[] };
    }

    const names = files.map((f) => path.basename(f, ".bru"));

    //picking one at random when there are several would silently point the
    //generated client at staging half the time
    if (!wanted && files.length > 1) {
        throw new CliError(
            `${dir} has several environments - pick one with --api-env: ${names.join(", ")}`,
        );
    }

    const chosen = wanted ?? names[0];
    if (!names.includes(chosen)) {
        throw new CliError(`Unknown environment "${chosen}". Available: ${names.join(", ")}`);
    }

    const blocks = parseBru(
        fs.readFileSync(path.join(envDir, `${chosen}.bru`), "utf8"),
        path.join(envDir, `${chosen}.bru`),
    );

    return {
        vars: dict(blocks.get("vars")),
        //Bruno stores only the *names* of secrets in the file - the values
        //live in its own store, so they can only come from the environment
        secrets: list(blocks.get("vars:secret")),
    };
}

//The scaffolded app gets its own copy of the collection under api/, so that
//"npm run api:gen" keeps working without the directory the user happened to
//point --api at still being there. Only .bru files and bruno.json are copied:
//everything else in a Bruno directory is that app's local state.
//
//Environment files come along too. They hold the *names* of secrets but never
//their values, so nothing sensitive is copied.
export function collectionFiles(dir: string) {
    const out: Record<string, string> = {};

    const add = (from: string, rel: string) => {
        out[rel] = fs.readFileSync(from, "utf8");
    };

    const brunoJson = path.join(dir, "bruno.json");
    if (fs.existsSync(brunoJson)) {
        add(brunoJson, "bruno.json");
    }

    const envDir = path.join(dir, "environments");
    if (fs.existsSync(envDir)) {
        for (const f of fs.readdirSync(envDir)) {
            if (f.endsWith(".bru")) {
                add(path.join(envDir, f), `environments/${f}`);
            }
        }
    }

    for (const { file } of walk(dir, "", true)) {
        add(file, path.relative(dir, file).split(path.sep).join("/"));
    }

    return out;
}

export function readCollection(
    dir: string,
    env: string | undefined,
): Omit<ApiSpec, "dir" | "samples"> {
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
        throw new CliError(`Not a Bruno collection directory: ${dir}`);
    }

    let collection = path.basename(path.resolve(dir));
    const brunoJson = path.join(dir, "bruno.json");

    if (fs.existsSync(brunoJson)) {
        try {
            const parsed = JSON.parse(fs.readFileSync(brunoJson, "utf8"));
            collection = parsed.name || collection;
        } catch (err) {
            throw new CliError(`${brunoJson} is not valid json: ${(err as Error).message}`);
        }
    }

    const endpoints: Endpoint[] = [];

    for (const { file, folder } of walk(dir)) {
        const endpoint = readRequest(file, folder);
        if (endpoint) {
            endpoints.push(endpoint);
        }
    }

    if (endpoints.length === 0) {
        throw new CliError(`No requests found in ${dir}`);
    }

    //stable output regardless of readdir order, so regenerating produces no
    //spurious diff
    endpoints.sort(
        (a, b) => a.folder.localeCompare(b.folder) || a.seq - b.seq || a.name.localeCompare(b.name),
    );

    dedupe(endpoints);

    return { collection, ...readEnvironment(dir, env), endpoints };
}
