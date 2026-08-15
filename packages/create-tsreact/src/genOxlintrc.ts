import type { Opts } from "./cli.js";

//oxlint replaces eslint in every template. The rules ship in the binary, so
//unlike eslint there is no plugin package, no parser and no resolver to
//install - "oxlint" is the whole setup.
//
//One config serves all eight templates. "browser" is left on for expo too:
//an env only predefines globals, so the cost of an unused one is nothing,
//while dropping it would mean a second config to keep in step. The build
//outputs the esbuild templates write into public/ need no entry here either -
//.gitignore names them one by one, and oxlint honours it.
//
//NOTE: "plugins" overwrites the default set rather than adding to it, so
//typescript/unicorn/oxc are repeated here alongside react. Dropping one of
//them silently disables its rules.
//
//react/react-in-jsx-scope must be off. It is on by default with the react
//plugin and predates the automatic runtime; every template here generates
//"jsx": "react-jsx", which is exactly the setup where importing React is
//unnecessary - so leaving it on means a freshly scaffolded app lints dirty.
export default function genOxlintrc(o: Opts) {
    const rules = [`        "react/react-in-jsx-scope": "off"`];

    //expo-status-bar's "style" prop takes a string ("auto" | "light" | "dark"),
    //not a style object. The rule is a web-React rule and cannot know that, so
    //it fires on the StatusBar line every template of this kind generates.
    if (o.template === "expo") {
        rules.push(`        "react/style-prop-object": "off"`);
    }

    //sw.ts ends in "export {}" because isolatedModules refuses to compile a
    //file with no import or export (TS1208), and the worker genuinely has
    //nothing to export. The rule reads that as a stray empty specifier.
    if (o.template === "pwa") {
        rules.push(`        "unicorn/require-module-specifiers": "off"`);
    }

    const tpl = `
{
    "$schema": "./node_modules/oxlint/configuration_schema.json",
    "plugins": ["typescript", "unicorn", "oxc", "react"],
    "categories": {
        "correctness": "error",
        "suspicious": "warn"
    },
    "rules": {
${rules.join(",\n")}
    },
    "env": {
        "builtin": true,
        "browser": true
    },
    "ignorePatterns": ["dist", ".next", "out", "drizzle"]
}
`;

    return tpl;
}
