import apiFiles from "../apiFiles.js";
import type { Files, Opts } from "../cli.js";
import genAppCss from "../genAppCss.js";
import genAppTsx from "../genAppTsx.js";
import genEditorConfig from "../genEditorConfig.js";
import genEnvDts from "../genEnvDts.js";
import genGitIgnore from "../genGitIgnore.js";
import genIndexHtml from "../genIndexHtml.js";
import genNpmrc from "../genNpmrc.js";
import genOxfmtrc from "../genOxfmtrc.js";
import genOxlintrc from "../genOxlintrc.js";
import genPkgJson from "../genPackageJson.js";
import genPnpmWorkspaceYaml from "../genPnpmWorkspaceYaml.js";
import genRootPkgJson from "../genRootPackageJson.js";
import genStylesCss from "../genStylesCss.js";
import genTsConfig from "../genTsConfig.js";
import huskyFiles from "../huskyFiles.js";

//A pnpm workspace: the root holds the lockfile, the tooling config and the
//scripts that fan out, and apps/web holds the app itself. Everything under
//apps/web is exactly what this template used to emit at the top level.
export default function react(o: Opts): Files {
    const files: Files = {
        ...apiFiles(o),
        ...huskyFiles(o),
        "package.json": genRootPkgJson(o),
        "pnpm-workspace.yaml": genPnpmWorkspaceYaml(o),
        ".gitignore": genGitIgnore(o),
        ".editorconfig": genEditorConfig(),
        ".oxlintrc.json": genOxlintrc(o),
        ".oxfmtrc.json": genOxfmtrc(o),

        "apps/web/package.json": genPkgJson(o),
        "apps/web/tsconfig.json": genTsConfig(o),
        "apps/web/public/index.html": genIndexHtml(o),
        "apps/web/src/app.tsx": genAppTsx(o),
        "apps/web/src/app.css": genAppCss(o),
        "apps/web/src/env.d.ts": genEnvDts(o),
    };

    const npmrc = genNpmrc(o);

    if (npmrc) {
        files[".npmrc"] = npmrc;
    }

    if (o.tailwind) {
        files["apps/web/src/styles.css"] = genStylesCss(o);
    }

    return files;
}
