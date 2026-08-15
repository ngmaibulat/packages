import apiFiles from "../apiFiles.js";
import type { Files, Opts } from "../cli.js";
import genEditorConfig from "../genEditorConfig.js";
import genGitIgnore from "../genGitIgnore.js";
import genMainTsx from "../genMainTsx.js";
import genOxfmtrc from "../genOxfmtrc.js";
import genOxlintrc from "../genOxlintrc.js";
import genPnpmWorkspaceYaml from "../genPnpmWorkspaceYaml.js";
import genRootPkgJson from "../genRootPackageJson.js";
import genRsbuildConfig from "../genRsbuildConfig.js";
import genRsbuildPkgJson from "../genRsbuildPackageJson.js";
import genSpaTsConfig from "../genSpaTsConfig.js";
import genStylesCss from "../genStylesCss.js";
import genViteAppTsx from "../genViteAppTsx.js";
import huskyFiles from "../huskyFiles.js";

//vite-spa's tree minus two files, and the absences are the interesting part:
//
//  no index.html   rsbuild generates the document itself, so there is no
//                  build input to check in - see genRsbuildConfig.ts.
//  no *-env.d.ts   rsbuild's css and import.meta types come from the "types"
//                  array in tsconfig.json rather than a /// reference, so
//                  genEnvDts has nothing to contribute here.
//
//Everything else is shared with vite-spa outright: the mount/render split,
//the greeting component, the stylesheet and every root-level config.
export default function rsbuildSpa(o: Opts): Files {
    return {
        ...apiFiles(o),
        ...huskyFiles(o),
        "package.json": genRootPkgJson(o),
        "pnpm-workspace.yaml": genPnpmWorkspaceYaml(o),
        ".gitignore": genGitIgnore(o),
        ".editorconfig": genEditorConfig(),
        ".oxlintrc.json": genOxlintrc(o),
        ".oxfmtrc.json": genOxfmtrc(o),

        "apps/web/package.json": genRsbuildPkgJson(o),
        "apps/web/tsconfig.json": genSpaTsConfig(o),
        "apps/web/rsbuild.config.ts": genRsbuildConfig(o),
        "apps/web/src/main.tsx": genMainTsx(o),
        "apps/web/src/App.tsx": genViteAppTsx(o),
        "apps/web/src/index.css": genStylesCss(o),
    };
}
