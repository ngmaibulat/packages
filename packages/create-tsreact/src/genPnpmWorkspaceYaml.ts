import type { Opts } from "./cli.js";

//pnpm ignores package.json's "workspaces" array - the list lives here or the
//repository is not a workspace at all.
//
//NOTE on allowBuilds: pnpm 10+ refuses to run a dependency's postinstall
//script unless it is named, and the failure is indirect - the package installs
//fine, then its binary is missing at build time. The key is "allowBuilds" on
//pnpm 11; "onlyBuiltDependencies" is the pnpm 10 spelling and is silently
//ignored, which is an easy way to believe this is handled when it is not.
//
//esbuild is listed for every template rather than only the ones that depend on
//it directly, because it also arrives transitively - drizzle-kit bundles one,
//so does tsx - and enumerating which templates happen to pull it in is a list
//that goes stale the first time a dependency changes. Naming a package that is
//not installed costs nothing.
export default function genPnpmWorkspaceYaml(o: Opts) {
    //@parcel/watcher comes in with @tailwindcss/cli, so it appears only where
    //the standalone tailwind toolchain does. It is a native module, and its
    //postinstall is what produces the binding "tailwindcss --watch" uses.
    const standalone = o.template === "react" || o.template === "pwa" || o.template === "extension";

    const watcher = standalone && o.tailwind ? `\n    "@parcel/watcher": true` : "";

    //Metro resolves modules by walking node_modules upward and cannot follow
    //pnpm's default symlinked layout, so React Native needs the flat one.
    //
    //This MUST live here rather than in .npmrc: pnpm 11 ignores node-linker
    //there entirely ("pnpm config get node-linker" reports undefined), and
    //the failure is silent - the install succeeds, node_modules stays
    //symlinked, and metro fails to resolve packages that are plainly present.
    const linker =
        o.template === "expo"
            ? `
# metro cannot resolve pnpm's symlinked layout - see genPnpmWorkspaceYaml.ts
nodeLinker: hoisted
`
            : "";

    const tpl = `
packages:
    - apps/*
${linker}
# Dependencies whose postinstall scripts pnpm is allowed to run.
allowBuilds:
    esbuild: true${watcher}
`;

    return tpl;
}
