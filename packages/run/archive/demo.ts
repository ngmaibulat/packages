import { spawn, exec, execFile } from "node:child_process";

const program = "ls";
const args = ["-l", "-a"];

const cmd = spawn(program, args, { stdio: "inherit" });

exec("ls -la", (error, stdout, stderr) => {
    if (error) {
        console.error(`Error: ${error.message}`);
        return;
    }
    console.log(stdout);
});

const process = execFile(program, args, (error, stdout, stderr) => {
    if (error) {
        console.error(`Error: ${error.message}`);
        return;
    }
    console.log(stdout);
});

process.on("exit", (code) => {
    console.log(`Process exited with code: ${code}`);
    console.log(process.exitCode);
    console.log(process.pid);
    console.log(process.spawnfile);
    console.log(process.spawnargs);
});
