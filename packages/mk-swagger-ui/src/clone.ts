import { spawnSync } from "node:child_process";

import { CliError } from "./errors";

export interface Repo {
    url: string;
    /** The directory `git clone` creates, which is what `clean` removes. */
    dir: string;
}

/**
 * The upstream projects the published package exposed as `get-ui`,
 * `get-editor` and `get-codegen` -- three bins that each wrapped a single
 * `git clone`, and three very generic names in the global PATH. They are one
 * `get <target>` subcommand now, joined by Scalar's own repository since that
 * is what this tool renders with.
 *
 * The directory is stored rather than derived: `git clone` names it after the
 * repository, and `scalar` does not follow the `swagger-*` pattern the other
 * three share.
 */
export const REPOS: Record<string, Repo> = {
    ui: { url: "https://github.com/swagger-api/swagger-ui", dir: "swagger-ui" },
    editor: {
        url: "https://github.com/swagger-api/swagger-editor",
        dir: "swagger-editor",
    },
    codegen: {
        url: "https://github.com/swagger-api/swagger-codegen",
        dir: "swagger-codegen",
    },
    scalar: { url: "https://github.com/scalar/scalar", dir: "scalar" },
};

export type RepoName = keyof typeof REPOS;

// Object.hasOwn, not `in`: `in` walks the prototype chain, so "toString" and
// "constructor" would pass the guard and then destructure to an undefined url.
export function isRepoName(name: string): name is RepoName {
    return Object.hasOwn(REPOS, name);
}

export function clone(name: string): void {
    if (!isRepoName(name)) {
        throw new CliError(
            `unknown target ${name} -- expected one of ${Object.keys(REPOS).join(", ")}`
        );
    }

    const { url } = REPOS[name];

    console.log(`Cloning ${url}`);

    const result = spawnSync("git", ["clone", url], { stdio: "inherit" });

    if (result.error) {
        throw new CliError(`could not run git: ${result.error.message}`);
    }

    if (result.status !== 0) {
        throw new CliError(`git clone failed with code ${result.status}`);
    }
}
