import {
    banner,
    hasParams,
    headersObject,
    pascal,
    pathExpression,
    pathOf,
    queries,
    queryObject,
} from "./emit.js";
import type { ApiSpec } from "./spec.js";

//One queryOptions factory per safe endpoint. Returning options rather than
//calling useQuery keeps them composable: the caller decides between useQuery,
//useSuspenseQuery, prefetchQuery or queryClient.ensureQueryData, and can
//spread in staleTime or enabled without the generator having to guess.
export default function queriesTs(spec: ApiSpec) {
    const list = queries(spec);

    const needsSegment = list.some((e) => e.path.length > 0);
    const typeImports = list.flatMap((e) => [
        `${pascal(e.name)}Response`,
        ...(hasParams(e) ? [`${pascal(e.name)}Params`] : []),
    ]);

    const fns = list.map((e) => {
        const name = pascal(e.name);
        const arg = hasParams(e) ? `params: ${name}Params` : "";
        const path = pathExpression(pathOf(spec, e), e.path);

        return `export function ${e.name}Query(${arg}) {
    return queryOptions({
        queryKey: keys.${e.name}.of(${hasParams(e) ? "params" : ""}),
        queryFn: ({ signal }) =>
            request<${name}Response>({
                method: '${e.method.toUpperCase()}',
                path: ${path},${queryObject(
                    e,
                    "                ",
                )}${headersObject(e, spec.vars, "                ")}
                signal,
            }),
    });
}`;
    });

    const tpl = `
${banner(spec)}

import { queryOptions } from '@tanstack/react-query';

import { request${needsSegment ? ", segment" : ""} } from './client';
import { keys } from './keys';
import type { ${typeImports.join(", ")} } from './types';

${fns.join("\n\n")}
`;

    return tpl;
}
