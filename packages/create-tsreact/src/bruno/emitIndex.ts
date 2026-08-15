import { banner, mutations, queries } from "./emit.js";
import type { ApiSpec } from "./spec.js";

//A barrel so callers write `from './api'` rather than reaching into four
//files. queries.ts and mutations.ts are only emitted when the collection has
//something to put in them, so the re-exports are conditional too - a dangling
//export would break the build of an app whose collection is all GETs.
export default function indexTs(spec: ApiSpec) {
    const lines = ["export * from './client';", "export * from './config';"];

    if (queries(spec).length) {
        lines.push("export * from './keys';", "export * from './queries';");
    }
    if (mutations(spec).length) {
        lines.push("export * from './mutations';");
    }

    lines.push("export type * from './types';");

    const tpl = `
${banner(spec)}

${lines.join("\n")}
`;

    return tpl;
}
