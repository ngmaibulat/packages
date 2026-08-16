/**
 * Produce a fresh subclass of `base`.
 *
 * Each database gets its own `db.Table`, `db.Collection` and so on, so an addon
 * that patches a prototype affects that one database rather than every instance
 * in the process. Without this, two databases in the same page could not carry
 * different addons.
 */
export function makeClassConstructor<T extends new (...args: any[]) => any>(
    base: T,
): T {
    class Derived extends (base as unknown as new (...args: any[]) => any) {}
    return Derived as unknown as T;
}
