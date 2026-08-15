import type { Opts } from "./cli.js";

//With --tailwind this file becomes build output, compiled from src/styles.css
//by "npm run tw". It is still written once at scaffold time (and gitignored)
//so that the very first "npm run dev" resolves the import in app.tsx before
//the css watcher has ever run.
const GENERATED = `
/* generated from src/styles.css by "npm run tw" - do not edit */
`;

export default function genAppCss(o: Opts) {
    if (o.tailwind) {
        return GENERATED;
    }

    const tpl = `
#app {
    padding: 15px;
    margin-right: auto;
    margin-left: auto;
    border: 1px solid black;
    max-width: 50%;
}
`;

    return tpl;
}
