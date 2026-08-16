import { createIndexSpec, createTableSchema } from './schema-parser.ts';
import { isArray } from '../functions/utils.ts';
import type { DbSchema, IndexSpec, TableSchema } from '../types/schema.ts';

/**
 * Read a schema back out of a database that is already there.
 *
 * This is what makes a dynamic open possible: `new Nexie(name)` with no
 * `version().stores()` at all, opened to inspect a database somebody else
 * created. The declared-schema path stays the normal one — you cannot upgrade a
 * schema you did not declare — but for tooling, migrations and "what is
 * actually in here", asking the database is the only honest answer.
 */

function keyPathOf(source: IDBObjectStore | IDBIndex): string | string[] | null {
    const keyPath = source.keyPath;
    if (keyPath === null || keyPath === undefined) return null;
    // A DOMStringList in some engines, a real array in others.
    return isArray(keyPath)
        ? Array.from(keyPath as ArrayLike<string>)
        : (keyPath as string);
}

function indexSpecOf(index: IDBIndex): IndexSpec {
    const keyPath = keyPathOf(index);
    return createIndexSpec(
        index.name,
        keyPath,
        index.unique,
        index.multiEntry,
        false,
        isArray(keyPath),
        false,
    );
}

export function tableSchemaFromStore(store: IDBObjectStore): TableSchema {
    const keyPath = keyPathOf(store);
    const primKey = createIndexSpec(
        typeof keyPath === 'string' ? keyPath : '',
        keyPath,
        true,
        false,
        store.autoIncrement,
        isArray(keyPath),
        true,
    );

    const indexes = Array.from(store.indexNames, (name) =>
        indexSpecOf(store.index(name)),
    );

    return createTableSchema(store.name, primKey, indexes);
}

/**
 * The whole schema, read through one transaction over every store.
 *
 * One transaction rather than one per store: `objectStore()` is only valid
 * inside a transaction, and opening several would be slower for no benefit.
 */
export function schemaFromIdb(idbdb: IDBDatabase): DbSchema {
    const schema: DbSchema = {};
    const names = Array.from(idbdb.objectStoreNames);
    if (names.length === 0) return schema;

    const trans = idbdb.transaction(names, 'readonly');
    for (const name of names) {
        schema[name] = tableSchemaFromStore(trans.objectStore(name));
    }
    // Nothing was read, so there is nothing to wait for -- but leaving it to
    // auto-commit would keep it open for the rest of the checkpoint.
    trans.abort();

    return schema;
}
