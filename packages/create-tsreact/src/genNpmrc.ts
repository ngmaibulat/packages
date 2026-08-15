import { standaloneTailwind } from "./cli.js";
import type { Opts } from "./cli.js";

//Only one setting still belongs in .npmrc, and only for older pnpm.
//
//npm runs pre<name>/post<name> for any script. pnpm 10 does not unless this
//is set; pnpm 11 flipped the default and runs them. The tailwind templates
//rely on a "predev" hook to compile the stylesheet once before the dev server
//starts, so on pnpm 10 its absence means the first "pnpm dev" serves an
//unstyled page with nothing to explain why. Two lines of forward compatibility
//that cost nothing on 11.
//
//NOTE: node-linker does NOT belong here. pnpm 11 ignores it in .npmrc - see
//genPnpmWorkspaceYaml.ts, where the expo template sets nodeLinker instead.
//
//Returns "" when it does not apply; the presets skip the file in that case.
export default function genNpmrc(o: Opts) {
    if (!standaloneTailwind(o)) {
        return "";
    }

    const tpl = `
# the "predev" script that compiles src/styles.css is a pre<name> hook. pnpm 11
# runs those by default; pnpm 10 skips them unless this is set.
enable-pre-post-scripts=true
`;

    return tpl;
}
