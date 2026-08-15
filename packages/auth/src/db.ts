import { knex } from "knex";
import dotenv from "dotenv";

dotenv.config();

function envHelp() {
    console.error("\nNot all ENV variables are set");

    const msg = `
    You can create file: .env
    in current directory
    And rerun.

    Please see example:

AUTH_DB_DRIVER = "mysql2"
AUTH_DB_HOST = "127.0.0.1"
AUTH_DB_PORT = "3306"
AUTH_DB_USER = "root"
AUTH_DB_PASS = "P@ssw0rd"
AUTH_DB_NAME = "userdb"
    `;

    console.log(msg);
}

function checkEnv(vars: string[]): boolean {
    //check that all env vars are set!

    for (const item of vars) {
        const value = process.env[item];
        if (!value) {
            return false;
        }
    }

    return true;
}

function runChecks() {
    const required = ["AUTH_DB_DRIVER", "AUTH_DB_HOST", "AUTH_DB_NAME", "AUTH_DB_USER"];
    const res = checkEnv(required);

    if (!res) {
        envHelp();
        process.exit(1);
    }
}

runChecks();

export const dbinfo = {
    driver: process.env.AUTH_DB_DRIVER,
    host: process.env.AUTH_DB_HOST,
    port: parseInt(process.env.AUTH_DB_PORT || "3306"),
    name: process.env.AUTH_DB_NAME,
    user: process.env.AUTH_DB_USER,
    pass: process.env.AUTH_DB_PASS,
};

export const db = knex({
    client: dbinfo.driver,
    connection: {
        host: dbinfo.host,
        port: dbinfo.port,
        user: dbinfo.user,
        password: dbinfo.pass,
        database: dbinfo.name,
    },
});
