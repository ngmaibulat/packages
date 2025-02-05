#!/bin/env -S node --no-warnings

import { existsSync, readFileSync } from "node:fs";
import { DBLog } from "./dblog";
import { getLogDir, pad } from "./logging";

const argCount = process.argv.length;

if (argCount < 3) {
    console.error("Usage: output <logid>");
    process.exit(1);
}

const id = Number.parseInt(process.argv[2]);

const logDir = await getLogDir();
const db = new DBLog(logDir);

const row = db.getOne(id);

if (!row) {
    console.error("Log entry not found:", id);
    process.exit(2);
}

const outputFile = row.output;
const outputPath = `${logDir}/${outputFile}`;

if (!existsSync(outputPath)) {
    console.error("Output file not found:", outputPath);
    process.exit(3);
}

try {
    const content = readFileSync(outputPath, "utf8");
    console.log(content);
} catch (error) {
    console.error("Error reading output file:", error);
    process.exit(4);
}
