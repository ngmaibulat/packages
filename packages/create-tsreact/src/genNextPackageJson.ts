import { scope } from "./cli.js";
import type { Opts } from "./cli.js";

//NOTE on the build script: Next 16 made Turbopack the default for both
//"next dev" and "next build", so there is no --turbopack flag to pass. Adding
//one back is harmless; adding a webpack key to next.config.ts is not - see
//genNextConfig.ts.
//
//A workspace child - the marker, api:gen and the format scripts live in the
//root manifest. The db:* scripts stay here, because drizzle-kit resolves
//drizzle.config.ts relative to the directory it runs in.
export default function genNextPackageJson(o: Opts) {
    const deps = [
        `"@libsql/client": "^0.17.0"`,
        `"drizzle-orm": "^0.45.0"`,
        `"next": "^16.0.0"`,
        `"react": "^19.2.0"`,
        `"react-dom": "^19.2.0"`,
    ];

    if (o.api) {
        deps.unshift(`"@tanstack/react-query": "^5.90.0"`);
    }

    const dev = [
        `"@tailwindcss/postcss": "^4.3.0"`,
        `"@types/node": "^26.1.0"`,
        `"@types/react": "^19.2.0"`,
        `"@types/react-dom": "^19.2.0"`,
        `"drizzle-kit": "^0.31.0"`,
        `"tailwindcss": "^4.3.0"`,
        `"typescript": "^7.0.0"`,
    ];

    if (o.daisyui) {
        dev.push(`"daisyui": "^5.7.0"`);
    }

    //db:push writes the schema straight into the local sqlite file, which is
    //the right loop while iterating. db:generate + db:migrate are the ones to
    //use once there is data worth keeping.
    const tpl = `
{
    "name": "${scope(o)}/web",
    "version": "0.0.1",
    "description": "Next.js app with Drizzle on SQLite",
    "private": true,
    "scripts": {
        "dev": "next dev",
        "build": "next build",
        "start": "next start",
        "typecheck": "tsc --noEmit",
        "db:push": "drizzle-kit push",
        "db:generate": "drizzle-kit generate",
        "db:migrate": "drizzle-kit migrate",
        "db:studio": "drizzle-kit studio"
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
