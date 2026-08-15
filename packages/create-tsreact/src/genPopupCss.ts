import type { Opts } from "./cli.js";

//With --tailwind this is build output, compiled from src/styles.css by
//"npm run tw". It is still written once at scaffold time (and gitignored) so
//the first build resolves the import in popup.tsx - see genAppCss.ts.
const GENERATED = `
/* generated from src/styles.css by "npm run tw" - do not edit */
`;

export default function genPopupCss(o: Opts) {
    if (o.tailwind) {
        return GENERATED;
    }

    const tpl = `
body {
    margin: 0;
    font-family: system-ui, sans-serif;
}

/* a popup sizes itself to its content, so give it explicit width */
main {
    width: 240px;
    padding: 16px;
}

h1 {
    margin: 0 0 12px;
    font-size: 16px;
}
`;

    return tpl;
}
