/**
 * Nexie -- the high-level, Dexie-shaped API.
 *
 *   import Nexie from '@aibulat/indexeddb/nexie';
 *
 *   const db = new Nexie('MyDB');
 *   db.version(1).stores({ friends: '++id, name, age' });
 *   await db.friends.add({ name: 'Alice', age: 30 });
 *
 * Migration from Dexie is a rename and nothing else: the schema DSL, the
 * transaction modes, the error `name` strings and the method signatures are all
 * unchanged. Dexie-branded identifiers are not -- `DexieError` is `NexieError`
 * here, and so on.
 *
 * This entry is deliberately disjoint from the package's low-level `.` entry:
 * nothing here imports `src/entry.ts` or `src/wrap-idb-value.ts`, so tsdown
 * emits no shared chunk and `dist/index.js` is unaffected by anything in this
 * graph. See src/nexie/dbcore/request.ts for why that separation is required
 * rather than merely tidy.
 */

export { Nexie } from './nexie/classes/nexie.ts';
export { Nexie as default } from './nexie/classes/nexie.ts';

export { Table } from './nexie/classes/table.ts';
export { Transaction } from './nexie/classes/transaction.ts';
export { Version } from './nexie/classes/version.ts';
export { Collection } from './nexie/classes/collection.ts';
export { WhereClause } from './nexie/classes/where-clause.ts';
export { Entity } from './nexie/classes/entity.ts';

export { cmp } from './nexie/functions/cmp.ts';
export {
    PropModification,
    add,
    remove,
    replacePrefix,
} from './nexie/functions/prop-modification.ts';

export {
    NexieError,
    errnames,
    exceptions,
    mapError,
} from './nexie/errors/errors.ts';

export { NexiePromise } from './nexie/zone/nexie-promise.ts';

export type {
    NexieOptions,
    NexieDependencies,
} from './nexie/classes/nexie.ts';
export type { BulkOptions } from './nexie/classes/table.ts';
export type { Addon } from './nexie/classes/nexie.ts';
export type { TableHooks } from './nexie/hooks/hooks-middleware.ts';
export type { NexieEvent, NexieEventSet } from './nexie/functions/events.ts';
export type {
    DBCore,
    DBCoreTable,
    DBCoreMutateRequest,
    DBCoreMutateResponse,
    Middleware,
} from './nexie/types/dbcore.ts';
export type { UpdateSpec } from './nexie/functions/prop-modification.ts';
export type {
    CollectionContext,
    CursorAlgorithm,
} from './nexie/classes/collection.ts';
export type { TransactionMode } from './nexie/types/transaction.ts';
export type {
    DbSchema,
    IndexableType,
    IndexableTypeArray,
    IndexableTypeArrayReadonly,
    IndexSpec,
    TableSchema,
} from './nexie/types/schema.ts';
