import * as pty from "node-pty";

const shell = "bash";

const ptyProcess = pty.spawn(shell, [], {
    name: "xterm-color",
    cols: 80,
    rows: 30,
    cwd: process.env.HOME,
    env: process.env,
});

ptyProcess.onData((data) => {
    process.stdout.write(data);
});

// ptyProcess.write("ls\r");
// ptyProcess.resize(100, 40);
// ptyProcess.write("ls\r");

process.stdin.setRawMode(true);
process.stdin.on("data", (data) => {
    ptyProcess.write(data.toString());
});

ptyProcess.onExit(() => {
    process.stdin.setRawMode(false);
    process.stdin.pause(); // Stop listening for input
    process.exit(0);
});
