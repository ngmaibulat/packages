//Committed, unlike .env.local, which .gitignore covers. It exists to document
//the two variables rather than to be loaded - the app runs with neither set,
//see the ?? defaults in src/db/index.ts and drizzle.config.ts.
export default function genEnvExample() {
    const tpl = `
# Where the database lives. Defaults to a local sqlite file when unset, so
# nothing here is required to run the app.
#
#   local file   file:./local.db          (the default)
#   Turso        libsql://<db>.turso.io   (needs DB_AUTH_TOKEN too)
#
# Copy this file to .env.local, which is gitignored, before putting a real
# token in it.

DB_FILE_NAME=file:./local.db
DB_AUTH_TOKEN=
`;

    return tpl;
}
