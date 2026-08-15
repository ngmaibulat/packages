import type { Knex } from "knex";

import { db } from "./db.js";

export async function schemaCreated() {
    const tableExists = await db.schema.hasTable("users");

    return tableExists;
}

export async function init() {
    const tableExists = await db.schema.hasTable("users");

    if (tableExists) {
        console.log("table exists: users");
        process.exit(1);
    }

    await db.schema.createTable("users", function (table: Knex.TableBuilder) {
        table.increments();
        table.string("email").unique();
        table.string("hash");
        table.timestamps(true, true);
    });
}
