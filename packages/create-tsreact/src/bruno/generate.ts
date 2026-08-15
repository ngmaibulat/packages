//One entry point for the seven emitters, so the exports map gains a single
//subpath rather than one per file.
//
//The names are the files they produce - queriesTs writes queries.ts - and the
//Ts suffix is not decoration: emit.ts already exports queries() and
//mutations(), the filters that split a spec into safe and unsafe endpoints,
//and apiFiles.ts in the CLI imports both sets side by side.
//
//Each takes an ApiSpec and nothing else. They used to take the CLI's Opts and
//read o.api off it; that is what kept them in the CLI, because importing Opts
//back out of it would have made the two packages mutually dependent - the
//same cycle the CliError note in error.ts describes. Narrowing the argument
//is what let them move, and it also retired an `o.api as ApiSpec` cast in
//every one of them.
export { default as clientTs } from "./emitClient.js";
export { default as configTs } from "./emitConfig.js";
export { default as indexTs } from "./emitIndex.js";
export { default as keysTs } from "./emitKeys.js";
export { default as mutationsTs } from "./emitMutations.js";
export { default as queriesTs } from "./emitQueries.js";
export { default as typesTs } from "./emitTypes.js";
