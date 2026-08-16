import { exceptions } from '../errors/errors.ts';
import { isArray } from '../functions/utils.ts';
import type { DbSchema, IndexSpec, TableSchema } from '../types/schema.ts';

/**
 * The `stores()` schema DSL.
 *
 *   "++id, name, &email, *tags, [first+last]"
 *
 * The first entry (before the first comma) is the primary key; everything after
 * is a secondary index.
 *
 *   ++id        auto-incrementing inbound primary key
 *   ++          auto-incrementing OUTBOUND primary key (keyPath null)
 *   id          inbound, non-auto primary key
 *   <empty>     outbound primary key -- a leading comma, ",name,age"
 *   &email      unique index
 *   *tags       multiEntry index, for array-valued properties
 *   [a+b]       compound index; keyPath becomes ['a','b']
 *   &[a+b]      unique compound index
 *   name:Type   typed index; the suffix is kept but ignored by core
 *
 * A table mapped to `null` in the spec is deleted.
 */

const SchemaError = exceptions['Schema']!;

/** Render a keyPath back into its canonical source form. */
function nameFromKeyPath(keyPath: string | string[] | null | undefined): string {
    return typeof keyPath === 'string'
        ? keyPath
        : keyPath
          ? `[${keyPath.join('+')}]`
          : '';
}

export function createIndexSpec(
    name: string,
    keyPath: string | string[] | null,
    unique: boolean,
    multi: boolean,
    auto: boolean,
    compound: boolean,
    isPrimKey: boolean,
    type?: string,
): IndexSpec {
    return {
        name,
        keyPath,
        unique,
        multi,
        auto,
        compound,
        // Regenerated rather than echoed, so `src` is canonical regardless of
        // how the caller spaced or ordered the prefixes.
        src:
            (unique && !isPrimKey ? '&' : '') +
            (multi ? '*' : '') +
            (auto ? '++' : '') +
            nameFromKeyPath(keyPath),
        type,
    };
}

/** Parse one table's spec string into its primary key and secondary indexes. */
export function parseIndexSyntax(primKeyAndIndexes: string): IndexSpec[] {
    return primKeyAndIndexes.split(',').map((rawIndex, indexNum) => {
        const typeSplit = rawIndex.split(':');
        const type = typeSplit[1]?.trim();
        const index = typeSplit[0]!.trim();

        const name = index.replace(/([&*]|\+\+)/g, '');
        const keyPath = /^\[/.test(name)
            ? name.match(/^\[(.*)\]$/)![1]!.split('+')
            : name;

        return createIndexSpec(
            name,
            keyPath || null,
            /&/.test(index),
            /\*/.test(index),
            /\+\+/.test(index),
            isArray(keyPath),
            indexNum === 0,
            type,
        );
    });
}

export function createTableSchema(
    name: string,
    primKey: IndexSpec,
    indexes: IndexSpec[],
): TableSchema {
    const idxByName: Record<string, IndexSpec> = {};
    for (const index of indexes) {
        idxByName[index.name] = index;
    }
    return { name, primKey, indexes, idxByName };
}

/**
 * Turn a whole `stores()` spec into a DbSchema, validating as it goes.
 *
 * The validation is upstream's, and each rule exists because the alternative is
 * a confusing IndexedDB error much later: IDB happily accepts a multiEntry
 * primary key at `createObjectStore` time and fails on the first write.
 */
export function parseStoresSpec(
    stores: Record<string, string | null>,
    outSchema: DbSchema,
): void {
    for (const tableName of Object.keys(stores)) {
        const spec = stores[tableName];
        if (spec === null || spec === undefined) continue; // a dropped table

        const indexes = parseIndexSyntax(spec);
        const primKey = indexes.shift();

        if (!primKey) {
            throw new SchemaError(
                `Invalid schema for table ${tableName}: ${spec}`,
            );
        }

        // A primary key is unique by definition; the `&` is neither required
        // nor meaningful there.
        primKey.unique = true;

        if (primKey.multi) {
            throw new SchemaError(
                `Primary key cannot be multiEntry* (table: ${tableName})`,
            );
        }

        for (const index of indexes) {
            if (index.auto) {
                throw new SchemaError(
                    `Only primary key can be marked as autoIncrement (++) (table: ${tableName})`,
                );
            }
            if (!index.name) {
                throw new SchemaError(
                    `Index must have a name and cannot be an empty string (table: ${tableName})`,
                );
            }
        }

        outSchema[tableName] = createTableSchema(tableName, primKey, indexes);
    }
}
