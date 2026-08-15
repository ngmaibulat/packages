//drizzle-kit runs outside Next, so it does not get Next's .env loading. Node
//reads .env on its own from 20.6 onward only when told to, so the same ??
//default as src/db/index.ts stands in - see the note there.
export default function genDrizzleConfig() {
    const tpl = `
import { defineConfig } from "drizzle-kit";

export default defineConfig({
    schema: "./src/db/schema.ts",
    out: "./drizzle",
    dialect: "turso",
    dbCredentials: {
        url: process.env.DB_FILE_NAME ?? "file:./local.db",
        authToken: process.env.DB_AUTH_TOKEN,
    },
});
`;

    return tpl;
}
