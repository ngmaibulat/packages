import { applyEchoFront } from './zone.ts';

/**
 * A virtual microtask queue, drained synchronously.
 *
 * Everything a burst of continuations does -- including the IndexedDB requests
 * they issue -- happens inside one native microtask, which is the strongest
 * transaction-liveness position available: HTML runs "Cleanup Indexed Database
 * transactions" only after the microtask queue drains to empty.
 *
 * It also gives two things the design needs and the native queue cannot
 * provide: a well-defined "our drain ended" point, which is where the zone is
 * handed over to the native resume jobs, and a decidable quiescence condition
 * for `follow()`.
 */

type Job = () => void;

let queue: Job[] = [];
let scheduled = false;

/** Callbacks to run once the queue has drained to empty. */
let tickFinalizers: Job[] = [];

/** Schedule a job on the virtual queue. */
export function enqueue(job: Job): void {
    queue.push(job);
    if (!scheduled) {
        scheduled = true;
        queueMicrotask(drain);
    }
}

/**
 * Run `fn` once the virtual queue has drained to empty. This is the "no more
 * scheduled calls" condition, expressed purely on our own queue rather than on
 * any global tick accounting.
 */
export function atEndOfTick(fn: Job): void {
    tickFinalizers.push(fn);
    // A finalizer registered while nothing is queued still has to run, so make
    // sure a drain is pending.
    if (!scheduled) {
        scheduled = true;
        queueMicrotask(drain);
    }
}

function runTickFinalizers(): void {
    while (tickFinalizers.length > 0) {
        const finalizers = tickFinalizers;
        tickFinalizers = [];
        for (const finalizer of finalizers) finalizer();
    }
}

function drain(): void {
    scheduled = false;
    try {
        // A finalizer may enqueue more work, and that work may register more
        // finalizers, so both loops repeat until genuinely quiescent.
        do {
            while (queue.length > 0) {
                const jobs = queue;
                queue = [];
                // Jobs are exception-safe by construction: each one catches
                // before it reaches user code, so a throw here cannot escape and
                // strand the rest of the queue.
                for (const job of jobs) job();
            }
            runTickFinalizers();
        } while (queue.length > 0);
    } finally {
        // MUST be last. This is what the native resume jobs read, and getting
        // it wrong loses the zone for every continuation in the drain.
        applyEchoFront();
    }
}
