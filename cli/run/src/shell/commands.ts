import type readline from "node:readline";

export type Handler = (args: string[], rl: readline.Interface) => number;

export function exit(args: string[], rl: readline.Interface): number {
    console.log("Exiting...");
    rl.close();
    process.exit(0);
    return 0;
}

export function pwd(args: string[], rl: readline.Interface): number {
    const cwd = process.cwd();
    console.log(cwd);
    return 0;
}

export function cd(args: string[], rl: readline.Interface): number {
    if (args.length !== 1) {
        console.log("Usage: cd <dir>");
        return 1;
    }

    const dst = args[0];
    // check: Is Directory
    // chdir
    process.chdir(dst);
    return 0;
}

const mapCommands = new Map<string, Handler>();

mapCommands.set("exit", exit);
mapCommands.set("pwd", pwd);
mapCommands.set("cd", cd);

export { mapCommands };
