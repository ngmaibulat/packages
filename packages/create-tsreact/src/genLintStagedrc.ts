import { APPS } from "./cli.js";
import type { Opts } from "./cli.js";

//What the pre-commit hook formats. The glob mirrors the "format:*" scripts in
//the root manifest, so a hook run and a manual "npm run format:fix" cannot
//disagree about which files this project owns.
//
//NOTE the --no-error-on-unmatched-pattern. lint-staged hands oxfmt the exact
//list of staged files, and .oxfmtrc.json ignores apps/*/src/api - so a commit
//that touches nothing but a regenerated client leaves oxfmt with every file
//excluded, where it exits 2 with "Expected at least one target file" and takes
//the commit down with it. The flag turns that case into a no-op. It is not
//hypothetical: "npm run api:gen" produces exactly that commit.
export default function genLintStagedrc(o: Opts) {
    //one entry per app rather than "apps/*/src": lint-staged matches with
    //micromatch, which does expand this, but naming them keeps the file
    //readable next to the format scripts that cannot use a glob at all.
    //
    //expo keeps App.tsx and index.ts at the app root rather than under src/,
    //so its pattern has to match there or the hook would format nothing at
    //all - the same exception genRootPackageJson.ts makes for format:check.
    const pattern = (a: string) =>
        o.template === "expo" ? `apps/${a}/*.{ts,tsx}` : `apps/${a}/src/**/*.{ts,tsx}`;

    const globs = APPS[o.template].map(
        (a) => `    "${pattern(a)}": "oxfmt --no-error-on-unmatched-pattern"`,
    );

    const tpl = `
{
${globs.join(",\n")}
}
`;

    return tpl;
}
