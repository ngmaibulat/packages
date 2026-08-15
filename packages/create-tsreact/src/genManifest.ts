import { origins } from "@/bruno/spec.js";

import type { Opts } from "./cli.js";

//"name" and "version" are required - Chrome refuses to load the extension
//without them. Paths are relative to this file, so public/ is the folder to
//pick in "Load unpacked", not the project root.
//
//"background" has no "type": "module" on purpose: that makes the service
//worker a classic script, which is what --format=iife produces.
export default function genManifest(o: Opts) {
    //MV3 blocks cross-origin fetch from a popup or background worker unless
    //the origin is declared here, and it fails as an opaque network error
    //rather than a CORS message - so a generated client that is not listed
    //looks like a broken API rather than a missing permission.
    const hosts = o.api ? origins(o.api) : [];
    const permissions = hosts.length
        ? `,\n    "host_permissions": [${hosts.map((h) => `"${h}"`).join(", ")}]`
        : "";

    const tpl = `
{
    "manifest_version": 3,
    "name": "${o.name}",
    "version": "0.0.1",
    "description": "Chrome MV3 extension in Typescript/React",
    "action": {
        "default_popup": "popup.html",
        "default_title": "${o.name}"
    },
    "background": {
        "service_worker": "background.js"
    },
    "content_scripts": [
        {
            "matches": ["<all_urls>"],
            "js": ["content.js"]
        }
    ],
    "permissions": ["storage"]${permissions}
}
`;

    return tpl;
}
