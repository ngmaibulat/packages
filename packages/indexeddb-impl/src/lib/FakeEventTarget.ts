import { InvalidStateError } from "./errors.ts";
import type FakeEvent from "./FakeEvent.ts";
import type {
    EventCallback,
    EventCallbackOrEventCallbackObject,
    EventType,
} from "./types.ts";

type EventTypeProp =
    | "onabort"
    | "onblocked"
    | "onclose"
    | "oncomplete"
    | "onerror"
    | "onsuccess"
    | "onupgradeneeded"
    | "onversionchange";

interface Listener {
    callback: EventCallbackOrEventCallbackObject;
    capture: boolean;
    type: EventType;
    /** Remove the listener after it is next invoked. */
    once: boolean;
    /**
     * Detaches the `abort` listener registered for an AddEventListenerOptions
     * `signal`, so removing the listener by hand does not leak it.
     */
    removeAbortListener?: () => void;
}

const stopped = (event: FakeEvent, listener: Listener) => {
    return (
        event.immediatePropagationStopped ||
        (event.eventPhase === event.CAPTURING_PHASE &&
            listener.capture === false) ||
        (event.eventPhase === event.BUBBLING_PHASE && listener.capture === true)
    );
};

// http://www.w3.org/TR/dom/#concept-event-listener-invoke
const invokeEventListeners = (event: FakeEvent, obj: FakeEventTarget) => {
    event.currentTarget = obj;

    const errors: Error[] = [];
    const invoke = (callbackOrObject: EventCallbackOrEventCallbackObject) => {
        try {
            const callback =
                typeof callbackOrObject === "function"
                    ? callbackOrObject
                    : callbackOrObject.handleEvent;
            // @ts-expect-error EventCallback's types are not quite right here
            callback.call(event.currentTarget, event);
        } catch (err) {
            errors.push(err);
        }
    };

    // The callback might cause obj._listeners to mutate as we traverse it.
    // Take a copy of the array so that nothing sneaks in and we don't lose
    // our place.
    for (const listener of obj._listeners.slice()) {
        if (event.type !== listener.type || stopped(event, listener)) {
            continue;
        }

        // Remove a `once` listener *before* invoking it, per the DOM standard.
        // A callback that re-dispatches the same event -- a cursor handler
        // calling continue() is the ordinary case -- would otherwise see itself
        // still registered and run again.
        if (listener.once) {
            obj._removeListener(listener);
        }

        invoke(listener.callback);
    }

    const typeToProp: { [key in EventType]: EventTypeProp } = {
        abort: "onabort",
        blocked: "onblocked",
        close: "onclose",
        complete: "oncomplete",
        error: "onerror",
        success: "onsuccess",
        upgradeneeded: "onupgradeneeded",
        versionchange: "onversionchange",
    };
    const prop = typeToProp[event.type];
    if (prop === undefined) {
        throw new Error(`Unknown event type: "${event.type}"`);
    }

    // Each interface defines accessors for the handlers its own IDL declares,
    // so the base cannot usefully type all eight -- declaring them here as
    // fields is what used to give every instance all eight as own properties,
    // shadowing those accessors.
    const callback = (
        event.currentTarget as unknown as Record<
            EventTypeProp,
            EventCallback | null | undefined
        >
    )[prop];
    if (callback) {
        // A synthetic listener standing in for the `on…` handler property, only
        // so `stopped()` can be reused. It is never registered, so `once` has
        // nothing to mean here.
        const listener: Listener = {
            callback,
            capture: false,
            type: event.type,
            once: false,
        };
        if (!stopped(event, listener)) {
            invoke(listener.callback);
        }
    }

    // we want to execute all listeners before deciding if we want to throw, because there could be an error thrown by
    // the first listener, but the second should still be invoked
    if (errors.length) {
        throw new AggregateError(errors);
    }
};

abstract class FakeEventTarget {
    private _listenerList?: Listener[];

    /**
     * Registered listeners, created on demand.
     *
     * Lazy rather than a field initializer because FakeEventTarget is spliced
     * out of the prototype chain by inheritEventTarget() below -- its
     * constructor never runs, so a field initializer would never fire. The
     * name is underscored to keep it off the WebIDL surface: EventTarget has no
     * such member.
     */
    public get _listeners(): Listener[] {
        return (this._listenerList ??= []);
    }

