import type FakeEventTarget from "./FakeEventTarget.ts";
import type { EventType } from "./types.ts";

class Event {
    public eventPath: FakeEventTarget[] = [];
    public type: EventType;

    public readonly NONE = 0;
    public readonly CAPTURING_PHASE = 1;
    public readonly AT_TARGET = 2;
    public readonly BUBBLING_PHASE = 3;

    // Flags
    public propagationStopped = false;
    public immediatePropagationStopped = false;
    public canceled = false;
    public initialized = true;
    public dispatched = false;

    public target: FakeEventTarget | null = null;
    public currentTarget: FakeEventTarget | null = null;

    public eventPhase: 0 | 1 | 2 | 3 = 0;

    // https://dom.spec.whatwg.org/#dom-event-defaultprevented -- "return true
    // if this's canceled flag is set". It was a plain field that nothing ever
    // set, so `preventDefault()` was invisible to anyone reading it -- and a
    // wrapper deciding whether an error was cancelled during bubbling read it.
    public get defaultPrevented(): boolean {
        return this.canceled;
    }

    public isTrusted = false;
    public timeStamp = Date.now();

    public bubbles: boolean;
    public cancelable: boolean;

    constructor(
        type: EventType,
        eventInitDict: { bubbles?: boolean; cancelable?: boolean } = {},
    ) {
        this.type = type;

        this.bubbles =
            eventInitDict.bubbles !== undefined ? eventInitDict.bubbles : false;
        this.cancelable =
            eventInitDict.cancelable !== undefined
                ? eventInitDict.cancelable
                : false;
    }

    public preventDefault() {
        if (this.cancelable) {
            this.canceled = true;
        }
    }

    public stopPropagation() {
        this.propagationStopped = true;
    }

    public stopImmediatePropagation() {
        this.propagationStopped = true;
        this.immediatePropagationStopped = true;
    }
}

export default Event;
