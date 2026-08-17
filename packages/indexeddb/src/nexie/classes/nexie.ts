import { exceptions, errnames, fullNameExceptions } from '../errors/errors.ts';
import { NexiePromise } from '../zone/nexie-promise.ts';
import { getZone, isVip, newZone } from '../zone/zone.ts';
import { Table } from './table.ts';
import { Transaction, parseMode } from './transaction.ts';
import { Version } from './version.ts';
import { Collection } from './collection.ts';
import { WhereClause } from './where-clause.ts';
import { enterTransactionScope } from './transaction-scope.ts';
import {
    Events,
    once as onceHelper,
    type NexieEvent,
    type NexieEventSet,
} from '../functions/events.ts';
import {
    promisableChain,
    reverseStoppableChain,
} from '../functions/chaining.ts';
import { makeClassConstructor } from '../functions/make-class-constructor.ts';
import { createIdbCore } from '../dbcore/dbcore-idb.ts';
import { buildMiddlewareStack } from '../dbcore/middleware-stack.ts';
import { createHooksMiddleware } from '../hooks/hooks-middleware.ts';
import { schemaFromIdb } from './schema-from-idb.ts';
import { NEXIE_VERSION } from '../globals/constants.ts';
import {
    registerConnection,
    unregisterConnection,
} from '../globals/connections.ts';
import { observeBfcache } from '../globals/bfcache.ts';
import { createObservabilityMiddleware } from '../live-query/observability-middleware.ts';
import type { DBCore, Middleware } from '../types/dbcore.ts';
import type { DbSchema, IndexSpec, TableSchema } from '../types/schema.ts';
import type { TransactionMode } from '../types/transaction.ts';

const SchemaError = exceptions['Schema']!;
const InvalidTableError = exceptions['InvalidTable']!;
const DatabaseClosedError = exceptions['DatabaseClosed']!;
const MissingAPIError = exceptions['MissingAPI']!;
const OpenFailedError = exceptions['OpenFailed']!;
const SubTransactionError = exceptions['SubTransaction']!;
const InvalidArgumentError = exceptions['InvalidArgument']!;
const NoSuchDatabaseError = exceptions['NoSuchDatabase']!;
const UnsupportedError = exceptions['Unsupported']!;
const UpgradeError = exceptions['Upgrade']!;

export interface NexieDependencies {
    indexedDB: IDBFactory | null;
    IDBKeyRange: typeof IDBKeyRange | null;
}

export type Addon = (db: Nexie) => void;

export interface NexieOptions {
    autoOpen?: boolean;
    indexedDB?: IDBFactory;
    IDBKeyRange?: typeof IDBKeyRange;
    addons?: Addon[];
    /**
     * Let a dynamic open succeed against a database that does not exist yet,
     * creating an empty one. Off by default: opening a database you never
     * declared a schema for and finding nothing in it is far more often a typo
     * in the name than an intention.
     */
    allowEmptyDB?: boolean;
    /**
     * `'relaxed'` lets the browser acknowledge a commit before it has reached
     * disk — much faster, and safe for data you can reconstruct. Chromium reads
     * it; other engines ignore it, which is why the name says so.
     */
    chromeTransactionDurability?: 'default' | 'strict' | 'relaxed';
    /**
     * How many records `Collection.modify` writes back per request. Bounds the
     * size of a single mutation rather than the memory the walk collects.
     */
    modifyChunkSize?: number;
    /**
     * How many open connections to this database before a leak is assumed and
     * a warning printed. Never an error -- see globals/connections.ts.
     */
    maxConnections?: number;
}

interface OpenState {
    isBeingOpened: boolean;
    openComplete: boolean;
    dbOpenError: unknown;
    /**
     * Non-null while `ready` subscribers are being fired. A subscriber added
     * during that window is appended here and fired after the current batch,
     * so it is neither dropped nor fired twice.
     */
    onReadyBeingFired: Array<(db: Nexie) => unknown> | null;
    openPromise: NexiePromise<Nexie> | null;
}

/** Table properties are installed on the instance, so `db.friends` works. */
type TableProps = Record<string, Table>;

/** A table may be named or passed by reference. */
export type TableLike = string | Table<any, any>;

export type TransactionScope<R> = (trans: Transaction) => R | PromiseLike<R>;

function joinKeyPath(keyPath: string | string[] | null): string | null {
    if (keyPath === null) return null;
    return Array.isArray(keyPath) ? keyPath.join('+') : keyPath;
}

function describeKey(keyPath: string | null, auto: boolean): string {
    return `${auto ? '++' : ''}${keyPath ?? '(outbound)'}`;
}

export class Nexie {
    readonly name: string;
    readonly _options: Required<Pick<NexieOptions, 'autoOpen'>> & NexieOptions;

    _versions: Version[] = [];
    _dbSchema: DbSchema = {};
    _storeNames: string[] = [];
    _allTables: TableProps = {};

    idbdb: IDBDatabase | null = null;

    _state: OpenState = {
        isBeingOpened: false,
        openComplete: false,
        dbOpenError: null,
        onReadyBeingFired: null,
        openPromise: null,
    };

