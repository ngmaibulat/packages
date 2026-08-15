import { banner, hasParams, isQuery, paramsType, pascal } from "./emit.js";
import { infer } from "./infer.js";
import { substitute } from "./spec.js";
import type { ApiSpec, Endpoint } from "./spec.js";

//The response types here are the whole point of the feature: they describe
//what the API actually returned when the collection was executed, not what
//somebody wrote down. An endpoint that was not sampled - a mutation, or one
//that was unreachable - is typed unknown, which is honest and still compiles.

//A body:json block is a template, so it is usually not valid JSON. Variables
//are substituted first; any that are left become a string placeholder, which
//is what they would serialise to anyway. Anything still unparseable falls
//back to unknown rather than failing the scaffold.
function inferBody(e: Endpoint, vars: Record<string, string>) {
    if (!e.body) {
        return undefined;
    }

    const substituted = substitute(e.body, vars);

    for (const text of [substituted, substituted.replace(/\{\{[\w.-]+\}\}/g, "x")]) {
        try {
            return infer([JSON.parse(text)]);
        } catch {
            //try the next fallback
        }
    }

    return "unknown";
}

function responseType(spec: ApiSpec, e: Endpoint) {
    const sample = spec.samples[e.name];

    if (!sample || "skipped" in sample) {
        const why = sample ? sample.skipped : "no sample";
        return `//not sampled: ${why}\nexport type ${pascal(e.name)}Response = unknown;`;
    }

    return `export type ${pascal(e.name)}Response = ${infer([sample.body])};`;
}

export default function typesTs(spec: ApiSpec) {
    const blocks: string[] = [];

    for (const e of spec.endpoints) {
        const name = pascal(e.name);
        const parts = [`//${e.method.toUpperCase()} ${e.url}${e.folder ? `  (${e.folder})` : ""}`];

        if (hasParams(e)) {
            parts.push(`export type ${name}Params = {\n${paramsType(e)}\n};`);
        }

        const body = isQuery(e) ? undefined : inferBody(e, spec.vars);
        if (body) {
            parts.push(`export type ${name}Body = ${body};`);
        }

        parts.push(responseType(spec, e));
        blocks.push(parts.join("\n"));
    }

    const tpl = `
${banner(spec)}

${blocks.join("\n\n")}
`;

    return tpl;
}
