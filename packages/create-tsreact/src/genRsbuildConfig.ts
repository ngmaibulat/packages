import type { Opts } from "./cli.js";

//The rsbuild equivalent of genViteConfig.ts. Three things here look removable
//and are not:
//
//  source.entry   rsbuild's default entry is ./src/index.tsx, and this names
//                 ./src/main.tsx instead. That is what lets this template
//                 reuse genMainTsx.ts unchanged - the same module serves
//                 vite-spa and fastify-react, and renaming its output to suit
//                 rsbuild's default would fork one generator into two.
//
//  html.title     there is no index.html in this template. Rsbuild generates
//                 the document from its own built-in template (which already
//                 carries <div id="root">, the mount point main.tsx looks
//                 for), so the app name has to be handed to it here or every
//                 scaffolded app is titled "Rsbuild App".
//
//  pluginTailwindcss  the official plugin, and deliberately not the
//                 @tailwindcss/postcss route the next template uses: this one
//                 does not run tailwind through postcss at all, so there is no
//                 postcss.config.mjs here and adding one would take tailwind
//                 off the fast path. Same trade as @tailwindcss/vite.
//
//Fast refresh needs no configuration - pluginReact() registers it for dev
//builds by default. What makes it effective is the main.tsx / App.tsx split
//genMainTsx.ts already produces: a module that also calls createRoot forces a
//full reload on every edit rather than swapping the component.
export default function genRsbuildConfig(o: Opts) {
    const tpl = `
import { defineConfig } from "@rsbuild/core";
import { pluginReact } from "@rsbuild/plugin-react";
import { pluginTailwindcss } from "@rsbuild/plugin-tailwindcss";

export default defineConfig({
    plugins: [pluginReact(), pluginTailwindcss()],
    source: {
        entry: {
            index: "./src/main.tsx",
        },
    },
    html: {
        title: "${o.name}",
    },
    server: {
        port: 3000,
    },
});
`;

    return tpl;
}
