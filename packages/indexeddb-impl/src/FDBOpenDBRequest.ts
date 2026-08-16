import FDBRequest from "./FDBRequest.ts";
import type { EventCallback } from "./lib/types.ts";

class FDBOpenDBRequest extends FDBRequest {
    public override onupgradeneeded: EventCallback | null = null;
    public override onblocked: EventCallback | null = null;

    override get [Symbol.toStringTag]() {
        return "IDBOpenDBRequest";
    }
}

export default FDBOpenDBRequest;
