import type { Opts } from "./cli.js";

export default function genPopupTsx(o: Opts) {
    //a popup sizes itself to its content, so the explicit width that
    //genPopupCss supplies has to come from a class once tailwind owns the
    //stylesheet - without it the popup collapses to a sliver
    const main = o.tailwind ? ` className="w-60 p-4"` : "";
    const h1 = o.tailwind ? ` className="mb-3 text-base font-semibold"` : "";
    const button = o.daisyui ? ` className="btn btn-primary btn-sm"` : "";

    //oxfmt wraps at 100 columns, and the daisyUI class list pushes this one
    //line to 104 - so with the flag on, the element has to be emitted already
    //broken or "format:check" fails on a scaffold nobody has touched. Without
    //it the line is 69 columns and the formatter would pull a broken element
    //back onto one line, so the short form is equally load-bearing.
    const buttonEl = o.daisyui
        ? `<button${button} onClick={onClick}>
                clicked {clicks} times
            </button>`
        : `<button onClick={onClick}>clicked {clicks} times</button>`;

    //A popup is torn down every time it closes, so its query cache starts
    //empty each time. That is fine for the popup's own reads; it is also the
    //reason a real extension usually fetches from the background worker and
    //messages the result across, which is a decision left to the user.
    const query = o.api
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
${query.imports}import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

import "./popup.css";
${query.client}
function Popup() {
    const [clicks, setClicks] = useState(0);

    //popup state is thrown away every time the popup closes, so keep it in
    //chrome.storage (declared in manifest.json under "permissions")
    useEffect(() => {
        chrome.storage.local
            .get<{ clicks?: number }>("clicks")
            .then((v) => setClicks(v.clicks ?? 0));
    }, []);

    function onClick() {
        const next = clicks + 1;
        setClicks(next);
        chrome.storage.local.set({ clicks: next });
    }

    return (
        <main${main}>
            <h1${h1}>${o.name}</h1>
            ${buttonEl}
        </main>
    );
}

const container = document.getElementById("app")!;
const root = createRoot(container);
root.render(${query.open}<Popup />${query.close});
`;

    return tpl;
}
