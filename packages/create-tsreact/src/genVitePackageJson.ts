import { scope } from "./cli.js";
import type { Opts } from "./cli.js";

//package.json for the web app of both vite-spa and fastify-react. They differ
//only in the description now - both are workspace children under apps/web,
//and the marker, api:gen and format scripts live in the root manifest either
//way. See genRootPackageJson.ts.
//
//NOTE on vite 8: it depends on rolldown directly, so there is no
//"vite": "npm:rolldown-vite@..." alias to add - that is the vite 7 recipe and
//using it here would downgrade the bundler. For the same reason the react
//plugin is @vitejs/plugin-react, not @vitejs/plugin-react-oxc: oxc is already
//vite 8's transform, and the -oxc package peers on vite 6/7 only.
export default function genVitePackageJson(o: Opts) {
    const workspace = o.template === "fastify-react";

    const deps = [`"react": "^19.2.0"`, `"react-dom": "^19.2.0"`];

    if (o.api) {
        deps.unshift(`"@tanstack/react-query": "^5.90.0"`);
    }

    const dev = [
        `"@tailwindcss/vite": "^4.3.0"`,
        `"@types/react": "^19.2.0"`,
        `"@types/react-dom": "^19.2.0"`,
        `"@vitejs/plugin-react": "^6.0.0"`,
        `"tailwindcss": "^4.3.0"`,
        `"typescript": "^7.0.0"`,
        `"vite": "^8.0.0"`,
    ];

    if (o.daisyui) {
        dev.push(`"daisyui": "^5.7.0"`);
    }

    const description = workspace ? "Web client" : "Typescript/React SPA on Vite";

    //"build" typechecks first on purpose: vite transpiles with oxc and never
    //type-checks, so without this the only thing standing between a type
    //error and production is the editor.
    const tpl = `
{
    "name": "${scope(o)}/web",
    "version": "0.0.1",
    "description": "${description}",
    "private": true,
    "type": "module",
    "scripts": {
        "dev": "vite",
        "build": "tsc --noEmit && vite build",
        "preview": "vite preview",
        "typecheck": "tsc --noEmit"
    },
    "keywords": [
        "created by tsreact"
    ],
    "author": "",
    "license": "MIT",
    "dependencies": {
        ${deps.join(",\n        ")}
    },
    "devDependencies": {
        ${dev.join(",\n        ")}
    }
}
`;

    return tpl;
}
