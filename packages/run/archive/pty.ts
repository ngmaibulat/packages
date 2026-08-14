import { writeFile, appendFile } from "node:fs/promises";
import { writeFileSync, appendFileSync } from "node:fs";
import * as pty from "node-pty";

const shell = "lsd";
writeFileSync("out.txt", "\n", "utf8");

const buffer: string[] = [];

async function writeBuffer(buffer: string[], filename: string) {
    for (const data of buffer) {
        await appendFile(filename, data, "utf8");
    }
}

const ptyProcess = pty.spawn(shell, ["-l"], {
    name: "xterm-color",
    cols: 80,
    rows: 30,
    cwd: process.env.HOME,
    env: process.env,
});

ptyProcess.onData((data) => {
    // appendFileSync("out.txt", data, "utf8");
    buffer.push(data);
    process.stdout.write(data);
});

// ptyProcess.write("ls\r");
// ptyProcess.resize(100, 40);
// ptyProcess.write("ls\r");

process.stdin.setRawMode(true);
process.stdin.on("data", (data) => {
    ptyProcess.write(data.toString());
});

ptyProcess.onExit(async () => {
    await writeBuffer(buffer, "out.txt");
    process.stdin.setRawMode(false);
    process.stdin.pause(); // Stop listening for input
    // process.exit(0);
});