    /** Internal: the IndexedDB factory and key-range constructor in use. */
    readonly _deps: NexieDependencies;
    /** Names currently installed as instance properties, so they can be removed. */
    private _installedTableNames: string[] = [];

    /**
     * Per-instance class constructors.
     *
     * An addon patching `db.Table.prototype` affects this database only, which
     * is what makes two differently-extended databases able to coexist.
     */
    readonly Table: typeof Table;
    readonly Transaction: typeof Transaction;
    readonly Collection: typeof Collection;
    readonly WhereClause: typeof WhereClause;
    readonly Version: typeof Version;

    /** Database lifecycle events. */
    readonly on: NexieEventSet;

    _middlewares: Middleware<DBCore>[] = [];
    private _coreCache: DBCore | null = null;

    /**
     * Explicit `db.transaction(...)` scopes that have not finished.
     *
     * Only used to diagnose a lost zone: see `_lostScopeFor`.
     */
    _openScopes = new Set<Transaction>();

    /** Set when the schema was read from the database instead of declared. */
    private _dynamicallyOpened = false;

    /** Removes the page-lifecycle listeners; null outside a browser. */
    private _unobserveBfcache: (() => void) | null = null;

    /** Whether the bfcache handler closed this database and owes it a reopen. */
    private _reopenAfterBfcache = false;

    constructor(name: string, options?: NexieOptions) {
        this.name = name;
        this._options = { autoOpen: true, ...options };
        this._deps = {
            indexedDB:
                options?.indexedDB ??
                Nexie.dependencies.indexedDB,
            IDBKeyRange:
                options?.IDBKeyRange ??
                Nexie.dependencies.IDBKeyRange,
        };

        this.Table = makeClassConstructor(Table);
        this.Transaction = makeClassConstructor(Transaction);
        this.Collection = makeClassConstructor(Collection);
        this.WhereClause = makeClassConstructor(WhereClause);
        this.Version = makeClassConstructor(Version);

        this.on = Events(this);
        // `populate` and `ready` are promisable: a subscriber may return a
        // promise and the database waits for it before proceeding.
        this.on.addEventType('populate', { chain: promisableChain });
        this.on.addEventType('ready', { chain: promisableChain });
        this._installReadySemantics();
        this.on.addEventType('blocked', { chain: reverseStoppableChain });
        this.on.addEventType('close', { chain: reverseStoppableChain });
        // A later subscriber returning false suppresses the default, which is
        // to get out of the upgrading connection's way by closing.
        this.on.addEventType('versionchange', {
            chain: reverseStoppableChain,
            defaultFunction: () => {
                this.close();
            },
        });

        // Hooks and observability are themselves middlewares, so the extension
        // mechanism is the one the library's own features are built on.
        this._middlewares.push(createHooksMiddleware());
        this._middlewares.push(createObservabilityMiddleware());

        for (const addon of options?.addons ?? Nexie.addons) addon(this);
    }

    /**
     * A page frozen into the bfcache may have its connections closed by the
     * browser and then be brought back with them apparently intact. Close
     * deliberately and reopen on the way out, so the state is one we chose.
     *
     * Wired while a connection is open (or owed a reopen) and unwired on
     * close, rather than for the object's lifetime: `Nexie.delete(name)` is
     * `new Nexie(name).delete()`, and a listener pair per throwaway instance
     * is a leak on the page.
     */
    private _observeBfcache(): void {
        if (this._unobserveBfcache) return;
        this._unobserveBfcache = observeBfcache({
            onHide: () => {
                if (!this.idbdb) return;
                this._reopenAfterBfcache = true;
                this.close();
            },
            onShow: () => {
                if (!this._reopenAfterBfcache) return;
                this._reopenAfterBfcache = false;
                // Nothing is awaiting this: a restored page reopens in the
                // background, and any operation racing it joins the same open.
                void this.open().catch(() => {
                    // A reopen that fails leaves the database closed, which is
                    // exactly what it was a moment ago.
                });
            },
        });
    }

    private _unobserveBfcacheIfIdle(): void {
        // Still owed a reopen: the pageshow listener is the only way back.
        if (this._reopenAfterBfcache) return;
        this._unobserveBfcache?.();
        this._unobserveBfcache = null;
    }

