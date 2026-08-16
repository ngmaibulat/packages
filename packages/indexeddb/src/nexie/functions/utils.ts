/** Small helpers shared across the Nexie layer. No IndexedDB knowledge here. */

export const isArray = Array.isArray;

/** `Object.keys`, narrowed for the string-keyed records this layer uses. */
export function keys<T extends object>(obj: T): (keyof T & string)[] {
    return Object.keys(obj) as (keyof T & string)[];
}

export function shallowClone<T>(obj: T): T {
    if (obj === null || typeof obj !== 'object') return obj;
    if (isArray(obj)) return obj.slice() as unknown as T;
    return Object.assign(Object.create(Object.getPrototypeOf(obj)), obj) as T;
}

/**
 * Structured-ish deep clone, good enough for the values IndexedDB accepts.
 *
 * Deliberately not `structuredClone`: that throws on functions and on the class
 * instances `mapToClass` produces, where the intent is to copy the data and let
 * the read hook re-apply the prototype.
 */
export function deepClone<T>(value: T): T {
    if (value === null || typeof value !== 'object') return value;
    if (value instanceof Date) return new Date(value.getTime()) as unknown as T;
    if (value instanceof ArrayBuffer) return value.slice(0) as unknown as T;
    if (ArrayBuffer.isView(value)) {
        const view = value as unknown as Uint8Array;
        // `slice` on a typed array copies the underlying buffer too.
        return (view.slice ? view.slice() : view) as unknown as T;
    }
    if (isArray(value)) return value.map((item) => deepClone(item)) as unknown as T;

    const result = Object.create(Object.getPrototypeOf(value)) as Record<
        string,
        unknown
    >;
    for (const key of Object.keys(value as object)) {
        result[key] = deepClone((value as Record<string, unknown>)[key]);
    }
    return result as T;
}

/**
 * Read a value out of an object by key path.
 *
 * A path may be dotted (`'address.city'`) or an array of paths, in which case an
 * array of values comes back -- that is how compound indexes such as `[a+b]`
 * are evaluated.
 */
export function getByKeyPath(obj: unknown, keyPath: string | string[]): any {
    if (isArray(keyPath)) {
        return keyPath.map((path) => getByKeyPath(obj, path));
    }

    if (obj === null || obj === undefined) return undefined;
    if (keyPath === '') return obj;

    const dot = keyPath.indexOf('.');
    if (dot === -1) return (obj as Record<string, unknown>)[keyPath];

    return getByKeyPath(
        (obj as Record<string, unknown>)[keyPath.slice(0, dot)],
        keyPath.slice(dot + 1),
    );
}

/** Write a value into an object by key path, creating intermediate objects. */
export function setByKeyPath(
    obj: unknown,
    keyPath: string | string[],
    value: unknown,
): void {
    if (obj === null || obj === undefined) return;

    if (isArray(keyPath)) {
        // Compound: the value must be positionally aligned with the paths.
        keyPath.forEach((path, index) =>
            setByKeyPath(obj, path, (value as unknown[])?.[index]),
        );
        return;
    }

    const target = obj as Record<string, unknown>;
    const dot = keyPath.indexOf('.');

    if (dot === -1) {
        if (value === undefined) delete target[keyPath];
        else target[keyPath] = value;
        return;
    }

    const head = keyPath.slice(0, dot);
    const rest = keyPath.slice(dot + 1);
    let inner = target[head];

    if (inner === undefined || inner === null) {
        if (value === undefined) return; // nothing to delete down there
        inner = {};
        target[head] = inner;
    }

    setByKeyPath(inner, rest, value);
}

/** Remove a value from an object by key path. */
export function delByKeyPath(obj: unknown, keyPath: string | string[]): void {
    if (isArray(keyPath)) {
        keyPath.forEach((path) => delByKeyPath(obj, path));
        return;
    }
    setByKeyPath(obj, keyPath, undefined);
}

/**
 * Copy `props` onto `target`, defining accessors rather than values where the
 * descriptor calls for it. Used to install table properties on a db instance.
 */
export function extend<T extends object>(
    target: T,
    props: Record<string, unknown>,
): T {
    for (const key of Object.keys(props)) {
        (target as Record<string, unknown>)[key] = props[key];
    }
    return target;
}

/** True for a plain `{}` object, as opposed to a class instance or an array. */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
    if (value === null || typeof value !== 'object') return false;
    const proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
}
