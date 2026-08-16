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
