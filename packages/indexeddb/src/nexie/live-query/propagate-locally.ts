import { globalEvents } from '../globals/global-events.ts';
import {
    deserializeObsSet,
    serializeObsSet,
    type ObservabilitySet,
    type SerializedObsSet,
} from './obs-set.ts';

/**
 * Cross-tab propagation.
 *
 * IndexedDB is shared by every tab on an origin, so a write in one tab makes
 * another tab's `liveQuery` stale with nothing local to notice it. A
 * `BroadcastChannel` carries the mutated key ranges across, and the receiving
 * side fires them on its own `storagemutated` bus -- from there the code path
 * is identical to a local write.
 *
 * Feature-detected rather than assumed: this package builds
 * `platform: "neutral"` and runs under Node and Bun as well as browsers. Where
 * `BroadcastChannel` is missing, everything below degrades to a no-op and only
 * same-context observability remains.
 */

const CHANNEL_NAME = 'nexie-storagemutated';

type Channel = {
    postMessage(message: unknown): void;
    onmessage: ((event: { data: unknown }) => void) | null;
    unref?: () => void;
};

let channel: Channel | null = null;
let attempted = false;

function getChannel(): Channel | null {
    if (attempted) return channel;
    attempted = true;

    const ctor = (globalThis as { BroadcastChannel?: new (name: string) => Channel })
        .BroadcastChannel;
    if (!ctor) return null;

    try {
        const created = new ctor(CHANNEL_NAME);
        created.onmessage = (event) => {
            const data = event.data as
                | { nexie?: SerializedObsSet }
                | undefined;
            if (!data?.nexie) return;
            globalEvents.storagemutated.fire(deserializeObsSet(data.nexie));
        };
        // Node and Bun keep the event loop alive for an open channel; a library
        // that quietly stops a process from exiting is a library that turns
        // every test run into a hang.
        created.unref?.();
        channel = created;
    } catch {
        // A channel that cannot be constructed is not worth failing a write over.
        channel = null;
    }

    return channel;
}

/**
 * Announce a committed transaction's changes, here and in every other context
 * on this origin.
 *
 * A `BroadcastChannel` never delivers a message back to its own sender, so the
 * local fire and the remote post do not double up.
 */
export function publishMutations(parts: ObservabilitySet): void {
    globalEvents.storagemutated.fire(parts);

    const bc = getChannel();
    if (!bc) return;

    try {
        bc.postMessage({ nexie: serializeObsSet(parts) });
    } catch {
        // Keys are structured-cloneable by definition, so this should not
        // happen -- but a failed notification must not fail the write that
        // succeeded.
    }
}

/** Open the receiving end, so writes made elsewhere reach this context. */
export function listenForRemoteMutations(): void {
    getChannel();
}
