import apiFiles from "../apiFiles.js";
import type { Files, Opts } from "../cli.js";
import genBackgroundTs from "../genBackgroundTs.js";
import genContentTs from "../genContentTs.js";
import genEditorConfig from "../genEditorConfig.js";
import genEnvDts from "../genEnvDts.js";
import genExtPkgJson from "../genExtPackageJson.js";
import genGitIgnore from "../genGitIgnore.js";
import genManifest from "../genManifest.js";
import genNpmrc from "../genNpmrc.js";
import genOxfmtrc from "../genOxfmtrc.js";
import genOxlintrc from "../genOxlintrc.js";
import genPnpmWorkspaceYaml from "../genPnpmWorkspaceYaml.js";
import genPopupCss from "../genPopupCss.js";
import genPopupHtml from "../genPopupHtml.js";
import genPopupTsx from "../genPopupTsx.js";
import genRootPkgJson from "../genRootPackageJson.js";
import genStylesCss from "../genStylesCss.js";
import genTsConfig from "../genTsConfig.js";
import huskyFiles from "../huskyFiles.js";

//apps/extension rather than apps/web: what Chrome loads is not a web app, and
//the directory name is what the "Load unpacked" instruction points at.
export default function extension(o: Opts): Files {
    const files: Files = {
        ...apiFiles(o),
        ...huskyFiles(o),
        "package.json": genRootPkgJson(o),
        "pnpm-workspace.yaml": genPnpmWorkspaceYaml(o),
        ".gitignore": genGitIgnore(o),
        ".editorconfig": genEditorConfig(),
        ".oxlintrc.json": genOxlintrc(o),
        ".oxfmtrc.json": genOxfmtrc(o),

        "apps/extension/package.json": genExtPkgJson(o),
        "apps/extension/tsconfig.json": genTsConfig(o),
        "apps/extension/public/manifest.json": genManifest(o),
        "apps/extension/public/popup.html": genPopupHtml(o.name),
        "apps/extension/src/popup.tsx": genPopupTsx(o),
        "apps/extension/src/popup.css": genPopupCss(o),
        "apps/extension/src/content.ts": genContentTs(o.name),
        "apps/extension/src/background.ts": genBackgroundTs(o.name),
        "apps/extension/src/env.d.ts": genEnvDts(o),
    };

    const npmrc = genNpmrc(o);

    if (npmrc) {
        files[".npmrc"] = npmrc;
    }

    if (o.tailwind) {
        files["apps/extension/src/styles.css"] = genStylesCss(o);
    }

    return files;
}
