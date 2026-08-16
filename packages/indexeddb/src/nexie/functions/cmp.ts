import { exceptions } from '../errors/errors.ts';
import type { IndexableType } from '../types/schema.ts';

const DataError = exceptions['Data']!;

/**
 * IndexedDB key ordering, implemented rather than delegated to
 * `indexedDB.cmp()`.
 *
 * Two reasons not to delegate: `cmp` is a public export that must work without
 * an open database (and in an environment where the global may be absent), and
 * the collection sorts client-side in `sortBy`, where routing every comparison
 * through a host call would be needlessly slow.
 *
 * The type order is normative: number < Date < string < binary < Array.
 */

function isBinary(key: unknown): key is ArrayBuffer | ArrayBufferView {
    return key instanceof ArrayBuffer || ArrayBuffer.isView(key);
}

function typeRank(key: unknown): number {
    if (typeof key === 'number') return 1;
    if (key instanceof Date) return 2;
    if (typeof key === 'string') return 3;
    if (isBinary(key)) return 4;
    if (Array.isArray(key)) return 5;
    throw new DataError(
        `Invalid key: ${String(key)}. Keys must be a number, string, Date, ArrayBuffer or Array of those.`,
    );
}

function toBytes(key: ArrayBuffer | ArrayBufferView): Uint8Array {
    return key instanceof ArrayBuffer
        ? new Uint8Array(key)
        : new Uint8Array(key.buffer, key.byteOffset, key.byteLength);
}

function compareBinary(
    a: ArrayBuffer | ArrayBufferView,
    b: ArrayBuffer | ArrayBufferView,
): number {
    const left = toBytes(a);
    const right = toBytes(b);
    const shared = Math.min(left.length, right.length);
    for (let i = 0; i < shared; i++) {
        if (left[i] !== right[i]) return left[i]! < right[i]! ? -1 : 1;
    }
    return left.length === right.length ? 0 : left.length < right.length ? -1 : 1;
}

function compareArrays(a: unknown[], b: unknown[]): number {
    const shared = Math.min(a.length, b.length);
    for (let i = 0; i < shared; i++) {
        const result = cmp(a[i] as IndexableType, b[i] as IndexableType);
        if (result !== 0) return result;
    }
    // A prefix sorts before the longer array it prefixes.
    return a.length === b.length ? 0 : a.length < b.length ? -1 : 1;
}

/**
 * Compare two IndexedDB keys.
 *
 * @returns -1 if `a < b`, 0 if equal, 1 if `a > b`.
 */
export function cmp(a: IndexableType, b: IndexableType): number {
    const rankA = typeRank(a);
    const rankB = typeRank(b);
    if (rankA !== rankB) return rankA < rankB ? -1 : 1;

    switch (rankA) {
        case 1: {
            const left = a as number;
            const right = b as number;
            return left === right ? 0 : left < right ? -1 : 1;
        }
        case 2: {
            const left = (a as Date).getTime();
            const right = (b as Date).getTime();
            return left === right ? 0 : left < right ? -1 : 1;
        }
        case 3: {
            const left = a as string;
            const right = b as string;
            // Code-unit order, which is what IndexedDB specifies -- not locale
            // collation, and so not String.prototype.localeCompare.
            return left === right ? 0 : left < right ? -1 : 1;
        }
        case 4:
            return compareBinary(
                a as ArrayBuffer,
                b as ArrayBuffer,
            );
        default:
            return compareArrays(a as unknown[], b as unknown[]);
    }
}

/** True when `key` is something IndexedDB will accept. */
export function isValidKey(key: unknown): key is IndexableType {
    try {
        typeRank(key);
        return true;
    } catch {
        return false;
    }
}

/** Ascending comparator, for `sortBy` and range merging. */
export const ascending = cmp;

/** Descending comparator. */
export function descending(a: IndexableType, b: IndexableType): number {
    return cmp(b, a);
}
