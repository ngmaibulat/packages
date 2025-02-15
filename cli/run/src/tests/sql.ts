#!/bin/env -S node --no-warnings

import { getLogDir } from "@/logging/logging";
import { DBLog } from "@/logging/dblog";

const dbdir = await getLogDir();
const db = new DBLog(dbdir);

db.insertLog(".", "ls", ["-l", "-a"], "output.txt", ".env", 0);
db.insertLog(".", "ping", ["-c", "1", "google.com"], "output.txt", ".env", 0);

const rows = db.getLogs();
console.log(rows);
