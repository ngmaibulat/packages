import { scope } from "./cli.js";
import type { Opts } from "./cli.js";

//package.json for the rsbuild-spa app. Separate from genVitePackageJson.ts
//rather than another branch inside it: the two share only the react/react-dom
//pair and the types, and every script and every devDependency differs.
//
//NOTE on the floors: @rsbuild/core, @rsbuild/plugin-react and
//@rsbuild/plugin-tailwindcss all version together on the 2.x line, and all
//three have peer ranges of "^2.0.0" on the core - so they must not be allowed
//to drift onto different majors. "^2.0.0" rather than the newest patch for the
//usual reason (see genRootPackageJson.ts): pnpm 11 refuses anything published
//inside minimumReleaseAge, and @rsbuild/core ships patches most weeks.
export default function genRsbuildPackageJson(o: Opts) {
    const deps = [`"react": "^19.2.0"`, `"react-dom": "^19.2.0"`];

    if (o.api) {
        deps.unshift(`"@tanstack/react-query": "^5.90.0"`);
    }

    const dev = [
        `"@rsbuild/core": "^2.0.0"`,
        `"@rsbuild/plugin-react": "^2.0.0"`,
        `"@rsbuild/plugin-tailwindcss": "^2.0.0"`,
        `"@types/react": "^19.2.0"`,
        `"@types/react-dom": "^19.2.0"`,
        `"tailwindcss": "^4.3.0"`,
        `"typescript": "^7.0.0"`,
    ];

    if (o.daisyui) {
        dev.push(`"daisyui": "^5.7.0"`);
    }

    //"build" typechecks first for the same reason vite-spa's does: rsbuild
    //transforms with SWC and never type-checks, so without this the only thing
    //standing between a type error and production is the editor. There is an
    //@rsbuild/plugin-type-check for doing it in-process, but that is a fourth
    //rsbuild package to keep on the same major for something tsc already does.
    const tpl = `
{
    "name": "${scope(o)}/web",
    "version": "0.0.1",
    "description": "Typescript/React SPA on Rsbuild",
    "private": true,
    "type": "module",
    "scripts": {
        "dev": "rsbuild dev",
        "build": "tsc --noEmit && rsbuild build",
        "preview": "rsbuild preview",
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
