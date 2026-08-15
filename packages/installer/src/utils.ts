export function isRoot() {
    if (typeof process.getuid != "function") {
        return false;
    }

    const uid = process.getuid();

    if (uid) {
        return false;
    }

    return true;
}

export function genPassword(passwordLength: number) {
    const chars = "0123456789abcdefghijklmnopqrstuvwxyz!@#$%^&*()ABCDEFGHIJKLMNOPQRSTUVWXYZ";

    let password = "";
    for (let i = 0; i <= passwordLength; i++) {
        const randomNumber = Math.floor(Math.random() * chars.length);
        password += chars.substring(randomNumber, randomNumber + 1);
    }

    return password;
}

export function genSql(rootPw: string, approPw: string, apprwPw: string, dbname: string, filename: string) {
    const sql = `
    drop database if exists test;
    create database if not exists ${dbname};

    drop user if exists appro;
    drop user if exists apprw;

    create user appro identified with caching_sha2_password by '${approPw}';
    create user apprw identified with caching_sha2_password by '${apprwPw}';

    GRANT SELECT ON ${dbname}.* TO appro@'%';
    GRANT ALL PRIVILEGES ON ${dbname}.* TO apprw@'%';

    alter user root@localhost IDENTIFIED WITH caching_sha2_password BY '${rootPw}';

    select host, user from mysql.user;
    `;

    const fstream = fs.writeFileSync(filename, sql);
}

export function createEnv(dbname: string, user: string, pass: string): string {
    //create .env

    const out = `
DB_DRIVER = "mysql2"
DB_HOST = "127.0.0.1"
DB_PORT = "3306"
DB_USER = "${user}"
DB_PASS = "${pass}"
DB_NAME = "${dbname}"
`;
    return out;
}

export function genKnex() {
    const tpl = `

    import knexpkg from "knex";
    import dotenv from "dotenv";

    dotenv.config();

    export const dbinfo = {
        driver: process.env.DB_DRIVER,
        host: process.env.DB_HOST,
        port: parseInt(process.env.DB_PORT || "3306"),
        name: process.env.DB_NAME,
        user: process.env.DB_USER,
        pass: process.env.DB_PASS,
    };

    export const db = knexpkg.knex({
        client: dbinfo.driver,
        connection: {
            host: dbinfo.host,
            port: dbinfo.port,
            user: dbinfo.user,
            password: dbinfo.pass,
            database: dbinfo.name,
        },
    });

    `;

    return tpl;
}
