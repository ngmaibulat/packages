import { standaloneTailwind } from "./cli.js";
import type { Opts } from "./cli.js";

//Tailwind v4 is configured in css, not in a tailwind.config.js - that file is
//deliberately not generated. Customise the theme with @theme { --color-x: ... }
//and see https://tailwindcss.com/docs/theme
//
//Source files are auto-detected from this file's directory, skipping anything
//gitignored (which is why the compiled css and the esbuild bundle are listed
//in .gitignore one by one rather than by ignoring public/ wholesale). Add
//@source "..." only if you keep markup somewhere unusual.
export default function genStylesCss(o: Opts) {
    //logs: false silences the "daisyUI x.y.z" banner on every rebuild
    const daisyui = o.daisyui
        ? `

@plugin "daisyui" {
    logs: false;
}`
        : "";

    const html = o.template === "extension" ? "popup.html" : "index.html";

    //only the templates where @tailwindcss/cli runs standalone name their
    //sources. @tailwindcss/vite and @tailwindcss/postcss hand tailwind the
    //bundler's own module graph, so the scan is already exactly the files
    //that ship - and the paths below are wrong for those layouts anyway,
    //neither of which has a public/index.html.
    const sources = standaloneTailwind(o)
        ? `
/* v4 also finds these on its own, but naming them keeps the scan predictable
   and independent of what happens to be gitignored at the time */
@source "./**/*.{ts,tsx}";
@source "../public/${html}";
`
        : "";

    const tpl = `
@import "tailwindcss";${daisyui}
${sources}
/* your own css goes here - it is compiled together with the utilities above */
`;

    return tpl;
}
