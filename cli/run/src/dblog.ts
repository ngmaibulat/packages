import { DatabaseSync } from "node:sqlite";

export type LogRecord = {
    id: number;
    dt: string;
    cwd: string;
    cmd: string;
    args: string;
    envfile: string;
    rc: number;
    output: string;
};

export class DBLog {
    private db;
    private dbpath;
    private insert;

    private sql = `
    CREATE TABLE IF NOT EXISTS runlog (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        dt DATETIME DEFAULT CURRENT_TIMESTAMP,
        cwd varchar,
        cmd varchar,
        args varchar,
        envfile varchar,
        rc int,
        output varchar
    )`;

    private insertSQL =
        "insert into runlog(cwd, cmd, args, envfile, rc, output) values(?, ?, ?, ?, ?, ?)";

    constructor(dbdir: string) {
        this.dbpath = `${dbdir}/run.db`;
        this.db = new DatabaseSync(this.dbpath);
        this.db.exec(this.sql);
        this.insert = this.db.prepare(this.insertSQL);
    }

    insertLog(
        cwd: string,
        cmd: string,
        args: string[],
        output: string,
        envfile: string,
        rc: number
    ) {
        const argsJson = JSON.stringify(args);
        this.insert.run(cwd, cmd, argsJson, envfile, rc, output);
    }

    getLogs() {
        const query = this.db.prepare("SELECT * FROM runlog ORDER BY id desc");
        const rows = query.all().map((row) => structuredClone(row));
        return rows as LogRecord[];
    }

    getOne(id: number) {
        const query = this.db.prepare("SELECT * FROM runlog where id = ?");
        const row = query.get(id);
        return row as LogRecord;
    }
}
