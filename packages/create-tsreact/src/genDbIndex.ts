//NOTE on the ?? default: without it a freshly scaffolded app cannot run
//"db:push" or "dev" until the user has written a .env, which turns a working
//template into a broken one. file:./local.db needs no service, no credentials
//and no setup - and .gitignore already covers *.db.
//
//The same URL is read by drizzle.config.ts, so the two cannot disagree about
//which database "db:push" wrote to.
export default function genDbIndex() {
    const tpl = `
import { drizzle } from "drizzle-orm/libsql";

import * as schema from "./schema";

//a local file by default; set DB_FILE_NAME to a libsql:// url (and
//DB_AUTH_TOKEN alongside it) to point at Turso instead - see .env.example
export const db = drizzle({
    connection: {
        url: process.env.DB_FILE_NAME ?? "file:./local.db",
        authToken: process.env.DB_AUTH_TOKEN,
    },
    schema,
});
`;

    return tpl;
}