    /**
     * `db.on('ready', fn, bSticky?)` -- Dexie's semantics, which differ from
     * a plain event in two ways that migrated code relies on:
     *
     * - Subscribing to an already-open database fires the subscriber right
     *   away (asynchronously), rather than never. `autoOpen` means the first
     *   query often opens the database before anyone thought to subscribe.
     * - A subscriber fires ONCE -- on the next successful open -- unless
     *   `bSticky` is true, in which case it fires on every open, including
     *   reopens after `close()`.
     *
     * A subscriber added while `ready` is being fired joins the current batch
     * rather than being dropped or fired twice.
     */
    private _installReadySemantics(): void {
        const readyEvent = this.on['ready'] as NexieEvent;
        const subscribeRaw = readyEvent.subscribe.bind(readyEvent);

        readyEvent.subscribe = (
            subscriber: (db: Nexie) => unknown,
            bSticky?: boolean,
        ): void => {
            const state = this._state;
            if (state.onReadyBeingFired) {
                state.onReadyBeingFired.push(subscriber);
                if (bSticky) subscribeRaw(subscriber);
            } else if (this.isOpen()) {
                // Already open: fire as soon as possible, and VIP so that a
                // subscriber reaching for the database is not gated on an open
                // it can see has finished.
                void NexiePromise.resolve().then(() =>
                    Nexie.vip(() => subscriber(this)),
                );
                if (bSticky) subscribeRaw(subscriber);
            } else {
                subscribeRaw(subscriber);
                if (!bSticky) {
                    // Fire once: unsubscribe both the subscriber and this
                    // helper the first time the event fires. The helper is
                    // subscribed AFTER the subscriber, so the promisable chain
                    // runs it after -- and only after -- the subscriber.
                    const unsubscribeOnce = (): void => {
                        readyEvent.unsubscribe(subscriber);
                        readyEvent.unsubscribe(unsubscribeOnce);
                    };
                    subscribeRaw(unsubscribeOnce);
                }
            }
        };
    }

    /**
     * Fire `ready`, then whatever subscribed while it was firing, sequentially
     * and VIP. `open()` does not resolve until this settles.
     */
    private _fireReady(): NexiePromise<void> {
        const state = this._state;
        const late: Array<(db: Nexie) => unknown> = [];
        state.onReadyBeingFired = late;

        const drainLate = (): NexiePromise<void> => {
            const next = late.shift();
            if (!next) return NexiePromise.resolve();
            return NexiePromise.resolve(Nexie.vip(() => next(this))).then(
                drainLate,
            );
        };

        return NexiePromise.resolve(
            Nexie.vip(() => this.on['ready']!.fire(this)),
        )
            .then(drainLate)
            .finally(() => {
                state.onReadyBeingFired = null;
            });
    }

    /** Subscribe to an event, then unsubscribe as soon as it has fired once. */
    once(eventName: string, subscriber: (...args: any[]) => any): this {
        onceHelper(this.on, eventName, subscriber);
        return this;
    }

    // --------------------------------------------------------- middleware

    /** The DBCore stack, rebuilt whenever the schema or middlewares change. */
    get core(): DBCore {
        if (!this._coreCache) {
            this._coreCache = buildMiddlewareStack(
                createIdbCore(this.name, this._dbSchema),
                this._middlewares,
            );
        }
        return this._coreCache;
    }

    use(middleware: Middleware<DBCore>): this {
        this._middlewares.push(middleware);
        this._coreCache = null;
        return this;
    }

    unuse(spec: { stack: 'dbcore'; name?: string; create?: Function }): this {
        this._middlewares = this._middlewares.filter(
            (middleware) =>
                !(
                    middleware.stack === spec.stack &&
                    ((spec.name !== undefined && middleware.name === spec.name) ||
                        (spec.create !== undefined &&
                            middleware.create === spec.create))
                ),
        );
        this._coreCache = null;
        return this;
    }

    // ------------------------------------------------------------- schema

    /**
     * Register a schema version.
     *
     * Versions are rounded to one decimal because IndexedDB versions are
     * integers: the native version is `verno * 10`, which is what lets `1.1`
     * exist at all.
     */
    version(versionNumber: number): Version {
        if (this.idbdb || this._state.isBeingOpened) {
            throw new SchemaError(
                'Cannot add version when database is open',
            );
        }

        const rounded = Math.round(versionNumber * 10) / 10;
        if (Number.isNaN(rounded) || rounded < 0.1) {
            throw new TypeError('Given version is not a positive number');
        }

        const existing = this._versions.find(
            (version) => version._cfg.version === rounded,
        );
        if (existing) return existing;

        const version = new Version(this, rounded);
        this._versions.push(version);
        this._versions.sort((a, b) => a._cfg.version - b._cfg.version);
        // Registering re-runs the merge, so a later version inherits the
        // schemas declared before it even if it never calls stores() itself.
        version.stores({});
        return version;
    }

    get verno(): number {
        return this.idbdb
            ? this.idbdb.version / 10
            : (this._versions[this._versions.length - 1]?._cfg.version ?? 0);
    }

    get tables(): Table[] {
        return Object.keys(this._allTables).map(
            (name) => this._allTables[name]!,
        );
    }

    /** Install/refresh `db.<tableName>` properties after a schema change. */
    _installTableApi(): void {
        for (const name of this._installedTableNames) {
            delete (this as unknown as TableProps)[name];
            delete this._allTables[name];
        }

        const names = Object.keys(this._dbSchema);
        for (const name of names) {
            const table = this._createTable(name);
            this._allTables[name] = table;
            // A subclass field of the same name wins, matching upstream.
            if (!(name in this)) {
                (this as unknown as TableProps)[name] = table;
            }
        }
        this._installedTableNames = names;
        // The base core closes over the schema, so it has to be rebuilt.
        this._coreCache = null;
    }

