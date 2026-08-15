import icon from "@/png/icon.js";

import type { Files, Opts } from "../cli.js";
import genIconSvg from "../genIconSvg.js";
import genSwTs from "../genSwTs.js";
import genSwTsConfig from "../genSwTsConfig.js";
import genWebManifest from "../genWebManifest.js";
import react from "./react.js";

//"template X is template Y plus some files" - everything that *differs*
//inside a shared file is branched on o.template inside that file's generator
//instead. All the additions land in the web app rather than at the workspace
//root, because they are app content: icons, the worker and its tsconfig.
export default function pwa(o: Opts): Files {
    return {
        ...react(o),
        "apps/web/tsconfig.sw.json": genSwTsConfig(),
        "apps/web/public/manifest.webmanifest": genWebManifest(o.name),
        "apps/web/public/icon.svg": genIconSvg(o.name),
        "apps/web/public/icon-192.png": icon(o.name, 192),
        "apps/web/public/icon-512.png": icon(o.name, 512),
        "apps/web/public/icon-maskable-512.png": icon(o.name, 512, true),
        "apps/web/src/sw.ts": genSwTs(),
    };
}
