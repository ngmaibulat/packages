import fs from "node:fs/promises";

import { VT } from "./vt";
import { getLogDir, getLogFile, getLogFileName } from "./logging";
import { DBLog } from "./dblog";

export async function runVT(cmd: string, args: string[]) {
    //get Log Path
    const logDir = await getLogDir();
    const db = new DBLog(logDir);
    const logFile = getLogFileName(cmd);
    const logPath = `${logDir}/${logFile}`;

    //create vt
    const vt = new VT();

    //run process
    await vt.spawn(cmd, args);

    //get output
    const out = vt.output();

    //log output
    await fs.writeFile(logPath, out, "utf-8");

    //stdout output
    console.log(out);

    db.insertLog(cmd, args, logFile);
}

export async function runSpawn(cmd: string, args: string[]) {
    const child_process = await import("node:child_process");
    const spawn = child_process.spawn;

    return spawn(cmd, args, { stdio: "inherit" });
}
