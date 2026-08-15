//Next writes this file itself on the first "next dev" or "next build". It is
//generated at scaffold time anyway so that "npm run typecheck" passes on a
//fresh clone that has never run either - without it every jsx element and
//every "next/*" import is an unresolved name.
//
//It is gitignored (see genGitIgnore.ts) because Next rewrites it, and the
//banner below is the one Next itself emits.
export default function genNextEnvDts() {
    const tpl = `
/// <reference types="next" />
/// <reference types="next/image-types/global" />

// NOTE: This file should not be edited
// see https://nextjs.org/docs/app/api-reference/config/typescript for more information.
`;

    return tpl;
}