    _createTable(tableName: string, tx?: Transaction): Table {
        const schema = this._dbSchema[tableName];
        if (!schema) {
            throw new InvalidTableError(
                `Table ${tableName} does not exist`,
            );
        }
        return new this.Table(this, tableName, schema, tx);
    }

    table<T = any, TKey = any, TInsertType = T>(
        tableName: string,
    ): Table<T, TKey, TInsertType> {
        const table = this._allTables[tableName];
        if (!table) {
            throw new InvalidTableError(`Table ${tableName} does not exist`);
        }
        return table as Table<T, TKey, TInsertType>;
    }

    /**
     * An open scope covering `tableName` whose body is suspended on a foreign
     * promise, if there is one.
     *
     * This is the whole basis of `ForeignAwaitError`, and it is deliberately
     * narrow. A scope only qualifies once `follow` has told us every promise
     * this engine created inside it has settled while the body is still
     * running — which is precisely the state in which the zone has been lost.
     * An ordinary open scope, one awaiting our own operations, never matches,
     * so unrelated concurrent code is not flagged for merely running at the
     * same time as a transaction.
     */
    _lostScopeFor(tableName: string): Transaction | null {
        for (const scope of this._openScopes) {
            if (scope._zoneLost && scope.storeNames.includes(tableName)) {
                return scope;
            }
        }
        return null;
    }

    // --------------------------------------------------------------- open

    isOpen(): boolean {
        return this.idbdb !== null;
    }

    hasBeenClosed(): boolean {
        const error = this._state.dbOpenError;
        return (
            !!error && (error as { name?: string }).name === 'DatabaseClosedError'
        );
    }

    hasFailed(): boolean {
        return this._state.dbOpenError !== null;
    }

    backendDB(): IDBDatabase | null {
        return this.idbdb;
    }

    _closedError(): Error {
        return new DatabaseClosedError();
    }

    /**
     * True when the schema was read from the database rather than declared.
     *
     * See `_openDynamically`. Worth checking before an upgrade: a dynamically
     * opened database has no declared versions to upgrade from.
     */
    dynamicallyOpened(): boolean {
        return this._dynamicallyOpened;
    }

    open(): NexiePromise<Nexie> {
        if (this.idbdb) return NexiePromise.resolve(this);
        if (this._state.openPromise) return this._state.openPromise;

        const indexedDB = this._deps.indexedDB;
        if (!indexedDB) {
            return NexiePromise.reject(new MissingAPIError());
        }

        // No declared schema means "open whatever is there and tell me what it
        // is" rather than an error.
        if (this._versions.length === 0) {
            return this._openDynamically(indexedDB);
        }

        this._state.isBeingOpened = true;
        this._state.dbOpenError = null;

        const idbVersion = Math.round(this.verno * 10);

        const openPromise = new NexiePromise<Nexie>((resolve, reject) => {
            const request = indexedDB.open(this.name, idbVersion);

            // The upgrade runs asynchronously inside the version-change
            // transaction, so its outcome has to be carried to onsuccess --
            // which fires only once that transaction has committed.
            let upgrading: NexiePromise<void> | null = null;

            request.onupgradeneeded = (event) => {
                const idbtrans = request.transaction!;
                try {
                    upgrading = this._runUpgrade(
                        request.result,
                        idbtrans,
                        event.oldVersion / 10,
                    );
                    upgrading.catch((error) => {
                        // Abort so a half-applied schema is never committed.
                        try {
                            idbtrans.abort();
                        } catch {
                            // The abort itself failing changes nothing here.
                        }
                        reject(error);
                    });
                } catch (error) {
                    try {
                        idbtrans.abort();
                    } catch {
                        // As above.
                    }
                    reject(error);
                }
            };

            request.onblocked = (event) => {
                // Another connection is holding the old version open.
                this.on['blocked']!.fire(event);
            };

            request.onsuccess = () => {
                const idbdb = request.result;
                this.idbdb = idbdb;
                registerConnection(this.name, this._options.maxConnections);
                this._observeBfcache();
                this._state.isBeingOpened = false;
                this._state.openComplete = true;

                idbdb.onversionchange = (event) => {
                    this.on['versionchange']!.fire(event);
                };
                idbdb.onclose = (event) => {
                    this.idbdb = null;
                    unregisterConnection(this.name);
                    this._unobserveBfcacheIfIdle();
                    this.on['close']!.fire(event);
                };

                // `ready` subscribers may return a promise, and open() does not
                // resolve until they have all settled. They run VIP: the open
                // they are part of has not resolved yet, so an operation that
                // waited for it would wait forever.
                NexiePromise.resolve(upgrading ?? undefined)
                    .then(() => this._fireReady())
                    .then(() => resolve(this))
                    .catch(reject);
            };

            request.onerror = () => {
                this._state.isBeingOpened = false;
                this._state.openComplete = true;
                this._state.dbOpenError = request.error;
                reject(new OpenFailedError(request.error));
            };
        });

        this._state.openPromise = openPromise;

        return openPromise.catch((error) => {
            this._state.openPromise = null;
            this._state.dbOpenError = error;
            throw error;
        });
    }

