import fs from "node:fs/promises";

import { VT } from "./vt";

export async function runVT(cmd: string, args: string[], logPath: string) {
    //create vt
    const vt = new VT();

    //run process
    await vt.spawn(cmd, args);

    //get output
    const out = vt.output();

    //get exit code
    const rc = vt.exitCode;

    //log output
    await fs.writeFile(logPath, out, "utf-8");

    //stdout output
    console.log(out);

    return rc;
}

export async function runSpawn(cmd: string, args: string[]) {
    const child_process = await import("node:child_process");
    const spawn = child_process.spawn;

    return spawn(cmd, args, { stdio: "inherit" });
}
