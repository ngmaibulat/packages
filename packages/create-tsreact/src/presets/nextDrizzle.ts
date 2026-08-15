import apiFiles from "../apiFiles.js";
import type { Files, Opts } from "../cli.js";
import genDbIndex from "../genDbIndex.js";
import genDbSchema from "../genDbSchema.js";
import genDrizzleConfig from "../genDrizzleConfig.js";
import genEditorConfig from "../genEditorConfig.js";
import genEnvExample from "../genEnvExample.js";
import genGitIgnore from "../genGitIgnore.js";
import genNextConfig from "../genNextConfig.js";
import genNextEnvDts from "../genNextEnvDts.js";
import genNextLayoutTsx from "../genNextLayoutTsx.js";
import genNextPkgJson from "../genNextPackageJson.js";
import genNextPageTsx from "../genNextPageTsx.js";
import genNextTsConfig from "../genNextTsConfig.js";
import genOxfmtrc from "../genOxfmtrc.js";
import genOxlintrc from "../genOxlintrc.js";
import genPnpmWorkspaceYaml from "../genPnpmWorkspaceYaml.js";
import genPostcssConfig from "../genPostcssConfig.js";
import genProvidersTsx from "../genProvidersTsx.js";
import genRootPkgJson from "../genRootPackageJson.js";
import genStylesCss from "../genStylesCss.js";
import huskyFiles from "../huskyFiles.js";

//Everything Next owns lives in apps/web, including drizzle.config.ts and
//.env.example: drizzle-kit resolves its config relative to the directory it
//runs in, and Next loads .env from the app root rather than the workspace
//root. Splitting either from the app would break both.
//
//providers.tsx is the only conditional entry: it exists to hold the TanStack
//Query client, so without --api there is nothing for it to provide.
//layout.tsx branches on the same condition - see genNextLayoutTsx.ts.
export default function nextDrizzle(o: Opts): Files {
    const files: Files = {
        ...apiFiles(o),
        ...huskyFiles(o),
        "package.json": genRootPkgJson(o),
        "pnpm-workspace.yaml": genPnpmWorkspaceYaml(o),
        ".gitignore": genGitIgnore(o),
        ".editorconfig": genEditorConfig(),
        ".oxlintrc.json": genOxlintrc(o),
        ".oxfmtrc.json": genOxfmtrc(o),

        "apps/web/package.json": genNextPkgJson(o),
        "apps/web/tsconfig.json": genNextTsConfig(),
        "apps/web/next.config.ts": genNextConfig(),
        "apps/web/postcss.config.mjs": genPostcssConfig(),
        "apps/web/drizzle.config.ts": genDrizzleConfig(),
        "apps/web/next-env.d.ts": genNextEnvDts(),
        "apps/web/.env.example": genEnvExample(),
        "apps/web/src/app/layout.tsx": genNextLayoutTsx(o),
        "apps/web/src/app/page.tsx": genNextPageTsx(o),
        "apps/web/src/app/globals.css": genStylesCss(o),
        "apps/web/src/db/index.ts": genDbIndex(),
        "apps/web/src/db/schema.ts": genDbSchema(),
    };

    if (o.api) {
        files["apps/web/src/app/providers.tsx"] = genProvidersTsx();
    }

    return files;
}