    /**
     * Open a database whose schema was never declared, adopting the one it
     * already has.
     *
     * Opening without a version is what makes this possible: IndexedDB then
     * gives you the current version rather than creating or upgrading. It only
     * fires `upgradeneeded` when the database did not exist at all — and there
     * the default is to refuse, because a caller who declared no schema and
     * named a database that is not there has almost certainly mistyped it. The
     * upgrade transaction is aborted so the empty database is not left behind.
     */
    private _openDynamically(indexedDB: IDBFactory): NexiePromise<Nexie> {
        this._state.isBeingOpened = true;
        this._state.dbOpenError = null;

        const openPromise = new NexiePromise<Nexie>((resolve, reject) => {
            const request = indexedDB.open(this.name);
            let missing = false;

            request.onupgradeneeded = () => {
                if (this._options.allowEmptyDB) return;
                missing = true;
                try {
                    request.transaction!.abort();
                } catch {
                    // The abort failing changes nothing: onerror still rejects.
                }
            };

            request.onblocked = (event) => {
                this.on['blocked']!.fire(event);
            };

            request.onsuccess = () => {
                const idbdb = request.result;
                this.idbdb = idbdb;
                registerConnection(this.name, this._options.maxConnections);
                this._observeBfcache();
                this._dynamicallyOpened = true;
                this._state.isBeingOpened = false;
                this._state.openComplete = true;

                idbdb.onversionchange = (event) => {
                    this.on['versionchange']!.fire(event);
                };
                idbdb.onclose = (event) => {
                    this.idbdb = null;
                    unregisterConnection(this.name);
                    this._unobserveBfcacheIfIdle();
                    this.on['close']!.fire(event);
                };

                try {
                    this._dbSchema = schemaFromIdb(idbdb);
                    this._storeNames = Object.keys(this._dbSchema);
                    this._coreCache = null;
                    this._installTableApi();
                } catch (error) {
                    reject(error);
                    return;
                }

                NexiePromise.resolve()
                    .then(() => this._fireReady())
                    .then(() => resolve(this))
                    .catch(reject);
            };

            request.onerror = () => {
                this._state.isBeingOpened = false;
                this._state.openComplete = true;
                const error = missing
                    ? new NoSuchDatabaseError(
                          `Database ${this.name} does not exist. Declare a schema with ` +
                              'version().stores(), or pass { allowEmptyDB: true } to create it.',
                      )
                    : new OpenFailedError(request.error);
                this._state.dbOpenError = error;
                reject(error);
            };
        });

        this._state.openPromise = openPromise;

        return openPromise.catch((error) => {
            this._state.openPromise = null;
            this._state.dbOpenError = error;
            throw error;
        });
    }

    /** The accumulated schema as of `version`, or {} for a brand-new database. */
    private _schemaAtVersion(version: number): DbSchema {
        let schema: DbSchema = {};
        for (const registered of this._versions) {
            if (registered._cfg.version > version) break;
            schema = registered._cfg.dbschema;
        }
        return schema;
    }

    /**
     * Walk the registered versions above `oldVersion`, applying each one's
     * structural changes and then its data migration.
     *
     * Applied per version rather than jumping straight to the final schema: an
     * upgrader for v2 has to see the world as v2 left it, not as v4 will.
     */
    private _runUpgrade(
        idbdb: IDBDatabase,
        idbtrans: IDBTransaction,
        oldVersion: number,
    ): NexiePromise<void> {
        const trans = this._createTransaction('readwrite', this._storeNames);
        trans.create(idbtrans);

        let previous = this._schemaAtVersion(oldVersion);
        const isNewDatabase = oldVersion === 0;

        return newZone(() => {
            let chain = NexiePromise.resolve();

            for (const version of this._versions) {
                if (version._cfg.version <= oldVersion) continue;
                const target = version._cfg.dbschema;
                const upgrader = version._cfg.contentUpgrade;
                const from = previous;
                previous = target;

                chain = chain.then(() => {
                    this._applySchemaDiff(idbdb, idbtrans, from, target);
                    // A brand-new database has nothing to migrate; it gets
                    // `populate` instead, once all the stores exist.
                    if (isNewDatabase || !upgrader) return undefined;
                    // The zone props are passed down rather than left to the
                    // fresh zone `follow` creates: without them an upgrader
                    // calling `db.table(...)` rather than `trans.table(...)`
                    // finds no ambient transaction, opens its own, and waits
                    // for the open it is itself part of.
                    return NexiePromise.follow(() => {
                        upgrader(trans);
                    }, { trans, vip: true });
                });
            }

            if (isNewDatabase) {
                chain = chain.then(() =>
                    NexiePromise.follow(
                        () => {
                            this.on['populate']!.fire(trans);
                        },
                        { trans, vip: true },
                    ),
                );
            }

            return chain;
            // VIP: `idbdb` is not assigned until onsuccess, which fires after
            // this transaction commits. An upgrader or a populate subscriber
            // that calls db.transaction() would otherwise wait on the open it
            // is itself part of.
        }, { trans, vip: true });
    }

