import type { Opts } from "./cli.js";

//oxfmt replaces prettier in every template.
//
//Indentation, line endings and the final newline are deliberately absent:
//oxfmt reads .editorconfig, where they come from indent_size / indent_style /
//end_of_line. That is the same division of labour prettier had with an empty
//.prettierrc.json in these templates before - and it is why the format scripts
//point at src/ rather than at the project root. Formatting the root would
//rewrite the generated json files to .editorconfig's 2-space setting on the
//first "npm run format:fix".
//
//What is set here is the part .editorconfig cannot express:
//
//  sortTailwindcss  the built-in equivalent of prettier-plugin-tailwindcss,
//                   so class lists stay in a canonical order. Only emitted
//                   with tailwind: it is dead weight in a template that has
//                   no class attributes to sort, and expo has no CSS at all.
//  sortImports      the generated sources are already written in the order
//                   this produces, so turning it on costs no churn on the
//                   first "npm run format:fix".
//
//src/api/ is ignored because "npm run api:gen" rewrites those files from the
//Bruno collection every time it runs - formatting them is churn that comes
//straight back on the next regeneration. Same reasoning as packages/cli/bin
//being in this CLI's own .oxfmtrc.json.
//
//Both paths are listed so one config serves the flat layout and the
//workspace, and the second is "apps/*/src/api" rather than "apps/web/src/api"
//because the client follows the primary app: apps/extension for the extension
//template, apps/mobile for expo. oxfmt ignores a pattern matching nothing.
export default function genOxfmtrc(o: Opts) {
    const tailwind = o.tailwind ? `\n    "sortTailwindcss": true,` : "";

    const tpl = `
{
    "$schema": "./node_modules/oxfmt/configuration_schema.json",${tailwind}
    "sortImports": true,
    "ignorePatterns": ["src/api", "apps/*/src/api"]
}
`;

    return tpl;
}
