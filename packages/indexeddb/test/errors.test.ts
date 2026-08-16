import '@aibulat/indexeddb-impl/auto';
import { describe as suite, it as test, afterEach } from 'node:test';
import { assert } from 'chai';
import { openDB, wrap, unwrap, type IDBPDatabase } from '../src/index.ts';

// mocha's teardown takes a description; node:test's afterEach does not.
const teardown = (_name: string, fn: () => unknown) => afterEach(fn);

interface KeyValDB {
  s: { key: string; value: unknown };
}

let dbCount = 0;

/** A fresh single-store database per test, so nothing leaks between them. */
function freshDB(): Promise<IDBPDatabase<KeyValDB>> {
  dbCount += 1;
  return openDB<KeyValDB>(`errors-test-${dbCount}`, 1, {
    upgrade(db) {
      db.createObjectStore('s');
    },
  });
}

/**
 * Collect unhandled rejections over the course of `fn`.
 *
 * Node decides a rejection is unhandled once the microtask queue drains, so
 * this waits a macrotask rather than awaiting a resolved promise.
 */
async function withUnhandledRejections(
  fn: () => Promise<void>,
): Promise<unknown[]> {
  const seen: unknown[] = [];
  const onUnhandled = (reason: unknown) => seen.push(reason);
  process.on('unhandledRejection', onUnhandled);
  try {
    await fn();
    await new Promise((resolve) => setTimeout(resolve, 0));
  } finally {
    process.off('unhandledRejection', onUnhandled);
  }
  return seen;
}

suite('wrap - non-object values', () => {
  let db: IDBPDatabase<KeyValDB>;

  teardown('Close DB', () => {
    if (db) db.close();
  });

  // Upstream https://github.com/jakearchibald/idb/issues/315.
  // wrap() cached its result whenever `newValue !== value`, which is true for
  // NaN, so a primitive reached WeakMap.set and threw. The throw happened
  // inside the request's success handler, aborting the transaction.
  test('wrap(NaN) does not throw', () => {
    assert.doesNotThrow(() => wrap(NaN as any));
    assert.isNaN(wrap(NaN as any));
  });

  test('NaN round-trips through a store', async () => {
    db = await freshDB();
    await db.put('s', NaN, 'nan');
    const value = await db.get('s', 'nan');
    assert.isNaN(value as number, 'NaN survives put/get');
  });

  test('other non-object values still round-trip', async () => {
    db = await freshDB();
    const values: [string, unknown][] = [
      ['zero', 0],
      ['negZero', -0],
      ['infinity', Infinity],
      ['string', 'hello'],
      ['bool', true],
    ];

    for (const [key, value] of values) {
      await db.put('s', value, key);
    }

    for (const [key, value] of values) {
      assert.strictEqual(await db.get('s', key), value, key);
    }
  });
});

suite('transaction.done - error attribution', () => {
  let db: IDBPDatabase<KeyValDB>;

  teardown('Close DB', () => {
    if (db) db.close();
  });

  // Upstream https://github.com/jakearchibald/idb/issues/166, /326 and /334.
  // The 'error' event bubbles to the transaction before it is aborted, so
  // tx.error is still null at that point and idb fell back to a fabricated,
  // stackless DOMException('AbortError'), discarding the real cause.
  test('rejects with the real error, not a bare AbortError', async () => {
    db = await freshDB();
    await db.add('s', 'first', 'dup');

    const tx = db.transaction('s', 'readwrite');
    tx.store.add('second', 'dup').catch(() => {});

    try {
      await tx.done;
      assert.fail('tx.done should have rejected');
    } catch (error) {
      assert.instanceOf(error, DOMException);
      assert.strictEqual(
        (error as DOMException).name,
        'ConstraintError',
        'the cause is preserved',
      );
    }
  });

  // An error that is preventDefault()ed does not abort the transaction, so
  // rejecting on 'error' reported failure for a transaction that committed.
  test('resolves when the error is preventDefault()ed and the tx commits', async () => {
    db = await freshDB();
    await db.add('s', 'first', 'dup');

    const tx = db.transaction('s', 'readwrite');
    const operation = tx.store.add('second', 'dup');
    unwrap(operation).addEventListener('error', (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    operation.catch(() => {});
    tx.store.put('written', 'other');

    await tx.done;

    assert.strictEqual(await db.get('s', 'dup'), 'first', 'not overwritten');
    assert.strictEqual(await db.get('s', 'other'), 'written', 'tx committed');
  });

  test('explicit abort() still rejects with AbortError', async () => {
    db = await freshDB();

    const tx = db.transaction('s', 'readwrite');
    tx.store.put('value', 'key').catch(() => {});
    tx.abort();

    try {
      await tx.done;
      assert.fail('tx.done should have rejected');
    } catch (error) {
      assert.instanceOf(error, DOMException);
      assert.strictEqual((error as DOMException).name, 'AbortError');
    }

    assert.isUndefined(await db.get('s', 'key'), 'nothing was written');
  });

  test('resolves for a transaction that simply succeeds', async () => {
    db = await freshDB();
    const tx = db.transaction('s', 'readwrite');
    tx.store.put('value', 'key');
    await tx.done;
    assert.strictEqual(await db.get('s', 'key'), 'value');
  });
});

suite('transaction.done - unhandled rejections', () => {
  let db: IDBPDatabase<KeyValDB>;

  teardown('Close DB', () => {
    if (db) db.close();
  });

  // Upstream https://github.com/jakearchibald/idb/issues/320. tx.done is
  // created eagerly when the transaction is wrapped, so a failure before the
  // caller reaches `await tx.done` -- or a caller that never awaits it, which
  // is normal for a read -- surfaced as an unhandled rejection.
  test('a failing transaction whose done is never awaited stays quiet', async () => {
    db = await freshDB();
    await db.add('s', 'first', 'dup');

    const unhandled = await withUnhandledRejections(async () => {
      const tx = db.transaction('s', 'readwrite');
      // The operation promise is caught; tx.done is deliberately never touched.
      await tx.store.add('second', 'dup').catch(() => {});
    });

    assert.deepStrictEqual(unhandled, [], 'no unhandled rejections');
  });

  test('tx.done still rejects for a caller that does await it', async () => {
    db = await freshDB();
    await db.add('s', 'first', 'dup');

    const tx = db.transaction('s', 'readwrite');
    tx.store.add('second', 'dup').catch(() => {});

    // Awaited late, after the rejection has already happened.
    await new Promise((resolve) => setTimeout(resolve, 0));

    try {
      await tx.done;
      assert.fail('tx.done should have rejected');
    } catch (error) {
      assert.strictEqual((error as DOMException).name, 'ConstraintError');
    }
  });
});
