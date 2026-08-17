/**
 * Zones -- the ambient "which transaction am I in?" context.
 *
 * `db.transaction('rw', db.friends, async () => { await db.friends.add(x) })`
 * does not thread a transaction object through the caller's code. Instead the
 * scope runs in a zone carrying `trans`, and every table operation reads it
 * back out. Keeping that readable across `await` is what this module exists
 * for.
 *
 * Two mechanisms do it together, and the Phase 0 spike showed that neither is
 * sufficient alone:
 *
 *   1. The echo (here) makes `currentZone` correct *while the resumed async
 *      body runs*, so the body's next `await` captures the right zone.
 *   2. The `then` getter on NexiePromise captures that zone at the exact
 *      moment of the await -- see nexie-promise.ts. This is what makes the
 *      design immune to the disarm racing against jobs the body enqueues.
 *
 * Deliberately NOT here, unlike Dexie: no patching of `globalThis.Promise`, no
 * `ZONE_ECHO_LIMIT`, no counting of expected awaits. Those exist upstream to
 * support Babel-transpiled async/await and are not needed on the runtimes this
 * package targets.
 *
 * `AsyncLocalStorage` is not an option: the package builds `platform: "neutral"`
 * and must stay browser-safe. When TC39 `AsyncContext.Variable` ships it can
 * replace the echo behind `getZone`/`runInZone` without touching callers.
 */

/**
 * The minimal shape a zone needs from a Transaction. Widened to the real
 * Transaction interface once that exists; kept structural here so this module
 * stays at the bottom of the import graph.
 */
export interface ZoneTransaction {
    active: boolean;
    storeNames: string[];
}

export interface Zone {
    readonly id: number;
    readonly parent: Zone | null;
    /** The root zone. Global zones are never echoed -- there is nothing to carry. */
    readonly global: boolean;
    /** The transaction table operations should join, if any. */
    trans?: ZoneTransaction | undefined;
    /** Nearest ancestor without a `trans`, for `ignoreTransaction()`. */
    transless?: Zone | undefined;
    /** Bypasses the db-open gate, for `on('ready')` subscribers. */
    vip?: boolean | undefined;
    /**
     * Where reads made inside this zone are recorded, for `liveQuery`.
     *
     * Typed structurally for the same reason as `trans`: it keeps this module
     * at the bottom of the import graph. It is always an ObservabilitySet.
     */
    subscr?: Record<string, unknown> | undefined;
    /**
     * Outstanding work: promises and enqueued listeners created in this zone,
     * plus one for every child zone that currently has work of its own. That
     * second term is what lets `follow()` on an outer scope wait for inner
     * scopes -- see `retain`/`release`.
     */
    pending: number;
    finalize: () => void;
    /**
     * Where a rejection nobody handled ends up. `follow()` installs one so an
     * `on('populate')` subscriber, an upgrader or a fire-and-forget scope body
     * that starts a failing operation and never looks at it still fails the
     * whole thing, the way Dexie does. Looked up by walking the chain, so a
     * nested zone reports to the nearest enclosing follow.
     */
    onunhandled?: ((reason: unknown) => void) | undefined;
}

let zoneCounter = 0;

const noop = (): void => {};

export const rootZone: Zone = {
    id: 0,
    parent: null,
    global: true,
    pending: 0,
    finalize: noop,
};

let currentZone: Zone = rootZone;

export function getZone(): Zone {
    return currentZone;
}

/**
 * FIFO of zones owed to native jobs that have been enqueued but not yet run.
 * Kept 1:1 with those jobs: each `armEcho` pushes one entry and queues exactly
 * one microtask to shift it back off.
 */
const echoes: Zone[] = [];

function armEcho(zone: Zone): void {
    if (zone.global) return; // nothing to propagate outside a scope
    echoes.push(zone);
    queueMicrotask(disarmEcho);
    // Deliberately does NOT assign currentZone. Handing the zone over is the
    // drain's job, so that synchronous code following a top-level scope call
    // does not observe the scope's zone.
}

