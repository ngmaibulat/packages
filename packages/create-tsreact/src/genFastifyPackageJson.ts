import { scope } from "./cli.js";
import type { Opts } from "./cli.js";

//The API workspace. No oxlint/oxfmt entries: those run once from the root
//across both workspaces, so duplicating them here would mean two configs to
//keep in step for one codebase.
//
//"tsx watch" rather than "node --watch": node can run TypeScript directly
//from 22.6, but only with type stripping, which chokes on the enum and
//parameter-decorator syntax fastify plugins still ship in their own sources.
export default function genFastifyPackageJson(o: Opts) {
    const tpl = `
{
    "name": "${scope(o)}/server",
    "version": "0.0.1",
    "description": "Fastify API",
    "private": true,
    "type": "module",
    "main": "dist/index.js",
    "scripts": {
        "dev": "tsx watch src/index.ts",
        "build": "rolldown -c",
        "start": "node dist/index.js",
        "typecheck": "tsc --noEmit"
    },
    "license": "MIT",
    "dependencies": {
        "@fastify/cors": "^11.3.0",
        "fastify": "^5.11.0"
    },
    "devDependencies": {
        "@types/node": "^26.1.0",
        "rolldown": "^1.2.0",
        "tsx": "^4.23.0",
        "typescript": "^7.0.0"
    }
}
`;

    return tpl;
}