    /** Create, drop and re-index object stores to move `from` to `to`. */
    private _applySchemaDiff(
        idbdb: IDBDatabase,
        idbtrans: IDBTransaction,
        from: DbSchema,
        to: DbSchema,
    ): void {
        const existing = Array.from(idbdb.objectStoreNames);

        for (const name of existing) {
            if (!to[name]) idbdb.deleteObjectStore(name);
        }

        for (const name of Object.keys(to)) {
            const tableSchema = to[name]!;
            if (idbdb.objectStoreNames.contains(name)) {
                const store = idbtrans.objectStore(name);
                this._checkPrimaryKey(store, tableSchema);
                this._updateIndexes(store, tableSchema);
            } else {
                this._createStore(idbdb, tableSchema);
            }
        }
    }

    /**
     * IndexedDB cannot change a store's primary key in place, and pretending
     * otherwise is the worst outcome available: the store would keep its old
     * key while every key-path computation here used the new one. Compared
     * against the LIVE store rather than the previous declared version, so a
     * declaration that drifted from what is on disk is caught the same way.
     * Same message prefix as Dexie, which callers may match on.
     */
    private _checkPrimaryKey(store: IDBObjectStore, schema: TableSchema): void {
        const wanted = schema.primKey;
        const actualPath = joinKeyPath(store.keyPath);
        const wantedPath = joinKeyPath(wanted.keyPath);
        if (actualPath !== wantedPath || store.autoIncrement !== wanted.auto) {
            throw new UpgradeError(
                `Not yet support for changing primary key (table ${schema.name}: ` +
                    `${describeKey(actualPath, store.autoIncrement)} -> ` +
                    `${describeKey(wantedPath, wanted.auto)}). Drop the table ` +
                    'and recreate it in a new version instead.',
            );
        }
    }

    private _createStore(idbdb: IDBDatabase, schema: TableSchema): void {
        const { primKey } = schema;

        // An outbound key must not be given a keyPath at all -- passing
        // `keyPath: null` is not the same as omitting it in every engine.
        const store =
            primKey.keyPath === null
                ? idbdb.createObjectStore(
                      schema.name,
                      primKey.auto ? { autoIncrement: true } : {},
                  )
                : idbdb.createObjectStore(schema.name, {
                      keyPath: primKey.keyPath,
                      autoIncrement: primKey.auto,
                  });

        for (const index of schema.indexes) this._createIndex(store, index);
    }

    private _createIndex(store: IDBObjectStore, index: IndexSpec): void {
        store.createIndex(index.name, index.keyPath as string | string[], {
            unique: index.unique,
            multiEntry: index.multi,
        });
    }

    private _updateIndexes(
        store: IDBObjectStore,
        schema: TableSchema,
    ): void {
        const wanted = new Map(schema.indexes.map((i) => [i.name, i]));

        for (const name of Array.from(store.indexNames)) {
            const index = wanted.get(name);
            if (!index) {
                store.deleteIndex(name);
                continue;
            }
            // A changed definition cannot be altered in place.
            const current = store.index(name);
            const sameKeyPath =
                String(current.keyPath) === String(index.keyPath);
            if (
                !sameKeyPath ||
                current.unique !== index.unique ||
                current.multiEntry !== index.multi
            ) {
                store.deleteIndex(name);
            } else {
                wanted.delete(name);
            }
        }

        for (const index of wanted.values()) this._createIndex(store, index);
    }

    close(): void {
        if (this.idbdb) {
            this.idbdb.close();
            this.idbdb = null;
            unregisterConnection(this.name);
        }
        this._unobserveBfcacheIfIdle();
        this._state.openPromise = null;
        this._state.openComplete = false;
        this._state.dbOpenError = this._closedError();
    }

    delete(): NexiePromise<void> {
        const indexedDB = this._deps.indexedDB;
        if (!indexedDB) return NexiePromise.reject(new MissingAPIError());

        this.close();
        // A close() that has not yet released the connection would block the
        // delete, so reset the error state first -- reopening is legal after.
        this._state.dbOpenError = null;

        return new NexiePromise<void>((resolve, reject) => {
            const request = indexedDB.deleteDatabase(this.name);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
            request.onblocked = (event) => {
                // Another connection is open; the delete completes once it
                // closes. Say so -- a delete that waits with no signal is
                // indistinguishable from a hang.
                this.on['blocked']!.fire(event);
            };
        });
    }

    // -------------------------------------------------------- transactions

    _createTransaction(
        mode: IDBTransactionMode,
        storeNames: string[],
        parent?: Transaction,
    ): Transaction {
        for (const name of storeNames) {
            if (!this._dbSchema[name]) {
                throw new InvalidTableError(`Table ${name} does not exist`);
            }
        }
        return new this.Transaction(this, mode, storeNames, parent);
    }

