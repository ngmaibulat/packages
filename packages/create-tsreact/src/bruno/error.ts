//User-facing failure: index.ts prints the message in red and exits 1, and
//anything else propagates as a crash with a stack.
//
//This lives in src/bruno/ rather than alongside the CLI entry because parse.ts,
//collection.ts and sample.ts all throw it, and importing it back out of the
//CLI would make the two packages mutually dependent. It is re-exported from
//the CLI's cli.ts, so every call site there still imports it from "./cli.js"
//and nothing else had to move.
//
//Same class identity either way, so "err instanceof CliError" in index.ts
//still catches what bruno throws.
export class CliError extends Error {}
