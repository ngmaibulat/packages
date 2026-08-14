import test from "node:test";
import assert from "node:assert/strict";

import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";

import { DBLog } from "@/logging/dblog";

async function tempDB() {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "run-dblog-"));
    return { dir, db: new DBLog(dir) };
}

test("constructor creates run.db and the runlog table", async (t) => {
    const { dir, db } = await tempDB();
    t.after(() => fs.rm(dir, { recursive: true, force: true }));

    assert.ok(existsSync(path.join(dir, "run.db")));
    assert.deepEqual(db.getLogs(), [], "a fresh database has no rows");
});

test("insertLog round-trips a record", async (t) => {
    const { dir, db } = await tempDB();
    t.after(() => fs.rm(dir, { recursive: true, force: true }));

    db.insertLog("/work", "ls", ["-l", "-a"], "run-1.log", "/work/.env", 0);

    const rows = db.getLogs();
    assert.equal(rows.length, 1);

    const row = rows[0];
    assert.equal(row.cwd, "/work");
    assert.equal(row.cmd, "ls");
    assert.equal(row.envfile, "/work/.env");
    assert.equal(row.rc, 0);
    assert.equal(
        row.output,
        "run-1.log",
        "the output column stores the log file name, not the output itself"
    );
    assert.deepEqual(JSON.parse(row.args), ["-l", "-a"], "args are stored as JSON");
    assert.ok(row.id > 0);
    assert.ok(row.dt, "dt is defaulted by sqlite");
});

test("getLogs returns newest first", async (t) => {
    const { dir, db } = await tempDB();
    t.after(() => fs.rm(dir, { recursive: true, force: true }));

    db.insertLog(".", "first", [], "a.log", "", 0);
    db.insertLog(".", "second", [], "b.log", "", 1);
    db.insertLog(".", "third", [], "c.log", "", 2);

    assert.deepEqual(
        db.getLogs().map((row) => row.cmd),
        ["third", "second", "first"]
    );
});

test("insertLog preserves a non-zero exit code", async (t) => {
    const { dir, db } = await tempDB();
    t.after(() => fs.rm(dir, { recursive: true, force: true }));

    db.insertLog(".", "false", [], "a.log", "", 42);
    assert.equal(db.getLogs()[0].rc, 42);
});

test("getOne looks a record up by id", async (t) => {
    const { dir, db } = await tempDB();
    t.after(() => fs.rm(dir, { recursive: true, force: true }));

    db.insertLog(".", "ping", ["-c", "1"], "ping.log", "", 0);
    const id = db.getLogs()[0].id;

    const row = db.getOne(id);
    assert.equal(row.cmd, "ping");
    assert.equal(row.output, "ping.log");

    assert.equal(db.getOne(9999), undefined, "an unknown id yields no row");
});

test("a second DBLog on the same dir sees existing rows", async (t) => {
    const { dir, db } = await tempDB();
    t.after(() => fs.rm(dir, { recursive: true, force: true }));

    db.insertLog(".", "ls", [], "a.log", "", 0);

    const reopened = new DBLog(dir);
    assert.equal(reopened.getLogs().length, 1, "CREATE TABLE IF NOT EXISTS is reused");
});
