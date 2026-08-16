import FDBObjectStore from "./FDBObjectStore.ts";
import FDBRequest from "./FDBRequest.ts";
import {
    AbortError,
    InvalidStateError,
    NotFoundError,
    TransactionInactiveError,
} from "./lib/errors.ts";
import FakeDOMStringList from "./lib/FakeDOMStringList.ts";
import FakeEvent from "./lib/FakeEvent.ts";
import FakeEventTarget from "./lib/FakeEventTarget.ts";
import { queueTask } from "./lib/scheduling.ts";
import type FDBDatabase from "./FDBDatabase.ts";
import type {
    EventCallback,
    FDBTransactionDurability,
    RequestObj,
    RollbackLog,
    TransactionMode,
} from "./lib/types.ts";
import type FDBOpenDBRequest from "./FDBOpenDBRequest.ts";
import type ObjectStore from "./lib/ObjectStore.ts";
import type Index from "./lib/Index.ts";
import { defineInterface } from "./lib/webidl.ts";

const prioritizedListenerTypes = ["error", "abort", "complete"] as const;
export type PrioritizedListenerType = (typeof prioritizedListenerTypes)[number];

// http://www.w3.org/TR/2015/REC-IndexedDB-20150108/#transaction
class FDBTransaction extends FakeEventTarget {
    public _state: "active" | "inactive" | "committing" | "finished" = "active";
    public _started = false;
    public _rollbackLog: RollbackLog = [];
    public _objectStoresCache: Map<string, FDBObjectStore> = new Map();
    public _openRequest: FDBOpenDBRequest | null = null;

    public _objectStoreNames: FakeDOMStringList;
    // readonly attribute, per IndexedDB.idl
    get objectStoreNames() {
        return this._objectStoreNames;
    }
    public _mode: TransactionMode;
    // readonly attribute, per IndexedDB.idl
    get mode() {
        return this._mode;
    }
    public _durability: FDBTransactionDurability;
    // readonly attribute, per IndexedDB.idl
    get durability() {
        return this._durability;
    }
    public _db: FDBDatabase;
    // readonly attribute, per IndexedDB.idl
    get db() {
        return this._db;
    }
    public _error: Error | null = null;
    // readonly attribute, per IndexedDB.idl
    get error() {
        return this._error;
    }
    public _onabort: EventCallback | null = null;
    // event handler attribute, per IndexedDB.idl
    get onabort() {
        return this._onabort;
    }
    set onabort(value: EventCallback | null) {
        this._onabort = value;
    }
    public _oncomplete: EventCallback | null = null;
    // event handler attribute, per IndexedDB.idl
    get oncomplete() {
        return this._oncomplete;
    }
    set oncomplete(value: EventCallback | null) {
        this._oncomplete = value;
    }
    public _onerror: EventCallback | null = null;
    // event handler attribute, per IndexedDB.idl
    get onerror() {
        return this._onerror;
    }
    set onerror(value: EventCallback | null) {
        this._onerror = value;
    }

    public _prioritizedListeners = new Map<
        PrioritizedListenerType,
        () => void
    >();
    public _scope: Set<string>;
    private _requests: {
        operation: () => void;
        request: FDBRequest;
    }[] = [];

    public _createdIndexes = new Set<Index>();
    public _createdObjectStores = new Set<ObjectStore>();

    constructor(
        storeNames: string[],
        mode: TransactionMode,
        durability: FDBTransactionDurability,
        db: FDBDatabase,
    ) {
        super();

        this._scope = new Set(storeNames);
        this._mode = mode;
        this._durability = durability;
        this._db = db;
        this._objectStoreNames = new FakeDOMStringList(
            ...Array.from(this._scope).sort(),
        );

        for (const type of prioritizedListenerTypes) {
            // Attach prioritized (internal) listeners before any external listeners are attached.
            // This ensures that these listeners run with the same timing regardless of whether
            // the user uses `on*` or `addEventListener` for event listeners.
            this.addEventListener(type, () => {
                this._prioritizedListeners.get(type)?.();
            });
        }
    }

    // https://w3c.github.io/IndexedDB/#abort-transaction
    public _abort(errName: string | null) {
        for (const f of this._rollbackLog.reverse()) {
            f();
        }

        if (errName !== null) {
            const e = new DOMException(undefined, errName);
            this._error = e;
        }

        // Should this directly remove from _requests?
        for (const { request } of this._requests) {
            if (request.readyState !== "done") {
                request._readyState = "done"; // This will cancel execution of this request's operation
                if (request.source) {
                    // https://w3c.github.io/IndexedDB/#ref-for-list-iterate%E2%91%A2
                    // For each request of transaction’s request list, abort the steps to asynchronously
                    // execute a request for request, set request’s processed flag to true, and queue a
                    // database task to run these steps:
                    queueTask(() => {
                        // Set request’s result to undefined.
                        request._result = undefined;
                        // Set request’s error to a newly created "AbortError" DOMException.
                        request._error = new AbortError();

                        // Fire an event named error at request with its bubbles and cancelable attributes initialized
                        // to true.
                        const event = new FakeEvent("error", {
                            bubbles: true,
                            cancelable: true,
                        });
                        event.eventPath = [this.db, this];
                        try {
                            request.dispatchEvent(event);
                        } catch (_err) {
                            if (this._state === "active") {
                                this._abort("AbortError");
                            }
                        }
                    });
                }
            }
        }

        // Queue a database task to run these steps:
        queueTask(() => {
            // If transaction is an upgrade transaction, then set transaction’s connection’s associated database’s
            // upgrade transaction to null.
            // (i.e. remove it from the list of `db.connections`)
            const isUpgradeTransaction = this.mode === "versionchange";
            if (isUpgradeTransaction) {
                this.db._rawDatabase.connections =
                    this.db._rawDatabase.connections.filter(
                        (connection) =>
                            !connection._rawDatabase.transactions.includes(
                                this,
                            ),
                    );
            }
            // Fire an event named abort at transaction with its bubbles attribute initialized to true.
            const event = new FakeEvent("abort", {
                bubbles: true,
                cancelable: false,
            });
            event.eventPath = [this.db];
            this.dispatchEvent(event);

            // If transaction is an upgrade transaction, then:
            if (isUpgradeTransaction) {
                // Let request be the open request associated with transaction.
                const request = this._openRequest!;
                // Set request’s transaction to null.
                request._transaction = null;
                // Set request’s result to undefined.
                request._result = undefined;
            }
        });

        this._state = "finished";
    }

