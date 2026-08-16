import { exceptions } from '../errors/errors.ts';
import { NexiePromise } from '../zone/nexie-promise.ts';
import { getZone, runInZone, type Zone } from '../zone/zone.ts';
import type { Nexie } from './nexie.ts';
import type { Table } from './table.ts';
import type { ParsedMode, TransactionMode } from '../types/transaction.ts';

const ReadOnlyError = exceptions['ReadOnly']!;
const NotFoundError = exceptions['NotFound']!;
const InvalidArgumentError = exceptions['InvalidArgument']!;
const TransactionInactiveError = exceptions['TransactionInactive']!;
const AbortError = exceptions['Abort']!;

type BlockedFunc = [fn: () => void, zone: Zone];

/** Decompose a mode string into its IDB mode plus the `!` / `?` modifiers. */
export function parseMode(mode: TransactionMode): ParsedMode {
    const forceNew = mode.endsWith('!');
    const lenient = mode.endsWith('?');
    const base = forceNew || lenient ? mode.slice(0, -1) : mode;

    if (base === 'r' || base === 'readonly') {
        return { idbMode: 'readonly', forceNew, lenient };
    }
    if (base === 'rw' || base === 'readwrite') {
        return { idbMode: 'readwrite', forceNew, lenient };
    }
    throw new InvalidArgumentError(`Invalid transaction mode: ${mode}`);
}

export class Transaction {
    readonly db: Nexie;
    readonly mode: IDBTransactionMode;
    readonly storeNames: string[];
    readonly parent: Transaction | undefined;

    /** True while the underlying IDB transaction can still accept requests. */
    active = false;
    /** Set by `enterTransactionScope`; drives the PrematureCommit check. */
    explicit = false;

    idbtrans!: IDBTransaction;

    /** Settles when the transaction commits, rejects when it aborts. */
    readonly _completion: NexiePromise<void>;
    private _resolveCompletion!: () => void;
    private _rejectCompletion!: (reason?: unknown) => void;
    private _completionSettled = false;
    /**
     * Why the transaction ended, when it ended badly.
     *
     * Kept so the scope can report the real cause -- an explicit `abort()`, or a
     * ConstraintError that aborted the transaction -- rather than the generic
     * PrematureCommitError it would otherwise infer from `active === false`.
     */
    _completionError: unknown = null;

    /**
     * Recursive write lock. Counted rather than boolean because a locked
     * operation may legitimately re-enter (Collection.modify issuing writes
     * while it holds the lock), and keyed on the owning zone rather than any
     * thread-local, since that is the only notion of "same logical caller" we
     * have.
     */
    private _reculock = 0;
    private _lockOwner: Zone | null = null;
    private _blockedFuncs: BlockedFunc[] = [];

    private _memoizedTables = new Map<string, Table>();

    /**
     * What this transaction has written, accumulated by the observability
     * middleware and published on commit -- never before, so an aborted
     * transaction notifies nobody. Lives on the root transaction, since that is
     * the one whose commit is real.
     *
     * Typed structurally to keep the live-query graph out of this module; it is
     * always an ObservabilitySet.
     */
    _mutatedParts: Record<string, unknown> | undefined;

    /** Set while `waitFor` is holding the transaction open. */
    _waitingFor: NexiePromise<unknown> | undefined;
    private _waitingQueue: (() => void)[] | undefined;

    constructor(
        db: Nexie,
        mode: IDBTransactionMode,
        storeNames: string[],
        parent?: Transaction,
    ) {
        this.db = db;
        this.mode = mode;
        this.storeNames = storeNames;
        this.parent = parent;

        const { promise, resolve, reject } = NexiePromise.withResolvers<void>();
        this._completion = promise;
        this._resolveCompletion = resolve;
        this._rejectCompletion = reject;

        // Nothing may observe this as an unhandled rejection: the scope's own
        // promise is what surfaces the failure to the caller.
        void this._completion.catch(() => {});

        // `trans.friends` resolves to a transaction-bound table. Defined per
        // instance rather than on the prototype, so two databases with a
        // same-named table cannot shadow each other.
        for (const storeName of storeNames) {
            if (storeName in this) continue;
            Object.defineProperty(this, storeName, {
                get: () => this.table(storeName),
                configurable: true,
            });
        }
    }

    /** Open the underlying IDB transaction, or adopt the parent's. */
    create(idbtrans?: IDBTransaction): this {
        if (this.parent) {
            // A sub-transaction rides on its parent's IDB transaction, so the
            // two commit atomically.
            this.idbtrans = this.parent.idbtrans;
            this.active = true;
            return this;
        }

        const idb =
            idbtrans ??
            this.db.idbdb!.transaction(this.storeNames, this.mode);

        this.idbtrans = idb;
        this.active = true;

        idb.oncomplete = () => {
            this.active = false;
            this._settleCompletion(null);
        };
        idb.onabort = () => {
            this.active = false;
            this._settleCompletion(
                idb.error ?? new AbortError('Transaction aborted'),
            );
        };
        idb.onerror = (event) => {
            // The failing request already rejected its own promise. Swallow the
            // event here so `onabort` is the single place that decides why the
            // transaction ended.
            event.preventDefault();
        };

        return this;
    }