function disarmEcho(): void {
    echoes.shift();
    currentZone = echoes.length > 0 ? echoes[0]! : rootZone;
}

/**
 * Hand the front of the FIFO to whatever native job runs next. Called as the
 * last statement of the scheduler's drain; see scheduler.ts.
 */
export function applyEchoFront(): void {
    currentZone = echoes.length > 0 ? echoes[0]! : rootZone;
}

/**
 * Run `fn` in `zone`, restoring the previous zone afterwards.
 *
 * The `finally` arms the echo, which is what carries the zone across whatever
 * native jobs `fn` just enqueued -- a `PromiseResolveThenableJob` from an
 * `await`, or the reaction job that resumes an async body.
 */
export function runInZone<A extends unknown[], R>(
    zone: Zone,
    fn: (...args: A) => R,
    ...args: A
): R {
    const previous = currentZone;
    currentZone = zone;
    try {
        return fn(...args);
    } finally {
        currentZone = previous;
        armEcho(zone);
    }
}

/** Create a child zone and run `fn` inside it. */
export function newZone<R>(fn: () => R, props?: Partial<Zone>): R {
    const parent = currentZone;
    const zone: Zone = {
        ...props,
        id: ++zoneCounter,
        parent,
        global: false,
        pending: 0,
        finalize: noop,
    };

    // A child's outstanding work counts as the parent's, so `follow()` on an
    // outer scope waits for inner scopes too. The parent is charged when the
    // child goes from idle to busy (`retain`) and paid back when it goes idle
    // again (here), so the two always balance -- a child legitimately touches
    // zero once per `await` in its body, and paying the parent back on every
    // one of those, against a single up-front charge, drove the parent's
    // counter negative and with it broke `_zoneLost` and `follow()`.
    if (!parent.global) {
        zone.finalize = () => release(parent);
    }

    return runInZone(zone, fn);
}

/**
 * The nearest enclosing read-observation set, if any.
 *
 * Walks the chain rather than reading the current zone: a table operation runs
 * in a child zone carrying its transaction, so a `liveQuery` querier's `subscr`
 * is always one or more levels up by the time a read reaches DBCore. Reading
 * only the current zone would record nothing at all -- and record nothing is
 * exactly the failure that shows up later as a query that never re-fires.
 */
export function getSubscr(): Record<string, unknown> | undefined {
    for (let zone: Zone | null = currentZone; zone; zone = zone.parent) {
        if (zone.subscr) return zone.subscr;
    }
    return undefined;
}

/**
 * True when the caller is inside a VIP scope.
 *
 * Walks the chain for the same reason `getSubscr` does: an `on('populate')`
 * subscriber that opens a nested scope is still VIP, and reading only the
 * current zone would lose that one level down.
 */
export function isVip(): boolean {
    for (let zone: Zone | null = currentZone; zone; zone = zone.parent) {
        if (zone.vip) return true;
    }
    return false;
}

/**
 * Retain/release the zone's work counter. Used by NexiePromise.
 *
 * A zone going from idle to busy retains its parent, and `finalize` (installed
 * by `newZone`) releases it again when the zone goes idle -- so a parent's
 * counter carries "how many children are busy" alongside its own promises,
 * and never goes negative.
 */
export function retain(zone: Zone): void {
    if (zone.global) return;
    if (zone.pending++ === 0 && zone.parent && !zone.parent.global) {
        retain(zone.parent);
    }
}

export function release(zone: Zone): void {
    if (!zone.global && --zone.pending === 0) zone.finalize();
}

/** The nearest unhandled-rejection sink up the chain, if any. */
export function findUnhandledSink(
    zone: Zone,
): ((reason: unknown) => void) | undefined {
    for (let z: Zone | null = zone; z; z = z.parent) {
        if (z.onunhandled) return z.onunhandled;
    }
    return undefined;
}
