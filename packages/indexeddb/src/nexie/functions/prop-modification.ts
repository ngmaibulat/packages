import { delByKeyPath, getByKeyPath, setByKeyPath, isArray } from './utils.ts';
import type { IndexableType } from '../types/schema.ts';

/**
 * Declarative property modifications, usable as values inside an `UpdateSpec`:
 *
 *   await db.friends.update(id, { age: add(1), tags: remove('old') });
 *
 * They exist so an update can be expressed without reading the record first,
 * and so the intent survives being handed to a middleware later.
 */
export class PropModification {
    /** Add to a number, or append to an array. */
    readonly add?: unknown;
    /** Remove matching entries from an array, or subtract from a number. */
    readonly remove?: unknown;
    /** Replace a leading substring, leaving the rest alone. */
    readonly replacePrefix?: [string, string];

    constructor(spec: {
        add?: unknown;
        remove?: unknown;
        replacePrefix?: [string, string];
    }) {
        this.add = spec.add;
        this.remove = spec.remove;
        this.replacePrefix = spec.replacePrefix;
    }

    /**
     * Apply this modification to an existing value.
     *
     * Same arithmetic as Dexie, since these are the semantics documented for
     * `add`/`remove` and code was written against them: an array term is
     * concatenated onto the existing array (or onto nothing) and the result
     * sorted; a numeric term is added to `Number(value)`, treating anything
     * non-numeric as 0; anything else is a TypeError rather than a guess.
     */
    execute(value: unknown): unknown {
        if (this.add !== undefined) {
            const term = this.add;
            if (isArray(term)) {
                return [...(isArray(value) ? value : []), ...term].sort();
            }
            if (typeof term === 'number') return (Number(value) || 0) + term;
            if (typeof term === 'bigint') {
                try {
                    return BigInt(value as string) + term;
                } catch {
                    return BigInt(0) + term;
                }
            }
            throw new TypeError(`Invalid term ${String(term)}`);
        }

        if (this.remove !== undefined) {
            const subtrahend = this.remove;
            if (isArray(subtrahend)) {
                return isArray(value)
                    ? value.filter((item) => !subtrahend.includes(item)).sort()
                    : [];
            }
            if (typeof subtrahend === 'number') return Number(value) - subtrahend;
            if (typeof subtrahend === 'bigint') {
                try {
                    return BigInt(value as string) - subtrahend;
                } catch {
                    return BigInt(0) - subtrahend;
                }
            }
            throw new TypeError(`Invalid subtrahend ${String(subtrahend)}`);
        }

        if (this.replacePrefix) {
            const [from, to] = this.replacePrefix;
            return typeof value === 'string' && value.startsWith(from)
                ? to + value.slice(from.length)
                : value;
        }

        return value;
    }
}

export function add(value: number | bigint | IndexableType[]): PropModification {
    return new PropModification({ add: value });
}

export function remove(value: number | bigint | IndexableType[]): PropModification {
    return new PropModification({ remove: value });
}

export function replacePrefix(from: string, to: string): PropModification {
    return new PropModification({ replacePrefix: [from, to] });
}

/**
 * An update spec is a flat map of key paths to new values. A value of
 * `undefined` deletes the property; a PropModification is applied to whatever
 * is already there, which is what makes `{ age: add(1) }` type-check against a
 * numeric field.
 *
 * The index signature admits dotted paths (`'address.city'`), which no mapped
 * type over `keyof T` can express.
 */
export type UpdateSpec<T> = {
    [K in keyof T]?: T[K] | PropModification;
} & Record<string, unknown>;

/**
 * Apply an update spec to an object in place.
 *
 * @returns true when anything actually changed, which is what lets `update()`
 *          report a modified count of 0 for a no-op.
 */
export function applyUpdateSpec(
    target: unknown,
    spec: Record<string, unknown>,
): boolean {
    let changed = false;

    for (const keyPath of Object.keys(spec)) {
        const requested = spec[keyPath];
        const current = getByKeyPath(target, keyPath);

        if (requested instanceof PropModification) {
            const next = requested.execute(current);
            if (next !== current) {
                setByKeyPath(target, keyPath, next);
                changed = true;
            }
            continue;
        }

        if (requested === undefined) {
            if (current !== undefined) {
                delByKeyPath(target, keyPath);
                changed = true;
            }
            continue;
        }

        if (current !== requested) {
            setByKeyPath(target, keyPath, requested);
            changed = true;
        }
    }

    return changed;
}
