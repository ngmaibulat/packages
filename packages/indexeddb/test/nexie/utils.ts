import '@aibulat/indexeddb-impl/auto';

import { Nexie } from '../../src/nexie/classes/nexie.ts';

export interface Friend {
    id?: number;
    name: string;
    age: number;
    email?: string;
}

let counter = 0;

/** A uniquely named database, so tests never collide. */
export function freshName(prefix = 'nexie'): string {
    return `${prefix}-${++counter}-${Math.trunc(performance.now() * 1000)}`;
}

export interface FriendsDb extends Nexie {
    friends: import('../../src/nexie/classes/table.ts').Table<Friend, number>;
}

/** The standard fixture: one auto-incrementing table with three indexes. */
export function friendsDb(stores = '++id, name, age, &email'): FriendsDb {
    const db = new Nexie(freshName()) as FriendsDb;
    db.version(1).stores({ friends: stores });
    return db;
}

/** Close and delete, for use in a test's teardown. */
export async function dispose(db: Nexie): Promise<void> {
    try {
        await db.delete();
    } catch {
        // A test that already deleted the db is not a failure.
    }
}

export { Nexie };
