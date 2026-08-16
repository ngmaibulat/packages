import type { IndexableType } from '../types/schema.ts';

/**
 * Sorts below every other key. IndexedDB orders numbers first, so -Infinity is
 * genuinely the smallest possible key.
 */
export const MIN_KEY: IndexableType = -Infinity;

/**
 * Sorts above every other key.
 *
 * Arrays sort above every other type, and an array compares element-wise, so an
 * array whose first element is itself an array beats any array of plain keys.
 * This is what makes prefix ranges over compound indexes expressible: the range
 * `[k] .. [k, MAX_KEY]` covers every entry beginning with `k`.
 */
export const MAX_KEY: IndexableType = [[]] as unknown as IndexableType;

/**
 * The largest UTF-16 code unit, used to close an open-ended string prefix:
 * `startsWith('ab')` is `between('ab', 'ab￿')`.
 */
export const MAX_STRING = String.fromCharCode(65535);

/** The magic index name meaning "the primary key". */
export const PRIMARY_KEY_NAME = ':id';

/**
 * Replaced with the package version at build time; see tsdown.config.ts.
 *
 * Injected rather than hardcoded because a hand-maintained copy of a version
 * number is a lie waiting to happen, and rather than imported from
 * package.json because `rootDir` is `src` — a manifest import lands outside it
 * and breaks the declaration emit.
 */
declare const __NEXIE_VERSION__: string | undefined;

/**
 * This library's version, surfaced as `Nexie.semVer`.
 *
 * Running the TypeScript sources directly — the test suite does — there is no
 * bundler to substitute anything, so the value says so instead of guessing.
 */
export const NEXIE_VERSION: string =
    typeof __NEXIE_VERSION__ === 'string' ? __NEXIE_VERSION__ : '0.0.0-src';

/**
 * How many records `Collection.modify` writes back per request by default.
 *
 * Bounds the size of a single mutation. One request carrying fifty thousand
 * records is a long stall in the engine and, on a failure, a `ModifyError`
 * whose per-record failures are all any caller has to go on.
 */
export const DEFAULT_MODIFY_CHUNK_SIZE = 200;

/**
 * How many open connections to one database before something is wrong.
 *
 * IndexedDB has no connection limit; this is a leak detector. A page that keeps
 * calling `new Nexie(...)` without closing is a page that will eventually block
 * its own version upgrades, and the symptom appears far from the cause.
 */
export const DEFAULT_MAX_CONNECTIONS = 100;
