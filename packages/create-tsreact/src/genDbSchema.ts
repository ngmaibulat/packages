//One table, so that "npm run db:push" has something to create and the page
//has something to read. Drizzle infers the row types from this, which is the
//whole point - there is no second place to declare them.
export default function genDbSchema() {
    const tpl = `
import { int, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const usersTable = sqliteTable("users", {
    id: int().primaryKey({ autoIncrement: true }),
    name: text().notNull(),
    email: text().notNull().unique(),
    createdAt: text().notNull().default("CURRENT_TIMESTAMP"),
});

export type User = typeof usersTable.$inferSelect;
export type NewUser = typeof usersTable.$inferInsert;
`;

    return tpl;
}
