/**
 * A failure that is the user's to fix, carrying the exit code to leave with.
 *
 * The codes mirror the published shell script and `gen-ts-interfaces.mjs`:
 * 1 for a usage or filesystem problem, 2 for a document that will not parse.
 */
export class CliError extends Error {
    readonly code: number;

    constructor(message: string, code = 1) {
        super(message);
        this.name = "CliError";
        this.code = code;
    }
}