    public addEventListener(
        type: EventType,
        callback: EventCallbackOrEventCallbackObject,
        options?: boolean | AddEventListenerOptions | undefined,
    ) {
        const isDictionary = typeof options === "object" && options !== null;
        const capture = !!(isDictionary ? options.capture : options);
        const once = !!(isDictionary && options.once);
        const signal = isDictionary ? options.signal : undefined;

        // An already-aborted signal means the listener is never added at all.
        if (signal?.aborted) {
            return;
        }

        // The DOM standard's "add an event listener" step 4: a listener whose
        // type, callback and capture already appear in the list is not added
        // again. Without this the same handler fired once per registration.
        const duplicate = this._listeners.some(
            (candidate) =>
                candidate.type === type &&
                candidate.callback === callback &&
                candidate.capture === capture,
        );
        if (duplicate) {
            return;
        }

        const listener: Listener = { callback, capture, type, once };

        if (signal) {
            const onAbort = () => this._removeListener(listener);
            signal.addEventListener("abort", onAbort, { once: true });
            listener.removeAbortListener = () =>
                signal.removeEventListener("abort", onAbort);
        }

        this._listeners.push(listener);
    }

    public removeEventListener(
        type: EventType,
        callback: EventCallbackOrEventCallbackObject,
        options?: boolean | AddEventListenerOptions | undefined,
    ) {
        const capture = !!(typeof options === "object" && options
            ? options.capture
            : options);
        const listener = this._listeners.find((candidate) => {
            return (
                candidate.type === type &&
                candidate.callback === callback &&
                candidate.capture === capture
            );
        });

        if (listener) {
            this._removeListener(listener);
        }
    }

    /**
     * Drop a listener and release whatever it is holding.
     *
     * Shared by removeEventListener, the `once` path and the `signal` path, so
     * that all three detach the abort listener rather than leaving it attached
     * to a signal that may outlive the target.
     */
    public _removeListener(listener: Listener) {
        const i = this._listeners.indexOf(listener);
        if (i === -1) {
            return;
        }
        this._listeners.splice(i, 1);
        listener.removeAbortListener?.();
    }

    // http://www.w3.org/TR/dom/#dispatching-events
    public dispatchEvent(event: FakeEvent) {
        if (event.dispatched || !event.initialized) {
            throw new InvalidStateError("The object is in an invalid state.");
        }
        event.isTrusted = false;

        event.dispatched = true;
        event.target = this;
        // NOT SURE WHEN THIS SHOULD BE SET        event.eventPath = [];

        event.eventPhase = event.CAPTURING_PHASE;
        for (const obj of event.eventPath) {
            if (!event.propagationStopped) {
                invokeEventListeners(event, obj);
            }
        }

        event.eventPhase = event.AT_TARGET;
        if (!event.propagationStopped) {
            invokeEventListeners(event, event.target);
        }

        if (event.bubbles) {
            event.eventPath.reverse();
            event.eventPhase = event.BUBBLING_PHASE;
            for (const obj of event.eventPath) {
                if (!event.propagationStopped) {
                    invokeEventListeners(event, obj);
                }
            }
        }

        event.dispatched = false;
        event.eventPhase = event.NONE;
        event.currentTarget = null;

        if (event.canceled) {
            return false;
        }
        return true;
    }
}

/**
 * Put a class directly under `EventTarget` in the prototype chain.
 *
 * WebIDL says `IDBRequest` inherits `EventTarget`, and idlharness checks the
 * *direct* link: `Object.getPrototypeOf(IDBRequest.prototype)` must be
 * `EventTarget.prototype`. Simply writing `class FakeEventTarget extends
 * EventTarget` would not satisfy that, because FakeEventTarget.prototype would
 * still sit in between. So its members are copied onto the class's own
 * prototype and it is spliced out of the chain entirely.
 *
 * Reassigning the constructor's prototype also changes what `super()` resolves
 * to -- it becomes the real `EventTarget`, so instances get genuine EventTarget
 * internal slots rather than an object that merely claims to be one. That is
 * why `_listeners` had to become lazy: FakeEventTarget's constructor no longer
 * runs.
 *
 * Call this *after* defineInterface, so the copied members are not swept into
 * the WebIDL enumerability and brand-check pass -- they belong to
 * EventTarget.prototype in the spec, not to this interface.
 */
export function inheritEventTarget(ctor: {
    prototype: object;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    new (...args: any[]): unknown;
}): void {
    for (const key of Reflect.ownKeys(FakeEventTarget.prototype)) {
        if (key === "constructor") continue;
        if (Object.hasOwn(ctor.prototype, key)) continue;
        const descriptor = Object.getOwnPropertyDescriptor(
            FakeEventTarget.prototype,
            key,
        );
        if (descriptor) {
            Object.defineProperty(ctor.prototype, key, descriptor);
        }
    }

    Object.setPrototypeOf(ctor.prototype, EventTarget.prototype);
    Object.setPrototypeOf(ctor, EventTarget);
}

export default FakeEventTarget;
