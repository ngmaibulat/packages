import {
    banner,
    hasParams,
    headersObject,
    mutations,
    pascal,
    pathExpression,
    pathOf,
    queries,
    queryObject,
} from "./emit.js";
import type { ApiSpec, Endpoint } from "./spec.js";

//One hook per mutating endpoint. These are hooks rather than plain option
//factories because a mutation needs the query client in order to invalidate,
//and threading that through the caller would be worse than the small loss of
//composability.
//
//The default invalidation is every query in the same collection folder. That
//is a guess - a good one, since a folder in a Bruno collection almost always
//groups one resource - so the emitted onSuccess lists the keys explicitly and
//says so, rather than hiding a wildcard the user cannot see to change.

//four shapes, picked so the common cases read well: a mutation with only a
//body takes the body, one with only params takes the params, and only the
//endpoint that needs both pays for the wrapper object
function variables(e: Endpoint, name: string, body: boolean) {
    if (hasParams(e) && body) {
        return {
            type: `{ params: ${name}Params; body: ${name}Body }`,
            arg: "vars",
            params: "vars.params",
            body: "vars.body",
        };
    }
    if (hasParams(e)) {
        return {
            type: `${name}Params`,
            arg: "params",
            params: "params",
            body: undefined,
        };
    }
    if (body) {
        return {
            type: `${name}Body`,
            arg: "body",
            params: undefined,
            body: "body",
        };
    }
    return { type: "void", arg: "", params: undefined, body: undefined };
}

//"body: body" reads like a mistake; the shorthand is what a person
//would have written
function bodyField(expr: string | undefined) {
    if (!expr) {
        return "";
    }

    return `\n                ${expr === "body" ? "body" : `body: ${expr}`},`;
}

export default function mutationsTs(spec: ApiSpec) {
    const list = mutations(spec);
    const invalidate = queries(spec);

    const needsSegment = list.some((e) => e.path.length > 0);
    const typeImports: string[] = [];

    const fns = list.map((e) => {
        const name = pascal(e.name);
        const hasBody = Boolean(e.body);
        const vars = variables(e, name, hasBody);

        typeImports.push(`${name}Response`);
        if (hasParams(e)) {
            typeImports.push(`${name}Params`);
        }
        if (hasBody) {
            typeImports.push(`${name}Body`);
        }

        //the query object is written in terms of a "params" identifier, so
        //give it one when the variables arrived wrapped
        const unwrap =
            vars.params && vars.params !== "params"
                ? `\n            const params = ${vars.params};\n`
                : "";

        const path = pathExpression(pathOf(spec, e), e.path);

        const siblings = invalidate.filter((q) => q.folder === e.folder);
        const targets = siblings.length ? siblings : invalidate;
        const scope = siblings.length
            ? `every query in the '${e.folder || "root"}' folder`
            : "every query in the collection";

        const onSuccess = targets.length
            ? `
        onSuccess: () => {
            //${scope} - edit this list to taste
${targets
    .map((q) => `            client.invalidateQueries({ queryKey: keys.${q.name}.all });`)
    .join("\n")}
        },`
            : "";

        const arrow = unwrap
            ? `(${vars.arg}: ${vars.type}) => {${unwrap}
            return request<${name}Response>({
                method: '${e.method.toUpperCase()}',
                path: ${path},${queryObject(
                    e,
                    "                ",
                )}${headersObject(e, spec.vars, "                ")}${bodyField(vars.body)}
            });
        }`
            : `(${vars.arg ? `${vars.arg}: ${vars.type}` : ""}) =>
            request<${name}Response>({
                method: '${e.method.toUpperCase()}',
                path: ${path},${queryObject(
                    e,
                    "                ",
                )}${headersObject(e, spec.vars, "                ")}${bodyField(vars.body)}
            })`;

        return `//${e.method.toUpperCase()} ${e.url}
export function use${name}() {
    const client = useQueryClient();

    return useMutation({
        mutationFn: ${arrow},${onSuccess}
    });
}`;
    });

    const unique = [...new Set(typeImports)];

    const tpl = `
${banner(spec)}

import { useMutation, useQueryClient } from '@tanstack/react-query';

import { request${needsSegment ? ", segment" : ""} } from './client';${
        invalidate.length ? `\nimport { keys } from './keys';` : ""
    }
import type { ${unique.join(", ")} } from './types';

${fns.join("\n\n")}
`;

    return tpl;
}
