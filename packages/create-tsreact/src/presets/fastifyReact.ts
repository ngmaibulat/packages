import apiFiles from "../apiFiles.js";
import type { Files, Opts } from "../cli.js";
import genEditorConfig from "../genEditorConfig.js";
import genEnvDts from "../genEnvDts.js";
import genFastifyPkgJson from "../genFastifyPackageJson.js";
import genFastifyServerTs from "../genFastifyServerTs.js";
import genGitIgnore from "../genGitIgnore.js";
import genMainTsx from "../genMainTsx.js";
import genOxfmtrc from "../genOxfmtrc.js";
import genOxlintrc from "../genOxlintrc.js";
import genPnpmWorkspaceYaml from "../genPnpmWorkspaceYaml.js";
import genRolldownConfig from "../genRolldownConfig.js";
import genRootPkgJson from "../genRootPackageJson.js";
import genServerTsConfig from "../genServerTsConfig.js";
import genSpaTsConfig from "../genSpaTsConfig.js";
import genStylesCss from "../genStylesCss.js";
import genViteAppTsx from "../genViteAppTsx.js";
import genViteConfig from "../genViteConfig.js";
import genViteIndexHtml from "../genViteIndexHtml.js";
import genVitePkgJson from "../genVitePackageJson.js";
import huskyFiles from "../huskyFiles.js";

//The only template with two apps. Since every template is a workspace now,
//the difference is just the second entry under apps/ and the extra root
//scripts that start one half on its own - see genRootPackageJson.ts.
//
//The web half is the vite-spa template's generators unchanged; they branch on
//o.template where the two differ (the /api dev proxy, the description).
//apiFiles() puts the generated client under apps/web/src/api - see apiRoot().
export default function fastifyReact(o: Opts): Files {
    return {
        ...apiFiles(o),
        ...huskyFiles(o),
        "package.json": genRootPkgJson(o),
        "pnpm-workspace.yaml": genPnpmWorkspaceYaml(o),
        ".gitignore": genGitIgnore(o),
        ".editorconfig": genEditorConfig(),
        ".oxlintrc.json": genOxlintrc(o),
        ".oxfmtrc.json": genOxfmtrc(o),

        "apps/server/package.json": genFastifyPkgJson(o),
        "apps/server/tsconfig.json": genServerTsConfig(),
        "apps/server/rolldown.config.ts": genRolldownConfig(),
        "apps/server/src/index.ts": genFastifyServerTs(o),

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
