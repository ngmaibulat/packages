import type {
  IDBPCursor,
  IDBPCursorWithValue,
  IDBPDatabase,
  IDBPIndex,
  IDBPObjectStore,
  IDBPTransaction,
} from './entry.ts';
import { type Constructor, type Func, instanceOfAny } from './util.ts';

let idbProxyableTypes: Constructor[];
let cursorAdvanceMethods: Func[];

// This is a function to prevent it throwing up in node environments.
function getIdbProxyableTypes(): Constructor[] {
  return (
    idbProxyableTypes ||
    (idbProxyableTypes = [
      IDBDatabase,
      IDBObjectStore,
      IDBIndex,
      IDBCursor,
      IDBTransaction,
    ])
  );
}

// This is a function to prevent it throwing up in node environments.
function getCursorAdvanceMethods(): Func[] {
  return (
    cursorAdvanceMethods ||
    (cursorAdvanceMethods = [
      IDBCursor.prototype.advance,
      IDBCursor.prototype.continue,
      IDBCursor.prototype.continuePrimaryKey,
    ])
  );
}

const transactionDoneMap: WeakMap<
  IDBTransaction,
  Promise<void>
> = new WeakMap();
const transformCache = new WeakMap();
export const reverseTransformCache = new WeakMap();

function promisifyRequest<T>(request: IDBRequest<T>): Promise<T> {
  const promise = new Promise<T>((resolve, reject) => {
    const unlisten = () => {
      request.removeEventListener('success', success);
      request.removeEventListener('error', error);
    };
    const success = () => {
      resolve(wrap(request.result as any) as any);
      unlisten();
    };
    const error = () => {
      reject(request.error);
      unlisten();
    };
    request.addEventListener('success', success);
    request.addEventListener('error', error);
  });

  // This mapping exists in reverseTransformCache but doesn't exist in transformCache. This
  // is because we create many promises from a single IDBRequest.
  reverseTransformCache.set(promise, request);
  return promise;
}

function cacheDonePromiseForTransaction(tx: IDBTransaction): void {
  // Early bail if we've already created a done promise for this transaction.
  if (transactionDoneMap.has(tx)) return;

  const done = new Promise<void>((resolve, reject) => {
    // A request's 'error' event bubbles to the transaction *before* the
    // transaction is aborted with it, so `tx.error` is still null while it
    // dispatches and the only reachable cause is `event.target.error`. And an
    // error that gets preventDefault()ed does not abort the transaction at all
    // -- it goes on to commit. So 'error' only records a candidate cause here;
    // 'abort' is what settles the promise.
    let candidateError: DOMException | null = null;

    const unlisten = () => {
      tx.removeEventListener('complete', complete);
      tx.removeEventListener('error', error);
      tx.removeEventListener('abort', abort);
    };
    const complete = () => {
      resolve();
      unlisten();
    };
    const error = (event: Event) => {
      // A handled error is not going to abort anything, so it must not be
      // remembered as the cause of some later, unrelated abort. Browsers
      // expose the cancelled flag here during bubbling; the in-memory
      // implementation does not, which is why `ignoreConstraints` also stops
      // propagation.
      if (event.defaultPrevented) return;
      candidateError =
        tx.error ??
        (event.target as IDBRequest | null)?.error ??
        candidateError;
    };
    const abort = () => {
      // `tx.error` first: an abort with no preceding request error -- a quota
      // failure at commit, say -- carries its cause there. An explicit
      // `tx.abort()` leaves it null, which is what the fallback is for.
      reject(
        tx.error ??
          candidateError ??
          new DOMException('A request was aborted.', 'AbortError'),
      );
      unlisten();
    };
    tx.addEventListener('complete', complete);
    tx.addEventListener('error', error);
    tx.addEventListener('abort', abort);
  });

  // Nothing is obliged to await tx.done -- for a read it is normal not to --
  // but the promise is created eagerly here, so a transaction that fails
  // before the caller reaches `await tx.done` would reject with no handler
  // attached and surface as an unhandled rejection. This keeps that quiet
  // without changing anything an awaiting caller sees.
  done.catch(() => {});

  // Cache it for later retrieval.
  transactionDoneMap.set(tx, done);
}

