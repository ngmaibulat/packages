import type { Opts } from "./cli.js";

//Vite's entry html lives at the project root, not in public/ - it is a build
//input that vite rewrites, and anything in public/ is copied through
//untouched instead. The script tag points at the TypeScript source directly;
//vite resolves it in dev and replaces it with the hashed bundle on build.
//
//There is no live-reload snippet here, unlike the esbuild templates: vite
//injects its own HMR client into this file during dev.
export default function genViteIndexHtml(o: Opts) {
    const tpl = `
<!doctype html>
<html lang="en">
    <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>${o.name}</title>
    </head>
    <body>
        <div id="root"></div>
        <script type="module" src="/src/main.tsx"></script>
    </body>
</html>
`;

    return tpl;
}
