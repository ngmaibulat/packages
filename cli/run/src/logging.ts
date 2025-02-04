import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";

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

export async function getLogDir() {
    const logDir = path.join(os.homedir(), ".local", "state", "ngm", "logs");
    await fs.mkdir(logDir, { recursive: true });

    return logDir;
}

export async function getLogFile(cmd: string) {
    const logDir = await getLogDir();
    const filename = `run-${formatDateTime()}-${cmd}.log`;
    const logPath = `${logDir}/${filename}`;

    return logPath;
}