    public abort() {
        if (this._state === "committing" || this._state === "finished") {
            throw new InvalidStateError();
        }
        this._state = "active";

        this._abort(null);
    }

    // http://w3c.github.io/IndexedDB/#dom-idbtransaction-objectstore
    public objectStore(name: string) {
        if (this._state !== "active") {
            throw new InvalidStateError();
        }

        const objectStore = this._objectStoresCache.get(name);
        if (objectStore !== undefined) {
            return objectStore;
        }

        const rawObjectStore = this.db._rawDatabase.rawObjectStores.get(name);
        if (!this._scope.has(name) || rawObjectStore === undefined) {
            throw new NotFoundError();
        }

        const objectStore2 = new FDBObjectStore(this, rawObjectStore);
        this._objectStoresCache.set(name, objectStore2);

        return objectStore2;
    }

    // http://www.w3.org/TR/2015/REC-IndexedDB-20150108/#dfn-steps-for-asynchronously-executing-a-request
    public _execRequestAsync(obj: RequestObj) {
        const source = obj.source;
        const operation = obj.operation;
        let request = Object.hasOwn(obj, "request") ? obj.request : null;

        if (this._state !== "active") {
            throw new TransactionInactiveError();
        }

        // Request should only be passed for cursors
        if (!request) {
            if (!source) {
                // Special requests like indexes that just need to run some code
                request = new FDBRequest();
            } else {
                request = new FDBRequest();
                request._source = source;
                request._transaction = (source as any).transaction;
            }
        }

        this._requests.push({
            operation,
            request,
        });

        return request;
    }

    public _start() {
        this._started = true;

        // Remove from request queue - cursor ones will be added back if necessary by cursor.continue and such
        let operation;
        let request;
        while (this._requests.length > 0) {
            const r = this._requests.shift();

            // This should only be false if transaction was aborted
            if (r && r.request.readyState !== "done") {
                request = r.request;
                operation = r.operation;
                break;
            }
        }

        if (request && operation) {
            if (!request.source) {
                // Special requests like indexes that just need to run some code, with error handling already built into
                // operation
                operation();
            } else {
                let defaultAction;
                let event;
                try {
                    const result = operation();
                    request._readyState = "done";
                    request._result = result;
                    request._error = undefined;

                    // http://www.w3.org/TR/2015/REC-IndexedDB-20150108/#dfn-fire-a-success-event
                    if (this._state === "inactive") {
                        this._state = "active";
                    }
                    event = new FakeEvent("success", {
                        bubbles: false,
                        cancelable: false,
                    });
                } catch (err) {
                    request._readyState = "done";
                    request._result = undefined;
                    request._error = err;

                    // http://www.w3.org/TR/2015/REC-IndexedDB-20150108/#dfn-fire-an-error-event
                    if (this._state === "inactive") {
                        this._state = "active";
                    }
                    event = new FakeEvent("error", {
                        bubbles: true,
                        cancelable: true,
                    });

                    defaultAction = this._abort.bind(this, err.name);
                }

                try {
                    event.eventPath = [this.db, this];
                    request.dispatchEvent(event);
                } catch (_err) {
                    if (this._state === "active") {
                        this._abort("AbortError");
                        defaultAction = undefined; // do not abort again
                    }
                }

                // Default action of event
                if (!event.canceled) {
                    if (defaultAction) {
                        defaultAction();
                    }
                }
            }

            // Give it another chance for new handlers to be set before finishing
            queueTask(this._start.bind(this));
            return;
        }

        // Check if transaction complete event needs to be fired
        if (this._state !== "finished") {
            // Either aborted or committed already
            this._state = "finished";

            if (!this.error) {
                const event = new FakeEvent("complete");
                this.dispatchEvent(event);
            }
        }
    }

    public commit() {
        if (this._state !== "active") {
            throw new InvalidStateError();
        }

        this._state = "committing";
    }

    get [Symbol.toStringTag]() {
        return "IDBTransaction";
    }
}

// Operation arities come from IndexedDB.idl -- see the `operations` note in
// lib/webidl.ts for why they cannot be read off the JS functions.
defineInterface(FDBTransaction, {
    name: "IDBTransaction",
    operations: {
        objectStore: 1,
        commit: 0,
        abort: 0,
    },
});

export default FDBTransaction;