// `using db = await openDB(…)` closes the connection at the end of the scope.
// Read off Symbol rather than named directly, so that on an engine without
// explicit resource management this is `undefined` and the branches below are
// simply never taken -- a property key can never be undefined.
const disposeSymbol: symbol | undefined = (
  Symbol as unknown as { dispose?: symbol }
).dispose;

// Shared, so that `db[Symbol.dispose] === db[Symbol.dispose]`, matching the
// object equality the transform cache provides everywhere else.
function disposeDatabase(this: IDBPDatabase): void {
  unwrap(this).close();
}

function isDisposeProp(target: any, prop: number | string | symbol): boolean {
  return (
    disposeSymbol !== undefined &&
    prop === disposeSymbol &&
    target instanceof IDBDatabase
  );
}

let idbProxyTraps: ProxyHandler<any> = {
  get(target, prop, receiver) {
    if (target instanceof IDBTransaction) {
      // Special handling for transaction.done.
      if (prop === 'done') return transactionDoneMap.get(target);
      // Make tx.store return the only store in the transaction, or undefined if there are many.
      if (prop === 'store') {
        return receiver.objectStoreNames[1]
          ? undefined
          : receiver.objectStore(receiver.objectStoreNames[0]);
      }
    }
    if (isDisposeProp(target, prop)) return disposeDatabase;
    // Else transform whatever we get back.
    return wrap(target[prop]);
  },
  set(target, prop, value) {
    target[prop] = value;
    return true;
  },
  has(target, prop) {
    if (
      target instanceof IDBTransaction &&
      (prop === 'done' || prop === 'store')
    ) {
      return true;
    }
    return isDisposeProp(target, prop) || prop in target;
  },
};

export function replaceTraps(
  callback: (currentTraps: ProxyHandler<any>) => ProxyHandler<any>,
): void {
  idbProxyTraps = callback(idbProxyTraps);
}

function wrapFunction<T extends Func>(func: T): Function {
  // Due to expected object equality (which is enforced by the caching in `wrap`), we
  // only create one new func per func.

  // Cursor methods are special, as the behaviour is a little more different to standard IDB. In
  // IDB, you advance the cursor and wait for a new 'success' on the IDBRequest that gave you the
  // cursor. It's kinda like a promise that can resolve with many values. That doesn't make sense
  // with real promises, so each advance methods returns a new promise for the cursor object, or
  // undefined if the end of the cursor has been reached.
  if (getCursorAdvanceMethods().includes(func)) {
    return function (this: IDBPCursor, ...args: Parameters<T>) {
      // Calling the original function with the proxy as 'this' causes ILLEGAL INVOCATION, so we use
      // the original object.
      func.apply(unwrap(this), args);
      return wrap(this.request);
    };
  }

  return function (this: any, ...args: Parameters<T>) {
    // Calling the original function with the proxy as 'this' causes ILLEGAL INVOCATION, so we use
    // the original object.
    return wrap(func.apply(unwrap(this), args));
  };
}

function transformCachableValue(value: any): any {
  if (typeof value === 'function') return wrapFunction(value);

  // This doesn't return, it just creates a 'done' promise for the transaction,
  // which is later returned for transaction.done (see idbObjectHandler).
  if (value instanceof IDBTransaction) cacheDonePromiseForTransaction(value);

  if (instanceOfAny(value, getIdbProxyableTypes()))
    return new Proxy(value, idbProxyTraps);

  // Return the same value back if we're not going to transform it.
  return value;
}

/**
 * Enhance an IDB object with helpers.
 *
 * @param value The thing to enhance.
 */
