import type { Opts } from "./cli.js";

//Without this, "tsc --noEmit" fails on the CSS import in app.tsx/popup.tsx
//with TS2307. esbuild resolves it fine; TypeScript needs to be told.
//
//Vite ships those declarations itself, along with import.meta.env and the
//?url / ?raw import suffixes, so the vite templates reference its types
//instead of redeclaring a subset of them. The file is keyed as
//src/vite-env.d.ts there, which is the name vite's own scaffolder uses.
export default function genEnvDts(o: Opts) {
    const vite = o.template === "vite-spa" || o.template === "fastify-react";

    const tpl = vite
        ? `
/// <reference types="vite/client" />
`
        : `
declare module "*.css";
`;

    return tpl;
}
