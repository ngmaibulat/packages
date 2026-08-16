import { DEFAULT_MAX_CONNECTIONS } from './constants.ts';

/**
 * Every open connection, by database name.
 *
 * IndexedDB places no limit on connections, which is precisely the problem: a
 * page that keeps opening databases without closing them does not fail, it
 * degrades. The first symptom is usually a version upgrade that blocks forever
 * because a connection nobody remembers opening is still holding the old
 * version — and by then the cause is nowhere near the effect.
 *
 * So the registry counts, and says something once per database when the count
 * passes the threshold. It is a warning rather than an error: a genuine use for
 * hundreds of connections is unusual, not impossible, and a library has no
 * business failing an application's open over a heuristic.
 */

const open = new Map<string, number>();
const warned = new Set<string>();

export function registerConnection(
    dbName: string,
    maxConnections: number = DEFAULT_MAX_CONNECTIONS,
): void {
    const count = (open.get(dbName) ?? 0) + 1;
    open.set(dbName, count);

    if (count > maxConnections && !warned.has(dbName)) {
        warned.add(dbName);
        // Console rather than an event: nothing can subscribe early enough to
        // hear it, and this is a message for whoever is reading the devtools.
        console.warn(
            `Nexie: ${count} open connections to "${dbName}" (maxConnections is ` +
                `${maxConnections}). This usually means databases are being opened ` +
                'without being closed, which eventually blocks version upgrades.',
        );
    }
}

export function unregisterConnection(dbName: string): void {
    const count = (open.get(dbName) ?? 0) - 1;
    if (count > 0) open.set(dbName, count);
    else {
        open.delete(dbName);
        // Cleared with the last connection, so a page that recovers can be
        // told again if it regresses.
        warned.delete(dbName);
    }
}

/** How many connections this process currently holds to `dbName`. */
export function connectionCount(dbName: string): number {
    return open.get(dbName) ?? 0;
}
