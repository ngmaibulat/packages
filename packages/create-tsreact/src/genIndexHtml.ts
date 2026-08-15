import type { Opts } from "./cli.js";

//The inline script is esbuild's own live-reload client. esbuild's serve mode
//hosts an event stream at /esbuild that emits "change" on every rebuild, so
//this needs no dependency - but it only fires when the dev script also passes
//--watch. A CSS-only change swaps the stylesheet in place; anything else
//reloads. The hostname guard plus onerror keep it inert (and quiet) when the
//built public/ folder is served by an ordinary static server.
export default function genIndexHtml(o: Opts) {
    //the manifest is what makes the app installable; theme-color paints the
    //browser and task-switcher chrome once it is
    const pwa =
        o.template === "pwa"
            ? `
    <link rel="manifest" href="manifest.webmanifest">
    <meta name="theme-color" content="#111827">
    <link rel="icon" href="icon.svg" type="image/svg+xml">
    <link rel="apple-touch-icon" href="icon-192.png">`
            : "";

    const tpl = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link rel="stylesheet" href="app.css">${pwa}
    <title>${o.name}</title>
</head>
<body>
    <div id="app"></div>
    <script type="module" src="./app.js"></script>
    <script>
        if (["localhost", "127.0.0.1"].includes(location.hostname)) {
            const es = new EventSource("/esbuild");
            es.onerror = () => es.close();
            es.addEventListener("change", (e) => {
                const { added, removed, updated } = JSON.parse(e.data);
                //dev builds with --sourcemap, so a css edit reports both
                ///app.css and /app.css.map - drop maps before deciding
                const changed = updated.filter((f) => !f.endsWith(".map"));

                if (!added.length && !removed.length && changed.length === 1) {
                    for (const link of document.getElementsByTagName("link")) {
                        const url = new URL(link.href);

                        if (url.host === location.host && url.pathname === changed[0]) {
                            const next = link.cloneNode();
                            next.href = changed[0] + "?" + Math.random().toString(36).slice(2);
                            next.onload = () => link.remove();
                            link.parentNode.insertBefore(next, link.nextSibling);
                            return;
                        }
                    }
                }

                location.reload();
            });
        }
    </script>
</body>
</html>
`;

    return tpl;
}
