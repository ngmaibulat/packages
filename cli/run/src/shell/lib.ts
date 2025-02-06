import type readline from "node:readline";

import path from "node:path";
import { access, constants } from "node:fs/promises";

import { mapCommands } from "@/shell/commands";
import { run } from "@/lib";

export async function checkExe(path: string): Promise<boolean> {
    try {
        await access(path, constants.X_OK);
        return true;
    } catch {
        return false;
    }
}

export async function findExe(cmd: string, envPath: string): Promise<boolean> {
    const paths = envPath.split(":");

    if (!paths.length) {
        return false;
    }

    for (const dir of paths) {
        const fullPath = path.join(dir, cmd);
        const found = await checkExe(fullPath);

        if (found) {
            return true;
        }
    }

    return false;
}

export async function getCommand(
    rl: readline.Interface,
    prompt: string
): Promise<string> {
    return new Promise((resolve, reject) => {
        rl.question(prompt, (input) => {
            resolve(input.trim().toLowerCase());
        });
    });
}

export async function runShell(rl: readline.Interface, prompt: string) {
    const cmdline = await getCommand(rl, prompt);

    if (!cmdline) {
        return;
    }

    // Advanced
    // pipes: cmd1 | cmd2
    // redirect: cmd > file.out
    // env vars: cmd $var

    // Configs in DB
    // env
    // aliases
    // functons

    // Commands
    // pwd
    // cd
    // exit
    // whoami
    // history
    // envload
    // envclean

    // split cmdline to cmd and args[]
    const splitted = cmdline.trim().split(/\s+/);
    const cmd = splitted[0];
    const args = splitted.slice(1);

    // search for built-in commands -> run, if found
    const func = mapCommands.get(cmd);

    if (func) {
        func(args, rl);
        return;
    }

    // search for executables in PATH -> run, if found
    const envPath = process.env.PATH || "";
    const found = await findExe(cmd, envPath);

    if (found) {
        // run command
        await run(cmd, args);
    } else {
        console.log(`Command Not Found: ${cmd}`);
    }
}
