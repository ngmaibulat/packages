import type { Files, Opts } from "./cli.js";
import genHuskyPreCommit from "./genHuskyPreCommit.js";
import genLintStagedrc from "./genLintStagedrc.js";

//A map-builder in the same shape as apiFiles.ts: every preset spreads it, and
//it returns nothing at all unless --husky was passed. That is what keeps the
//flag from needing a branch in all seven presets.
//
//Only two files. The third piece - "prepare": "husky" plus the husky and
//lint-staged devDependencies - is in genRootPackageJson.ts, because the root
//manifest is the one file no preset can opt out of.
//
//.husky/_ is deliberately not generated: husky writes it (and the
//core.hooksPath setting that makes any of this run) during "prepare", and it
//carries its own .gitignore. Shipping a stale copy would be a conflict waiting
//for the first install.
export default function huskyFiles(o: Opts): Files {
    if (!o.husky) {
        return {};
    }

    return {
        ".husky/pre-commit": genHuskyPreCommit(),
        ".lintstagedrc.json": genLintStagedrc(o),
    };
}