    private _settleCompletion(error: unknown): void {
        if (this._completionSettled) return;
        this._completionSettled = true;
        if (error === null) {
            this._resolveCompletion();
        } else {
            this._completionError = error;
            this._rejectCompletion(error);
        }
    }

    /** Used by a sub-transaction's scope to report success to its parent. */
    _resolve(): void {
        if (this.parent) this._settleCompletion(null);
    }

    _reject(error: unknown): void {
        this._settleCompletion(error);
        if (!this.parent && this.active) {
            try {
                this.idbtrans.abort();
            } catch {
                // Already finished; the completion is settled either way.
            }
        }
    }

    _root(): Transaction {
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        let transaction: Transaction = this;
        while (transaction.parent) transaction = transaction.parent;
        return transaction;
    }

    // ---------------------------------------------------------------- locking

    _lock(): this {
        if (this._reculock === 0) this._lockOwner = getZone();
        ++this._reculock;
        return this;
    }

    _unlock(): this {
        if (--this._reculock === 0) {
            this._lockOwner = null;
            while (this._blockedFuncs.length > 0 && !this._locked()) {
                const [fn, zone] = this._blockedFuncs.shift()!;
                runInZone(zone, fn);
            }
        }
        return this;
    }

    _locked(): boolean {
        if (this._reculock === 0) return false;
        // The lock holder itself, and anything nested inside it, may proceed.
        for (
            let zone: Zone | null = getZone();
            zone;
            zone = zone.parent as Zone | null
        ) {
            if (zone === this._lockOwner) return false;
        }
        return true;
    }

    // ------------------------------------------------------------- operations

    /**
     * Run `fn` against this transaction, queueing behind the write lock if one
     * is held by another logical caller.
     */
    _promise<R>(
        mode: IDBTransactionMode,
        fn: () => R | PromiseLike<R>,
        bWriteLock?: boolean,
    ): NexiePromise<R> {
        if (mode === 'readwrite' && this.mode !== 'readwrite') {
            return NexiePromise.reject(
                new ReadOnlyError(
                    `Transaction is readonly (tables: ${this.storeNames.join(', ')})`,
                ),
            );
        }

        if (!this.active) {
            return NexiePromise.reject(new TransactionInactiveError());
        }

        if (this._locked()) {
            return new NexiePromise<R>((resolve, reject) => {
                this._blockedFuncs.push([
                    () => {
                        this._promise(mode, fn, bWriteLock).then(resolve, reject);
                    },
                    getZone(),
                ]);
            });
        }

        if (bWriteLock) this._lock();

        let result: NexiePromise<R>;
        try {
            result = NexiePromise.resolve(fn());
        } catch (error) {
            if (bWriteLock) this._unlock();
            return NexiePromise.reject(error);
        }

        return bWriteLock ? result.finally(() => this._unlock()) : result;
    }

    /**
     * Keep the transaction alive across a foreign await.
     *
     * IndexedDB commits a transaction as soon as the event loop returns with no
     * pending request, so waiting on anything that yields to a task would
     * normally kill it. The fix is to keep issuing a request that never matches
     * anything -- `get(-Infinity)` -- and re-arm it from its own success
     * handler, so there is always one in flight.
     *
     * Two details are load-bearing: the spin stops the instant the awaited
     * promise settles (otherwise the transaction could never commit), and the
     * result is delivered from the spin callback, so the continuation runs
     * inside a live IDB event turn rather than a bare microtask.
     */
    waitFor<T>(promise: PromiseLike<T> | T): NexiePromise<T> {
        const root = this._root();
        const awaited = NexiePromise.resolve(promise);

        if (root._waitingFor) {
            // Already spinning: chain onto the existing wait.
            root._waitingFor = root._waitingFor.then(() => awaited);
        } else {
            root._waitingFor = awaited as NexiePromise<unknown>;
            root._waitingQueue = [];

            const store = root.idbtrans.objectStore(root.storeNames[0]!);
            const spin = (): void => {
                while (root._waitingQueue!.length > 0) {
                    root._waitingQueue!.shift()!();
                }
                if (root._waitingFor) {
                    store.get(-Infinity).onsuccess = spin;
                }
            };
            spin();
        }

        const waitPromise = root._waitingFor;

        return new NexiePromise<T>((resolve, reject) => {
            awaited
                .then(
                    (value) => root._waitingQueue!.push(() => resolve(value)),
                    (error) => root._waitingQueue!.push(() => reject(error)),
                )
                .finally(() => {
                    if (root._waitingFor === waitPromise) {
                        root._waitingFor = undefined;
                    }
                });
        });
    }

    // ----------------------------------------------------------------- public

    abort(): void {
        if (this.active) {
            this.active = false;
            try {
                this.idbtrans.abort();
            } catch {
                // Already finished.
            }
            this._settleCompletion(new AbortError('Transaction aborted'));
        }
    }

    /** Transaction-bound tables, memoized so `trans.friends` is stable. */
    table<T = any, TKey = any>(tableName: string): Table<T, TKey> {
        const memoized = this._memoizedTables.get(tableName);
        if (memoized) return memoized as Table<T, TKey>;

        if (!this.storeNames.includes(tableName)) {
            throw new NotFoundError(
                `Table ${tableName} not part of transaction`,
            );
        }

        const table = this.db._createTable(tableName, this);
        this._memoizedTables.set(tableName, table);
        return table as Table<T, TKey>;
    }
}
