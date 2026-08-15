import apiFiles from "../apiFiles.js";
import type { Files, Opts } from "../cli.js";
import genEditorConfig from "../genEditorConfig.js";
import genEnvDts from "../genEnvDts.js";
import genGitIgnore from "../genGitIgnore.js";
import genMainTsx from "../genMainTsx.js";
import genOxfmtrc from "../genOxfmtrc.js";
import genOxlintrc from "../genOxlintrc.js";
import genPnpmWorkspaceYaml from "../genPnpmWorkspaceYaml.js";
import genRootPkgJson from "../genRootPackageJson.js";
import genSpaTsConfig from "../genSpaTsConfig.js";
import genStylesCss from "../genStylesCss.js";
import genViteAppTsx from "../genViteAppTsx.js";
import genViteConfig from "../genViteConfig.js";
import genViteIndexHtml from "../genViteIndexHtml.js";
import genVitePkgJson from "../genVitePackageJson.js";
import huskyFiles from "../huskyFiles.js";

//index.html sits at the app root rather than in public/, because that is where
//vite looks for its entry. Everything else here is the shape every preset now
//has: the oxc configs at the workspace root, one pass for the whole workspace.
export default function viteSpa(o: Opts): Files {
    return {
        ...apiFiles(o),
        ...huskyFiles(o),
        "package.json": genRootPkgJson(o),
        "pnpm-workspace.yaml": genPnpmWorkspaceYaml(o),
        ".gitignore": genGitIgnore(o),
        ".editorconfig": genEditorConfig(),
        ".oxlintrc.json": genOxlintrc(o),
        ".oxfmtrc.json": genOxfmtrc(o),

        "apps/web/package.json": genVitePkgJson(o),
        "apps/web/tsconfig.json": genSpaTsConfig(o),
        "apps/web/vite.config.ts": genViteConfig(o),
        "apps/web/index.html": genViteIndexHtml(o),
        "apps/web/src/main.tsx": genMainTsx(o),
        "apps/web/src/App.tsx": genViteAppTsx(o),
        "apps/web/src/index.css": genStylesCss(o),
        "apps/web/src/vite-env.d.ts": genEnvDts(o),
    };
}
