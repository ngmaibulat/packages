import { hasParams, queries } from "@/bruno/emit.js";

import type { Opts } from "./cli.js";

//Tailwind is tree-shaken against the markup, so the greeting has to actually
//use classes or the template looks like tailwind did nothing. daisyUI adds a
//component class on top, for the same reason.
function body(o: Opts) {
    if (o.daisyui) {
        return `        <main className="card mx-auto mt-8 max-w-lg bg-base-100 shadow">
            <div className="card-body">
                <h1 className="card-title">Hello World from ${o.name} app!</h1>
                <button className="btn btn-primary">daisyUI button</button>
            </div>
        </main>`;
    }

    return `        <main className="mx-auto mt-8 max-w-lg rounded border border-slate-300 p-4">
            <h1 className="text-2xl font-bold">Hello World from ${o.name} app!</h1>
        </main>`;
}

//A worked example rather than prose: the first query in the collection,
//written out as the call the user would make. Left commented so the
//scaffolded app still builds when that query needs parameters nobody has
//supplied yet, and so the greeting stays the thing you see first.
function example(o: Opts) {
    const first = o.api && queries(o.api)[0];

    if (!first) {
        return "";
    }

    const name = first.name;
    const args = hasParams(first)
        ? `{ /* ${name[0].toUpperCase()}${name.slice(1)}Params, see ./api/types */ }`
        : "";

    return `//Your API is wired up. To read from it:
//
//    import { useQuery } from "@tanstack/react-query";
//    import { ${name}Query } from "./api";
//
//    const { data, isPending, error } = useQuery(${name}Query(${args}));

`;
}

//Exports one component and nothing else, which is what keeps vite's react
//fast refresh able to swap this module without reloading the page.
export default function genViteAppTsx(o: Opts) {
    const tpl = `
${example(o)}export default function App() {
    return (
${body(o)}
    );
}
`;

    return tpl;
}
