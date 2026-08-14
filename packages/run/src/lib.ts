import path from "node:path";
import { runSpawn, runVT } from "./librun";
import { getLogDir, getLogFile, getLogFileName } from "./logging/logging";
import { DBLog } from "@/logging/dblog";
import { WebLog } from "@/logging/weblog";

export async function run(
    cmd: string,
    args: string[],
    clean = false,
    envfile = ""
) {
    if (clean) {
        cleanVars();
    }

    let envFullPath = "";

    const dotenv = await import("dotenv");
    if (envfile) {
        dotenv.config({ path: envfile });
        envFullPath = path.resolve(envfile);
    } else {
        dotenv.config();
    }

    const uuid = crypto.randomUUID();

    const logDir = await getLogDir();
    const db = new DBLog(logDir);

    const logFile = getLogFileName(cmd);
    const logPath = `${logDir}/${logFile}`;

    const rc = await runVT(cmd, args, logPath, uuid);
    const cwd = process.cwd();

    db.insertLog(cwd, cmd, args, logFile, envFullPath, rc);

    if (process.env.NGM_LOG_URL) {
        const weblogger = new WebLog(process.env.NGM_LOG_URL);
        await weblogger.insertLog(cwd, cmd, args, envFullPath, rc, uuid);
    }
}

export function cleanVars() {
    const keep = new Set(["PATH", "HOME", "SHELL"]);
    const envKeys = Object.keys(process.env);

    for (const key of envKeys) {
        const allowed = keep.has(key);

        if (!allowed) {
            delete process.env[key];
        }
    }
}

async function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runMultiple(
    program: string,
    args: string[],
    clean = false,
    envfile = "",
    runs = 1,
    pause = 0
) {
    const result = [];

    for (let i = 0; i < runs; i++) {
        const cmd = await run(program, args, clean, envfile);
        result.push(cmd);
        console.log("\n");

        if (pause) {
            await sleep(pause * 1000);
        }
    }

    return result;
}

export async function runForever(
    program: string,
    args: string[],
    clean = false,
    envfile = "",
    pause = 0
) {
    while (true) {
        const cmd = await run(program, args, clean, envfile);
        console.log("\n");

        if (pause) {
            await sleep(pause * 1000);
        }
    }
}
