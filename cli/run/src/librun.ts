import fs from "node:fs/promises";

import { VT } from "./vt";
import { getLogFile } from "./logging";

export async function runVT(cmd: string, args: string[]) {
    //get Log Path
    const logPath = await getLogFile(cmd);

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
}

export async function runSpawn(cmd: string, args: string[]) {
    const child_process = await import("node:child_process");
    const spawn = child_process.spawn;

    return spawn(cmd, args, { stdio: "inherit" });
}
