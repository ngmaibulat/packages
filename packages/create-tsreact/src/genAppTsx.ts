import { hasParams, queries } from "@/bruno/emit.js";

import type { Opts } from "./cli.js";

//The service worker is cache-first, so registering it on localhost would let
//it serve a stale app.js and fight esbuild's live reload - and it would sit
//in front of the /esbuild event stream too. It is therefore registered only
//off localhost: build and serve public/ over https to exercise it.
const REGISTER = `

if ("serviceWorker" in navigator && !["localhost", "127.0.0.1"].includes(location.hostname)) {
    window.addEventListener("load", () => {
        navigator.serviceWorker.register("/sw.js").catch(() => {});
    });
}`;

//Tailwind and daisyUI are both tree-shaken against the markup, so the
//greeting has to actually use a class or the flag looks like it did nothing.
function body(o: Opts) {
    if (o.daisyui) {
        //the class list is written in the order sortTailwindcss produces
        //(layout after the component class), so the first "format:fix" on a
        //fresh scaffold is a no-op rather than a diff
        return `    return (
        <main className="card bg-base-100 mx-auto mt-8 max-w-lg shadow">
            <div className="card-body">
                <h1 className="card-title">Hello World from ${o.name} app!</h1>
                <button className="btn btn-primary">daisyUI button</button>
            </div>
        </main>
    );`;
    }

    //without a handwritten app.css there is no layout to inherit, so the
    //utilities here stand in for what #app used to do
    if (o.tailwind) {
        return `    return (
        <main className="mx-auto mt-8 max-w-lg border border-black p-4">
            <h1 className="text-2xl font-bold">Hello World from ${o.name} app!</h1>
        </main>
    );`;
    }

    return `    return <h1>Hello World from ${o.name} app!</h1>;`;
}

//A worked example rather than prose: the first query in the collection,
//written out as the call the user would make. Left commented so that the
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

export default function genAppTsx(o: Opts) {
    const register = o.template === "pwa" ? REGISTER : "";

    //TanStack Query needs one client for the whole tree. It is created at
    //module scope rather than inside App so that a re-render cannot throw the
    //cache away.
    const provider = o.api
        ? {
              imports: `import { QueryClient, QueryClientProvider } from "@tanstack/react-query";\n`,
              client: `\nconst queryClient = new QueryClient();\n`,
              open: `\n    <QueryClientProvider client={queryClient}>\n        `,
              //the trailing comma is oxfmt's trailingComma: "all" default,
              //applied to root.render's only argument now that it spans lines
              close: `\n    </QueryClientProvider>,\n`,
          }
        : { imports: "", client: "", open: "", close: "" };

    const tpl = `
${provider.imports}import { createRoot } from "react-dom/client";

import "./app.css";
${provider.client}
${example(o)}function App() {
${body(o)}
}

const container = document.getElementById("app")!;
const root = createRoot(container);
root.render(${provider.open}<App />${provider.close});${register}
`;

    return tpl;
}