    /**
     * `db.transaction('rw', db.friends, scope)`, plus the varargs and array
     * forms. The last argument is always the scope function.
     *
     * The overloads exist so the scope callback's parameter is inferred as a
     * Transaction; a single rest-parameter signature would leave it implicitly
     * `any` at every call site.
     */
    transaction<R>(
        mode: TransactionMode,
        tables: readonly TableLike[],
        scope: TransactionScope<R>,
    ): NexiePromise<R>;
    transaction<R>(
        mode: TransactionMode,
        table: TableLike,
        scope: TransactionScope<R>,
    ): NexiePromise<R>;
    transaction<R>(
        mode: TransactionMode,
        t1: TableLike,
        t2: TableLike,
        scope: TransactionScope<R>,
    ): NexiePromise<R>;
    transaction<R>(
        mode: TransactionMode,
        t1: TableLike,
        t2: TableLike,
        t3: TableLike,
        scope: TransactionScope<R>,
    ): NexiePromise<R>;
    transaction<R>(
        mode: TransactionMode,
        t1: TableLike,
        t2: TableLike,
        t3: TableLike,
        t4: TableLike,
        scope: TransactionScope<R>,
    ): NexiePromise<R>;
    transaction<R>(
        mode: TransactionMode,
        t1: TableLike,
        t2: TableLike,
        t3: TableLike,
        t4: TableLike,
        t5: TableLike,
        scope: TransactionScope<R>,
    ): NexiePromise<R>;
    transaction<R>(
        mode: TransactionMode,
        ...args: unknown[]
    ): NexiePromise<R> {
        const scopeFunc = args.pop() as (trans: Transaction) => R;
        if (typeof scopeFunc !== 'function') {
            return NexiePromise.reject(
                new InvalidArgumentError(
                    'The last argument to transaction() must be a function',
                ),
            );
        }

        let parsed;
        try {
            parsed = parseMode(mode);
        } catch (error) {
            return NexiePromise.reject(error);
        }

        // Accept an array of tables, or tables as varargs, as strings or Tables.
        const flattened = args.length === 1 && Array.isArray(args[0])
            ? (args[0] as unknown[])
            : args;
        const storeNames = flattened.map((table) =>
            typeof table === 'string' ? table : (table as Table).name,
        );

        const ambient = getZone().trans as Transaction | undefined;
        let parent: Transaction | undefined;

        // Dexie's rules, including its error names and messages -- code
        // matches on those. `!` never joins; `?` joins when it can and starts
        // fresh when it cannot, which includes a parent that is no longer
        // active. Without `?`, an incompatible parent is a SubTransactionError.
        if (ambient && ambient.db === this && !parsed.forceNew) {
            if (ambient.mode === 'readonly' && parsed.idbMode === 'readwrite') {
                if (!parsed.lenient) {
                    return NexiePromise.reject(
                        new SubTransactionError(
                            'Cannot enter a sub-transaction with READWRITE mode when parent transaction is READONLY',
                        ),
                    );
                }
            } else {
                const missing = storeNames.filter(
                    (name) => !ambient.storeNames.includes(name),
                );
                if (missing.length === 0) {
                    parent = ambient;
                } else if (!parsed.lenient) {
                    return NexiePromise.reject(
                        new SubTransactionError(
                            `Table ${missing.join(', ')} not included in parent transaction.`,
                        ),
                    );
                }
            }
            // A `?` scope on a parent that has already ended would only fail
            // with TransactionInactiveError; starting fresh is what `?` means.
            if (parent && parsed.lenient && !parent.active) parent = undefined;
        }

        // A VIP caller is inside the open it would otherwise wait for, and it
        // has a parent transaction to ride on -- that is the whole point of
        // being VIP. Anything else has to go through the gate.
        if (!this.isOpen() && !(isVip() && parent)) {
            if (!this._options.autoOpen) {
                return NexiePromise.reject(this._closedError());
            }
            return this.open().then(() =>
                enterTransactionScope<R>(
                    this,
                    parsed.idbMode,
                    storeNames,
                    parent,
                    scopeFunc,
                ),
            );
        }

        return enterTransactionScope<R>(
            this,
            parsed.idbMode,
            storeNames,
            parent,
            scopeFunc,
        );
    }

    // ------------------------------------------------------------- statics

    /**
     * Addons applied to every new database, unless the constructor is given its
     * own `addons` option. An addon receives the database before any schema is
     * declared, so it can patch the per-instance class constructors.
     */
    static addons: Addon[] = [];

    static dependencies: NexieDependencies = {
        indexedDB:
            typeof globalThis !== 'undefined' && 'indexedDB' in globalThis
                ? (globalThis as { indexedDB: IDBFactory }).indexedDB
                : null,
        IDBKeyRange:
            typeof globalThis !== 'undefined' && 'IDBKeyRange' in globalThis
                ? (globalThis as { IDBKeyRange: typeof IDBKeyRange }).IDBKeyRange
                : null,
    };

    static Promise = NexiePromise;
    static errnames = errnames;

    /** This library's version, as `x.y.z`. A test keeps it honest. */
    static semVer = NEXIE_VERSION;

