import { DatabaseSync } from "node:sqlite";

export class DBLog {
    private db;
    private dbpath;
    private insert;

    private sql = `
    CREATE TABLE IF NOT EXISTS runlog (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        dt DATETIME DEFAULT CURRENT_TIMESTAMP,
        cmd varchar,
        args varchar,
        rt int,
        output varchar
    )`;

    private insertSQL = "insert into runlog(cmd, args, output) values(?, ?, ?)";

    constructor(dbdir: string) {
        this.dbpath = `${dbdir}/run.db`;
        this.db = new DatabaseSync(this.dbpath);
        this.db.exec(this.sql);
        this.insert = this.db.prepare(this.insertSQL);
    }

    insertLog(cmd: string, args: string[], output: string) {
        const argsJson = JSON.stringify(args);
        this.insert.run(cmd, argsJson, output);
    }

    getLogs() {
        const query = this.db.prepare("SELECT * FROM runlog ORDER BY id desc");
        const rows = query.all().map((row) => structuredClone(row));
        return rows;
    }
}
