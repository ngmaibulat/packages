#!/bin/env -S node --no-warnings

import { getLogDir } from "../logging";
import { DBLog } from "../dblog";

const dbdir = await getLogDir();
const db = new DBLog(dbdir);

db.insertLog("ls", ["-l", "-a"], "output.txt");
db.insertLog("ping", ["-c", "1", "google.com"], "output.txt");

const rows = db.getLogs();
console.log(rows);