    /**
     * Extra checking, off by default.
     *
     * It turns on the engine's own invariant: our thenable must never fulfil
     * with another thenable, because the echo FIFO is only correct while each
     * settlement enqueues exactly one reaction. A violation is silent
     * corruption of the zone rather than a crash, so there is nowhere better to
     * catch it than an assertion you can switch on.
     */
    static get debug(): boolean {
        return NexiePromise.debug;
    }

    static set debug(value: boolean) {
        NexiePromise.debug = value;
    }

    /** Delete a database by name, without declaring a schema for it. */
    static delete(dbName: string): NexiePromise<void> {
        return new Nexie(dbName).delete();
    }

    /**
     * Whether a database of this name exists.
     *
     * `databases()` answers directly where it is implemented. Everywhere else
     * the only way to ask is to open the database and watch for
     * `upgradeneeded`, which fires exactly when it had to be created — so the
     * fallback aborts that upgrade, leaving nothing behind.
     */
    static exists(dbName: string): NexiePromise<boolean> {
        const indexedDB = Nexie.dependencies.indexedDB;
        if (!indexedDB) return NexiePromise.reject(new MissingAPIError());

        if (typeof indexedDB.databases === 'function') {
            return Nexie.getDatabaseNames().then((names) =>
                names.includes(dbName),
            );
        }

        return new NexiePromise<boolean>((resolve, reject) => {
            const request = indexedDB.open(dbName);
            let existed = true;

            request.onupgradeneeded = () => {
                existed = false;
                try {
                    request.transaction!.abort();
                } catch {
                    // Nothing to add: onerror resolves the answer below.
                }
            };
            request.onsuccess = () => {
                request.result.close();
                resolve(existed);
            };
            request.onerror = () => {
                // The abort above lands here, and means "it did not exist".
                if (!existed) resolve(false);
                else reject(new OpenFailedError(request.error));
            };
        });
    }

    /** Every database on this origin, by name. */
    static getDatabaseNames(): NexiePromise<string[]> {
        const indexedDB = Nexie.dependencies.indexedDB;
        if (!indexedDB) return NexiePromise.reject(new MissingAPIError());

        if (typeof indexedDB.databases !== 'function') {
            return NexiePromise.reject(
                new UnsupportedError(
                    'indexedDB.databases() is not available in this environment, ' +
                        'so the databases on this origin cannot be enumerated.',
                ),
            );
        }

        return NexiePromise.resolve(indexedDB.databases()).then((databases) =>
            databases
                .map((database) => database.name)
                .filter((name): name is string => typeof name === 'string'),
        );
    }

    /**
     * A plain class whose constructor copies its argument's properties. The
     * static form of `Table.defineClass()`, which additionally maps the table.
     */
    static defineClass<T = any>(): new (content?: Partial<T>) => T {
        return function (this: any, content?: unknown) {
            if (content) Object.assign(this, content);
        } as unknown as new (content?: Partial<T>) => T;
    }

    /** The transaction the calling code is currently inside, if any. */
    static get currentTransaction(): Transaction | null {
        return (getZone().trans as Transaction | undefined) ?? null;
    }

    /**
     * Run `scopeFunc` outside the current transaction.
     *
     * Operations inside it open transactions of their own instead of joining
     * the ambient one — for logging or bookkeeping that must survive a rollback
     * of the work that triggered it. It also suppresses `ForeignAwaitError`,
     * since stepping outside the transaction is the declared intent.
     */
    static ignoreTransaction<R>(scopeFunc: () => R): R {
        const zone = getZone();
        if (!zone.trans) return scopeFunc();
        return newZone(scopeFunc, {
            trans: undefined,
            transless: zone.transless ?? zone,
        });
    }

    /**
     * Run `scopeFunc` with the open gate lifted.
     *
     * A database being opened is not yet open to anyone else, so an operation
     * inside `on('populate')` or `on('ready')` that reaches for the database
     * would wait on the very open it is part of, and deadlock. Those two
     * callbacks are already VIP; this exposes the same thing to code they call
     * into. The ambient transaction is preserved, so a populate subscriber
     * still writes into the upgrade transaction.
     */
    static vip<R>(scopeFunc: () => R): R {
        const zone = getZone();
        return newZone(scopeFunc, {
            vip: true,
            trans: zone.trans,
            transless: zone.transless,
        });
    }

    /**
     * Wait for a foreign promise without letting the surrounding transaction
     * commit. The sanctioned way to await anything Nexie did not produce.
     */
    static waitFor<T>(
        promise: PromiseLike<T> | T,
        timeoutMilliseconds?: number,
    ): NexiePromise<T> {
        const trans = Nexie.currentTransaction;
        const waited = trans
            ? trans.waitFor(promise)
            : NexiePromise.resolve(promise);
        return timeoutMilliseconds === undefined
            ? waited
            : waited.timeout(timeoutMilliseconds);
    }
}

// `Nexie.ConstraintError`, `Nexie.OpenFailedError`, ... so migrated code can
// instanceof-check without importing the classes separately.
Object.assign(Nexie, fullNameExceptions);
