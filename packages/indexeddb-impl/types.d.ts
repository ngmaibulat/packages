declare const fakeIndexedDB: typeof indexedDB;
declare const FDBCursor: typeof IDBCursor;
declare const FDBCursorWithValue: typeof IDBCursorWithValue;
declare const FDBDatabase: typeof IDBDatabase;
declare const FDBFactory: typeof IDBFactory;
declare const FDBIndex: typeof IDBIndex;
declare const FDBKeyRange: typeof IDBKeyRange;
declare const FDBObjectStore: typeof IDBObjectStore;
declare const FDBOpenDBRequest: typeof IDBOpenDBRequest;
declare const FDBRecord: any; // should be updated once TypeScript DOM types are updated
declare const FDBRequest: typeof IDBRequest;
declare const FDBTransaction: typeof IDBTransaction;
declare const FDBVersionChangeEvent: typeof IDBVersionChangeEvent;
declare const forceCloseDatabase: (db: IDBDatabase) => void;
/**
 * Install the implementation onto a global object (`globalThis` by default),
 * as the `./auto` entry does on import. Callable again after the globals have
 * been tampered with, which a side-effect import cannot be.
 */
declare const installGlobals: (target?: object) => void;

export default fakeIndexedDB;

export {
    fakeIndexedDB as indexedDB,
    FDBCursor as IDBCursor,
    FDBCursorWithValue as IDBCursorWithValue,
    FDBDatabase as IDBDatabase,
    FDBFactory as IDBFactory,
    FDBIndex as IDBIndex,
    FDBKeyRange as IDBKeyRange,
    FDBObjectStore as IDBObjectStore,
    FDBOpenDBRequest as IDBOpenDBRequest,
    FDBRecord as IDBRecord,
    FDBRequest as IDBRequest,
    FDBTransaction as IDBTransaction,
    FDBVersionChangeEvent as IDBVersionChangeEvent,
    forceCloseDatabase,
    installGlobals,
};
