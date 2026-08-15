import type { Opts } from "./cli.js";

//Vite splits what the esbuild templates keep in one app.tsx: main.tsx mounts,
//App.tsx renders. Keeping that split matters because vite's react plugin only
//gives a module fast refresh when it exports components and nothing else -
//a file that also calls createRoot forces a full reload on every edit.
export default function genMainTsx(o: Opts) {
    //TanStack Query needs one client for the whole tree. It is created at
    //module scope rather than inside a component so that a re-render cannot
    //throw the cache away.
    const provider = o.api
        ? {
              imports: `import { QueryClient, QueryClientProvider } from "@tanstack/react-query";\n`,
              client: `\nconst queryClient = new QueryClient();\n`,
              open: `<QueryClientProvider client={queryClient}>\n            `,
              close: `\n        </QueryClientProvider>`,
          }
        : { imports: "", client: "", open: "", close: "" };

    const tpl = `
${provider.imports}import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import App from "./App";

import "./index.css";
${provider.client}
const container = document.getElementById("root")!;

createRoot(container).render(
    <StrictMode>
        ${provider.open}<App />${provider.close}
    </StrictMode>,
);
`;

    return tpl;
}
