import { scope } from "./cli.js";
import type { Opts } from "./cli.js";

//These versions mirror the published expo-template-blank-typescript, which is
//what "npx create-expo-app --template blank-typescript" writes. Do not
//loosen them: expo pins react and react-native exactly per SDK, and
//react-native@latest is already ahead of what SDK 57 accepts, so a caret
//range here would produce an install that metro refuses to bundle.
//
//typescript is ~6.0.3 rather than the ^7 the browser templates get, for the
//same reason - that is the version expo's own tsconfig.base is built against.
//
//"expo install --fix" realigns everything after an SDK bump.
//
//@tanstack/react-query is the one dependency here that expo does not pin, and
//it is caret-ranged like the browser templates: it is plain TypeScript with a
//react peer, so it has no SDK-specific build the way react-native does.
//
//NOTE on the expo range: ~57.0.0 rather than ~57.0.12, for the reason spelled
//out in genRootPackageJson.ts. Pinning the newest patch means pnpm has
//nothing older to fall back to when minimumReleaseAge rejects it, and expo
//publishes its whole dependency tree on the same day - so a floor at the
//latest patch makes "pnpm install" fail for a week after every SDK release.
//The tilde still keeps this inside SDK 57.
export default function genExpoPkgJson(o: Opts) {
    const deps = [
        `"expo": "~57.0.0"`,
        `"expo-status-bar": "~57.0.1"`,
        `"react": "19.2.3"`,
        `"react-native": "0.86.2"`,
    ];

    if (o.api) {
        deps.unshift(`"@tanstack/react-query": "^5.90.0"`);
    }

    //a workspace child - the marker, api:gen and the format scripts live in
    //the root manifest. See genRootPackageJson.ts.
    //
    //Expo's own commands still run here rather than at the root, because the
    //Metro bundler resolves from the directory it is started in. The root
    //scripts forward to them with "pnpm -r run start".
    const tpl = `
{
    "name": "${scope(o)}/mobile",
    "version": "1.0.0",
    "description": "React Native application on Expo",
    "private": true,
    "main": "index.ts",
    "scripts": {
        "start": "expo start",
        "android": "expo start --android",
        "ios": "expo start --ios",
        "web": "expo start --web",
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
        "@types/react": "~19.2.2",
        "typescript": "~6.0.3"
    }
}
`;

    return tpl;
}
