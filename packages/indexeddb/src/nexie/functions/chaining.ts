import { NexiePromise } from '../zone/nexie-promise.ts';

/**
 * How two subscribers to the same event compose.
 *
 * Each event type picks one of these, and the choice is part of the public
 * contract: a `reading` hook is a pure transform chain, while a `creating` hook
 * can rewrite the primary key for the next subscriber in line.
 */
export type ChainFunction = (
    f1: (...args: any[]) => any,
    f2: (...args: any[]) => any,
) => (...args: any[]) => any;

/** Call both, in order, ignoring return values. */
export function nonStoppableChain(
    f1: (...args: any[]) => any,
    f2: (...args: any[]) => any,
): (...args: any[]) => any {
    return function (this: unknown, ...args: any[]) {
        f1.apply(this, args);
        f2.apply(this, args);
    };
}

/** `f2(f1(value))` -- the `reading` hook shape. */
export function pureFunctionChain(
    f1: (...args: any[]) => any,
    f2: (...args: any[]) => any,
): (...args: any[]) => any {
    return function (this: unknown, value: unknown) {
        return f2.call(this, f1.call(this, value));
    };
}

/**
 * Later subscribers run first and may veto by returning false.
 *
 * Used by the database events, where a subscriber added later is "closer" to
 * the application and gets to suppress the default behaviour.
 */
export function reverseStoppableChain(
    f1: (...args: any[]) => any,
    f2: (...args: any[]) => any,
): (...args: any[]) => any {
    return function (this: unknown, ...args: any[]) {
        if (f2.apply(this, args) === false) return false;
        return f1.apply(this, args);
    };
}

/**
 * Run in order, waiting for each to settle before the next begins.
 *
 * This is what lets `db.on('ready')` and `version().upgrade()` return a promise
 * and have the database wait for it.
 */
export function promisableChain(
    f1: (...args: any[]) => any,
    f2: (...args: any[]) => any,
): (...args: any[]) => any {
    return function (this: unknown, ...args: any[]) {
        const result = f1.apply(this, args);
        if (result && typeof result.then === 'function') {
            return result.then(() => f2.apply(this, args));
        }
        return f2.apply(this, args);
    };
}

/** Combine two optional callbacks into one, tolerating either being absent. */
export function callBoth(
    on1: ((...args: any[]) => void) | undefined,
    on2: ((...args: any[]) => void) | undefined,
): ((...args: any[]) => void) | undefined {
    if (!on1) return on2;
    if (!on2) return on1;
    return function (this: unknown, ...args: any[]) {
        on1.apply(this, args);
        on2.apply(this, args);
    };
}

/** The per-subscriber context a CRUD hook runs with. */
export interface HookContext {
    onsuccess?: ((result?: any) => void) | undefined;
    onerror?: ((error: unknown) => void) | undefined;
}

/**
 * `creating` chain.
 *
 * A subscriber that returns a value replaces the primary key seen by the next
 * one, which is how a hook can assign an id. Each subscriber gets its own
 * `this` so it can register `onsuccess`/`onerror`, and those are combined.
 */
export function hookCreatingChain(
    f1: (...args: any[]) => any,
    f2: (...args: any[]) => any,
): (...args: any[]) => any {
    return function (this: HookContext, ...args: any[]) {
        const context1: HookContext = {};
        const result1 = f1.apply(context1, args);
        if (result1 !== undefined) args[0] = result1;

        const context2: HookContext = {};
        const result2 = f2.apply(context2, args);

        this.onsuccess = callBoth(context1.onsuccess, context2.onsuccess);
        this.onerror = callBoth(context1.onerror, context2.onerror);

        return result2 !== undefined ? result2 : result1;
    };
}

/**
 * `updating` chain.
 *
 * A subscriber returning an object contributes further modifications, which are
 * merged in before the next subscriber sees them.
 */
export function hookUpdatingChain(
    f1: (...args: any[]) => any,
    f2: (...args: any[]) => any,
): (...args: any[]) => any {
    return function (this: HookContext, ...args: any[]) {
        const context1: HookContext = {};
        const result1 = f1.apply(context1, args);

        if (result1 && typeof result1 === 'object') {
            Object.assign(args[0] as object, result1);
        }

        const context2: HookContext = {};
        const result2 = f2.apply(context2, args);

        this.onsuccess = callBoth(context1.onsuccess, context2.onsuccess);
        this.onerror = callBoth(context1.onerror, context2.onerror);

        if (result1 === undefined) return result2;
        if (result2 === undefined) return result1;
        return { ...result1, ...result2 };
    };
}

/** `deleting` chain -- no return value, but the callbacks still combine. */
export function hookDeletingChain(
    f1: (...args: any[]) => any,
    f2: (...args: any[]) => any,
): (...args: any[]) => any {
    return function (this: HookContext, ...args: any[]) {
        const context1: HookContext = {};
        f1.apply(context1, args);
        const context2: HookContext = {};
        f2.apply(context2, args);

        this.onsuccess = callBoth(context1.onsuccess, context2.onsuccess);
        this.onerror = callBoth(context1.onerror, context2.onerror);
    };
}

/** Await `value` if it is thenable, otherwise pass it straight through. */
export function settle<T>(value: T | PromiseLike<T>): NexiePromise<T> {
    return NexiePromise.resolve(value);
}
