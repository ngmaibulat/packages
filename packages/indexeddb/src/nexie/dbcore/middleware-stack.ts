import type { DBCore, Middleware } from '../types/dbcore.ts';

export const DEFAULT_MIDDLEWARE_LEVEL = 10;

/**
 * Fold the registered middlewares over the base core.
 *
 * Ordering: the stack is built from the bottom up, so a middleware with a
 * LOWER level ends up closer to IndexedDB and sees requests last. Ties keep
 * registration order, which makes the result predictable when an application
 * and an addon both register at the default level.
 *
 * A middleware returns a partial DBCore, and the missing members fall through
 * to the layer below -- so intercepting `mutate` alone costs nothing on the
 * read path.
 */
export function buildMiddlewareStack(
    base: DBCore,
    middlewares: readonly Middleware<DBCore>[],
): DBCore {
    const ordered = [...middlewares]
        .map((middleware, index) => ({ middleware, index }))
        .sort((a, b) => {
            const levelA = a.middleware.level ?? DEFAULT_MIDDLEWARE_LEVEL;
            const levelB = b.middleware.level ?? DEFAULT_MIDDLEWARE_LEVEL;
            return levelA === levelB ? a.index - b.index : levelA - levelB;
        })
        .map((entry) => entry.middleware);

    return ordered.reduce<DBCore>((down, middleware) => {
        const applied = middleware.create(down);
        // Spread over the layer below so a partial override composes rather
        // than replacing the whole interface.
        return { ...down, ...applied };
    }, base);
}
