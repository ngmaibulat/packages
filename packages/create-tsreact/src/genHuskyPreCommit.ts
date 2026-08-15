//The hook itself, run by husky's .husky/_/pre-commit shim.
//
//No shebang and no "husky.sh" source line: both are husky 8 spellings that
//husky 9 dropped. The shim invokes this file with "sh -e", so it does not need
//the executable bit either - which matters, because writeTree writes every
//generated file 0644.
//
//lint-staged before the whole-project lint, deliberately: formatting can only
//change files that are already staged, and it re-stages what it rewrites, so
//the commit that lands is the one that was linted.
export default function genHuskyPreCommit() {
    const tpl = `
pnpm exec lint-staged

pnpm run lint
`;

    return tpl;
}
