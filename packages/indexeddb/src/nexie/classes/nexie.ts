import { exceptions, errnames, fullNameExceptions } from '../errors/errors.ts';
import { NexiePromise } from '../zone/nexie-promise.ts';
import { getZone, newZone } from '../zone/zone.ts';
import { Table } from './table.ts';
import { Transaction, parseMode } from './transaction.ts';
import { Version } from './version.ts';
import { Collection } from './collection.ts';
import { WhereClause } from './where-clause.ts';
import { enterTransactionScope } from './transaction-scope.ts';
import { Events, once as onceHelper, type NexieEventSet } from '../functions/events.ts';
import {
    promisableChain,
    reverseStoppableChain,
} from '../functions/chaining.ts';
import { makeClassConstructor } from '../functions/make-class-constructor.ts';
import { createIdbCore } from '../dbcore/dbcore-idb.ts';
import { buildMiddlewareStack } from '../dbcore/middleware-stack.ts';
import { createHooksMiddleware } from '../hooks/hooks-middleware.ts';
import { createObservabilityMiddleware } from '../live-query/observability-middleware.ts';
import type { DBCore, Middleware } from '../types/dbcore.ts';
import type { DbSchema, IndexSpec, TableSchema } from '../types/schema.ts';
import type { TransactionMode } from '../types/transaction.ts';

const SchemaError = exceptions['Schema']!;
const InvalidTableError = exceptions['InvalidTable']!;
const DatabaseClosedError = exceptions['DatabaseClosed']!;
const MissingAPIError = exceptions['MissingAPI']!;
const OpenFailedError = exceptions['OpenFailed']!;
const ReadOnlyError = exceptions['ReadOnly']!;
const SubTransactionError = exceptions['SubTransaction']!;
const InvalidArgumentError = exceptions['InvalidArgument']!;

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
}

interface OpenState {
    isBeingOpened: boolean;
    openComplete: boolean;
    dbOpenError: unknown;
    openPromise: NexiePromise<Nexie> | null;
}

/** Table properties are installed on the instance, so `db.friends` works. */
type TableProps = Record<string, Table>;

/** A table may be named or passed by reference. */
export type TableLike = string | Table<any, any>;

export type TransactionScope<R> = (trans: Transaction) => R | PromiseLike<R>;

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

    table<T = any, TKey = any>(tableName: string): Table<T, TKey> {
        const table = this._allTables[tableName];
        if (!table) {
            throw new InvalidTableError(`Table ${tableName} does not exist`);
        }
        return table as Table<T, TKey>;
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

    open(): NexiePromise<Nexie> {
        if (this.idbdb) return NexiePromise.resolve(this);
        if (this._state.openPromise) return this._state.openPromise;

        const indexedDB = this._deps.indexedDB;
        if (!indexedDB) {
            return NexiePromise.reject(new MissingAPIError());
        }

        if (this._versions.length === 0) {
            return NexiePromise.reject(
                new SchemaError(
                    'No versions declared. Call db.version(1).stores({...}) first.',
                ),
            );
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
                this._state.isBeingOpened = false;
                this._state.openComplete = true;

                idbdb.onversionchange = (event) => {
                    this.on['versionchange']!.fire(event);
                };
                idbdb.onclose = (event) => {
                    this.idbdb = null;
                    this.on['close']!.fire(event);
                };

                // `ready` subscribers may return a promise, and open() does not
                // resolve until they have all settled.
                NexiePromise.resolve(upgrading ?? undefined)
                    .then(() => this.on['ready']!.fire(this))
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
                    return NexiePromise.follow(() => {
                        upgrader(trans);
                    });
                });
            }

            if (isNewDatabase) {
                chain = chain.then(() =>
                    NexiePromise.follow(() => {
                        this.on['populate']!.fire(trans);
                    }),
                );
            }

            return chain;
        }, { trans });
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
                this._updateIndexes(idbtrans.objectStore(name), tableSchema);
            } else {
                this._createStore(idbdb, tableSchema);
            }
        }

        void from;
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
        }
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
            request.onblocked = () => {
                // Another connection is open; the delete completes once it closes.
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

        if (ambient && ambient.db === this && !parsed.forceNew) {
            if (ambient.mode === 'readwrite' || parsed.idbMode === 'readonly') {
                const missing = storeNames.filter(
                    (name) => !ambient.storeNames.includes(name),
                );
                if (missing.length === 0) {
                    parent = ambient;
                } else if (!parsed.lenient) {
                    return NexiePromise.reject(
                        new SubTransactionError(
                            `Table(s) ${missing.join(', ')} not included in parent transaction.`,
                        ),
                    );
                }
            } else if (!parsed.lenient) {
                // A write inside a read transaction can never be satisfied.
                return NexiePromise.reject(
                    new ReadOnlyError(
                        'Cannot enter a readwrite transaction from within a readonly transaction.',
                    ),
                );
            }
        }

        if (!this.isOpen()) {
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

    /** The transaction the calling code is currently inside, if any. */
    static get currentTransaction(): Transaction | null {
        return (getZone().trans as Transaction | undefined) ?? null;
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
