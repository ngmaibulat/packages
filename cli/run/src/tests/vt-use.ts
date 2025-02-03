#!/usr/bin/env node

import os from "node:os";
import path from "node:path";
import fs from "node:fs";

import { VT } from "../vt";

function pad(num: number) {
    return num.toString().padStart(2, "0");
}

function formatDateTime(date = new Date()) {
    const year = date.getFullYear();
    const month = pad(date.getMonth() + 1);
    const day = pad(date.getDate());
    const hours = pad(date.getHours());
    const minutes = pad(date.getMinutes());
    const seconds = pad(date.getSeconds());

    return `${year}-${month}-${day}_${hours}-${minutes}-${seconds}`;
}

function doRunLogOutput(cmd: string, params: string[]) {
    //create vt
    //run process
    //get output
    //log output
    //stdout output
}

const logDir = path.join(os.homedir(), ".local", "state", "ngm", "logs");
fs.mkdirSync(logDir, { recursive: true });

const cmd = "glow";
const args = ["README.md"];

const filename = `run-${formatDateTime()}-${cmd}.log`;
const logPath = `${logDir}/${filename}`;

console.log(logPath);

const vt = new VT();

// console.log(vt);

await vt.spawn(cmd, args);

const out = vt.output();

console.log(out);

fs.writeFileSync(logPath, out, "utf-8");
