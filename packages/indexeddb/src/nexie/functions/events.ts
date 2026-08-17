import {
    nonStoppableChain,
    type ChainFunction,
} from './chaining.ts';

/**
 * A single event: a subscriber list plus a `fire` that composes them according
 * to the event's chain function.
 *
 * The composed function is rebuilt on every subscribe/unsubscribe rather than
 * being walked at fire time, so firing an event with no subscribers costs one
 * call to a no-op -- which is what lets the hook machinery short-circuit
 * cheaply.
 */
export interface NexieEvent<
    T extends (...args: any[]) => any = (...args: any[]) => any,
> {
    subscribers: T[];
    /**
     * Extra arguments are passed through by `on(name, fn, ...rest)`. The base
     * event ignores them; `ready` overrides `subscribe` to read `bSticky`.
     */
    subscribe(fn: T, ...rest: unknown[]): void;
    unsubscribe(fn: T): void;
    fire: T;
    /** True while nothing is subscribed, so callers can skip expensive setup. */
    readonly hasSubscribers: boolean;
}

export const nop = (): void => {};

export function createEvent<T extends (...args: any[]) => any>(
    chain: ChainFunction = nonStoppableChain,
    defaultFunction: (...args: any[]) => any = nop,
): NexieEvent<T> {
    const event = {
        subscribers: [] as T[],
        fire: defaultFunction as T,
        get hasSubscribers() {
            return event.subscribers.length > 0;
        },
        subscribe(fn: T) {
            if (event.subscribers.includes(fn)) return;
            event.subscribers.push(fn);
            event.fire = chain(event.fire, fn) as T;
        },
        unsubscribe(fn: T) {
            const index = event.subscribers.indexOf(fn);
            if (index === -1) return;
            event.subscribers.splice(index, 1);
            // Rebuild rather than trying to unpick the composed function.
            event.fire = event.subscribers.reduce(
                (composed, subscriber) => chain(composed, subscriber),
                defaultFunction,
            ) as T;
        },
    };
    return event;
}

/** Descriptor for one event type in a set. */
export interface EventTypeSpec {
    chain?: ChainFunction;
    defaultFunction?: (...args: any[]) => any;
}

export interface NexieEventSet {
    (
        eventName: string,
        subscriber: (...args: any[]) => any,
        ...rest: unknown[]
    ): unknown;
    /** Direct access: `db.on.populate.subscribe(fn)`. */
    [eventName: string]: any;
    addEventType(name: string, spec?: EventTypeSpec): NexieEvent;
}

/**
 * Build a callable event set.
 *
 * `ctx` is returned from `on(...)` so subscribing can be chained the way Dexie
 * allows (`db.on('populate', f).on('ready', g)` reads as one statement).
 */
export function Events(ctx?: unknown): NexieEventSet {
    const events: Record<string, NexieEvent> = {};

    const on = function (
        eventName: string,
        subscriber: (...args: any[]) => any,
        ...rest: unknown[]
    ) {
        const event = events[eventName];
        if (!event) {
            throw new TypeError(`Unknown event type: ${eventName}`);
        }
        event.subscribe(subscriber, ...rest);
        return ctx;
    } as NexieEventSet;

    on.addEventType = (name: string, spec?: EventTypeSpec): NexieEvent => {
        const event = createEvent(spec?.chain, spec?.defaultFunction);
        events[name] = event;
        // Exposed as a property too, so `on.populate.fire(...)` works alongside
        // `on('populate', fn)`.
        Object.defineProperty(on, name, {
            value: event,
            configurable: true,
            enumerable: true,
        });
        return event;
    };

    return on;
}

/** `db.once(...)`: subscribe, then unsubscribe as soon as it fires. */
export function once(
    on: NexieEventSet,
    eventName: string,
    subscriber: (...args: any[]) => any,
): void {
    const wrapper = (...args: unknown[]) => {
        (on[eventName] as NexieEvent).unsubscribe(wrapper);
        return subscriber(...args);
    };
    on(eventName, wrapper);
}
