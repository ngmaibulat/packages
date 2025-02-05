#!/bin/env -S node --no-warnings

import path from "node:path";

import Table from "cli-table3";
import { DBLog } from "./dblog";
import { getLogDir, pad } from "./logging";

function formatDate(d: Date) {
    const year = d.getFullYear();
    const month = pad(d.getMonth());
    const day = pad(d.getDate());

    const hours = pad(d.getHours());
    const mins = pad(d.getMinutes());
    const sec = pad(d.getSeconds());

    return `${year}-${month}-${day} ${hours}:${mins}:${sec}`;
}

const logDir = await getLogDir();

console.log("\n");
console.log("Log Directory:", logDir);

const db = new DBLog(logDir);
const rows = db.getLogs();

// Create a new table with some settings
const table = new Table({
    head: ["ID", "Time", "Workdir", "CMD", "Args", "Env", "RC", "Output"],
    colWidths: [4, 22, 45, 20, 20, 20, 4, 40],
});

// Add rows to the table
for (let i = 0; i < rows.length; i++) {
    const row = rows[i];

    const dt = new Date(`${row.dt}Z`);
    const dateStr = formatDate(dt);

    const env = path.basename(row.envfile);

    const data = [
        row.id,
        dateStr,
        row.cwd,
        row.cmd,
        row.args,
        env,
        row.rc,
        row.output,
    ];
    table.push(data);
}

// Display the table
console.log(table.toString());
