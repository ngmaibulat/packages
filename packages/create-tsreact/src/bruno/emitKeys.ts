import { banner, hasParams, pascal, queries, str } from "./emit.js";
import type { ApiSpec } from "./spec.js";

//Query keys in one place so mutations can invalidate by endpoint without
//restating the literal. Each entry has an "all" prefix - what a mutation
//invalidates - and "of(params)", the exact key one query uses.
export default function keysTs(spec: ApiSpec) {
    const list = queries(spec);

    const imports = list.filter(hasParams).map((e) => `${pascal(e.name)}Params`);

    const types = imports.length ? `\nimport type { ${imports.join(", ")} } from './types';\n` : "";

    const entries = list.map((e) => {
        const key = str(e.name);
        const of = hasParams(e)
            ? `(params: ${pascal(e.name)}Params) => [${key}, params] as const`
            : `() => [${key}] as const`;

        return `    ${e.name}: {
        all: [${key}] as const,
        of: ${of},
    },`;
    });

    const tpl = `
${banner(spec)}
${types}
export const keys = {
${entries.join("\n")}
};
`;

    return tpl;
}
