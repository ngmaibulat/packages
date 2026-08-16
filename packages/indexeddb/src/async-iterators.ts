import { instanceOfAny, type Func } from './util.ts';
import {
  replaceTraps,
  reverseTransformCache,
  unwrap,
} from './wrap-idb-value.ts';
import type { IDBPObjectStore, IDBPIndex, IDBPCursor } from './entry.ts';

const advanceMethodProps = ['continue', 'continuePrimaryKey', 'advance'];
const methodMap: { [s: string]: Func } = {};
const advanceResults = new WeakMap<IDBPCursor, Promise<IDBPCursor | null>>();
const ittrProxiedCursorToOriginalProxy = new WeakMap<IDBPCursor, IDBPCursor>();

const cursorIteratorTraps: ProxyHandler<any> = {
  get(target, prop) {
    if (!advanceMethodProps.includes(prop as string)) return target[prop];

    let cachedFunc = methodMap[prop as string];

    if (!cachedFunc) {
      cachedFunc = methodMap[prop as string] = function (
        this: IDBPCursor,
        ...args: any
      ) {
        advanceResults.set(
          this,
          (ittrProxiedCursorToOriginalProxy.get(this) as any)[prop](...args),
        );
      };
    }

    return cachedFunc;
  },
};

// `iterate` and `iterateKeys` differ only in which cursor they open, so the
// generator is built once per method rather than written out twice.
function makeIterator(openMethod: 'openCursor' | 'openKeyCursor') {
  return async function* (
    this: IDBPObjectStore | IDBPIndex | IDBPCursor,
    ...args: any[]
  ): AsyncIterableIterator<any> {
    // tslint:disable-next-line:no-this-assignment
    let cursor: typeof this | null = this;

    if (!(cursor instanceof IDBCursor)) {
      cursor = await (cursor as any)[openMethod](...args);
    }

    if (!cursor) return;

    cursor = cursor as IDBPCursor;
    const proxiedCursor = new Proxy(cursor, cursorIteratorTraps);
    ittrProxiedCursorToOriginalProxy.set(proxiedCursor, cursor);
    // Map this double-proxy back to the original, so other cursor methods work.
    reverseTransformCache.set(proxiedCursor, unwrap(cursor));

    while (cursor) {
      yield proxiedCursor;
      // If one of the advancing methods was not called, call continue().
      cursor = await (advanceResults.get(proxiedCursor) || cursor.continue());
      advanceResults.delete(proxiedCursor);
    }
  };
}

const iterate = makeIterator('openCursor');
const iterateKeys = makeIterator('openKeyCursor');

function isIteratorProp(target: any, prop: number | string | symbol) {
  return (
    (prop === Symbol.asyncIterator &&
      instanceOfAny(target, [IDBIndex, IDBObjectStore, IDBCursor])) ||
    ((prop === 'iterate' || prop === 'iterateKeys') &&
      instanceOfAny(target, [IDBIndex, IDBObjectStore]))
  );
}

replaceTraps((oldTraps) => ({
  ...oldTraps,
  get(target, prop, receiver) {
    if (isIteratorProp(target, prop)) {
      return prop === 'iterateKeys' ? iterateKeys : iterate;
    }
    return oldTraps.get!(target, prop, receiver);
  },
  has(target, prop) {
    return isIteratorProp(target, prop) || oldTraps.has!(target, prop);
  },
}));
