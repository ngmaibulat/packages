import apiFiles from "../apiFiles.js";
import type { Files, Opts } from "../cli.js";
import genAppJson from "../genAppJson.js";
import genEditorConfig from "../genEditorConfig.js";
import genExpoAppTsx from "../genExpoAppTsx.js";
import genExpoGitIgnore from "../genExpoGitIgnore.js";
import genExpoIndexTs from "../genExpoIndexTs.js";
import genExpoPkgJson from "../genExpoPackageJson.js";
import genExpoTsConfig from "../genExpoTsConfig.js";
import genOxfmtrc from "../genOxfmtrc.js";
import genOxlintrc from "../genOxlintrc.js";
import genPnpmWorkspaceYaml from "../genPnpmWorkspaceYaml.js";
import genRootPkgJson from "../genRootPackageJson.js";
import huskyFiles from "../huskyFiles.js";

//apps/mobile. The one thing this template cannot do without is
//nodeLinker: hoisted in pnpm-workspace.yaml - metro cannot resolve pnpm's
//symlinked layout. See genPnpmWorkspaceYaml.ts.
export default function expo(o: Opts): Files {
    return {
        ...apiFiles(o),
        ...huskyFiles(o),
        "package.json": genRootPkgJson(o),
        "pnpm-workspace.yaml": genPnpmWorkspaceYaml(o),
        ".gitignore": genExpoGitIgnore(),
        ".editorconfig": genEditorConfig(),
        ".oxlintrc.json": genOxlintrc(o),
        ".oxfmtrc.json": genOxfmtrc(o),

        "apps/mobile/package.json": genExpoPkgJson(o),
        "apps/mobile/app.json": genAppJson(o.name),
        "apps/mobile/tsconfig.json": genExpoTsConfig(),
        "apps/mobile/index.ts": genExpoIndexTs(),
        "apps/mobile/App.tsx": genExpoAppTsx(o),
    };
}
