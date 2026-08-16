import type { Nexie } from './nexie.ts';
import type { Table } from './table.ts';

/**
 * Optional base class for records mapped with `mapToClass`.
 *
 * Extending it gives instances a `db` and a `table()` so a record can act on
 * itself. The constructor is protected because instances come from the database
 * -- `Object.create(prototype)` plus a property copy -- never from `new`.
 */
export abstract class Entity {
    // Assigned by mapToClass on the generated subclass, per database.
    declare readonly db: Nexie;

    protected constructor() {
        throw new Error(
            'Entity is not constructible directly; it is applied to records read from the database.',
        );
    }

    table(): Table {
        return this.db.table((this.constructor as { tableName?: string })
            .tableName as string);
    }
}