export function wrap(value: IDBDatabase): IDBPDatabase;
export function wrap(value: IDBIndex): IDBPIndex;
export function wrap(value: IDBObjectStore): IDBPObjectStore;
export function wrap(value: IDBTransaction): IDBPTransaction;
export function wrap(
  value: IDBOpenDBRequest,
): Promise<IDBPDatabase | undefined>;
export function wrap<T>(value: IDBRequest<T>): Promise<T>;
export function wrap(value: any): any {
  // We sometimes generate multiple promises from a single IDBRequest (eg when cursoring), because
  // IDB is weird and a single IDBRequest can yield many responses, so these can't be cached.
  if (value instanceof IDBRequest) return promisifyRequest(value);

  // If we've already transformed this value before, reuse the transformed value.
  // This is faster, but it also provides object equality.
  if (transformCache.has(value)) return transformCache.get(value);
  const newValue = transformCachableValue(value);

  // Not all types are transformed.
  // These may be primitive types, so they can't be WeakMap keys.
  // Object.is rather than !==, because NaN !== NaN would otherwise send a
  // primitive to WeakMap.set, which throws. Storing NaN is legal in IDB.
  if (!Object.is(newValue, value)) {
    transformCache.set(value, newValue);
    reverseTransformCache.set(newValue, value);
  }

  return newValue;
}

/**
 * Revert an enhanced IDB object to a plain old miserable IDB one.
 *
 * Will also revert a promise back to an IDBRequest.
 *
 * @param value The enhanced object to revert.
 */
interface Unwrap {
  (value: IDBPCursorWithValue<any, any, any, any, any>): IDBCursorWithValue;
  (value: IDBPCursor<any, any, any, any, any>): IDBCursor;
  (value: IDBPDatabase<any>): IDBDatabase;
  (value: IDBPIndex<any, any, any, any, any>): IDBIndex;
  (value: IDBPObjectStore<any, any, any, any>): IDBObjectStore;
  (value: IDBPTransaction<any, any, any>): IDBTransaction;
  <T extends any>(value: Promise<IDBPDatabase<T>>): IDBOpenDBRequest;
  (value: Promise<IDBPDatabase>): IDBOpenDBRequest;
  <T>(value: Promise<T>): IDBRequest<T>;
}
export const unwrap: Unwrap = (value: any): any =>
  reverseTransformCache.get(value);

/**
 * Let a write fail on a duplicate key without aborting the whole transaction.
 *
 * By default a `ConstraintError` aborts the transaction it happened in, so one
 * duplicate throws away every other write in a bulk insert. Pass the operation
 * through this and the error is handled at the request, leaving the
 * transaction free to commit; the returned promise resolves with `undefined`
 * for the record that was skipped.
 *
 * ```js
 * const tx = db.transaction('books', 'readwrite');
 * const added = await Promise.all(
 *   books.map((book) => ignoreConstraints(tx.store.add(book))),
 * );
 * await tx.done;
 * // `added` holds a key per book, or undefined where one already existed.
 * ```
 *
 * @param operation The promise returned by a store or index write.
 */
export function ignoreConstraints<T>(
  operation: Promise<T>,
): Promise<T | undefined> {
  const request = unwrap(operation) as IDBRequest<T> | undefined;

  if (!request) {
    throw new TypeError(
      'ignoreConstraints() expects a promise returned by an IndexedDB operation.',
    );
  }

  // The listener has to be in place before the request's error event fires,
  // which means this must be called in the same turn as the operation. Called
  // later, the ConstraintError has already reached the transaction and aborted
  // it -- swallowing it from the promise at that point would report a clean
  // `undefined` for a write that took the whole transaction down.
  if (request.readyState === 'done' && request.error) {
    throw new TypeError(
      'ignoreConstraints() was called after the operation already failed. ' +
        'Call it in the same turn as the write, before awaiting anything.',
    );
  }

  const onError = (event: Event) => {
    if (request.error?.name !== 'ConstraintError') return;
    // preventDefault stops the transaction being aborted with this error.
    // stopPropagation keeps it from reaching the transaction at all, so it is
    // not mistaken for the cause of some later, unrelated abort.
    event.preventDefault();
    event.stopPropagation();
  };
  // Removed once the request settles either way: a request object outlives
  // the operation (a cursor's, for instance), and a listener left behind would
  // keep suppressing constraint errors on whatever it did next.
  const cleanup = () => {
    request.removeEventListener('error', onError);
    request.removeEventListener('success', cleanup);
    request.removeEventListener('error', cleanup);
  };
  request.addEventListener('error', onError);
  request.addEventListener('success', cleanup);
  request.addEventListener('error', cleanup);

  return operation.catch((error: unknown) => {
    if (error instanceof DOMException && error.name === 'ConstraintError') {
      return undefined;
    }
    throw error;
  });
}
